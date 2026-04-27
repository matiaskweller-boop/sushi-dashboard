import { NextRequest, NextResponse } from "next/server";
import { verifySession, getSessionFromRequest } from "@/lib/auth";
import { getProducts, getCategories } from "@/lib/fudo-client";
import { SUCURSALES } from "@/lib/sucursales";
import { getCanonicalName, getNormalizedKey, getCanonicalCategory } from "@/lib/product-aliases";

// Category mapping for the manager's requested groups
const STOCK_CATEGORIES: Record<string, string[]> = {
  "Vinos Blancos": ["blanco", "vinos blancos"],
  "Vinos Tintos": ["tinto", "vinos tintos", "vinos"],
  "Vinos Rosados": ["rosado", "rose", "vinos rosados"],
  Espumantes: ["espumante", "espumantes"],
  Cervezas: ["cervezas"],
  Gaseosas: ["gaseosas"],
  Aguas: ["aguas"],
  Tragos: ["tragos", "bebidas alcoholicas", "mocktails"],
  "Vinos por Copa": ["copa", "vino por copa", "vinos por copa"],
  Postres: ["postres"],
  Infusiones: ["infusiones"],
  Sake: ["sake"],
  Whisky: ["whisky", "medida", "medidas"],
};

function normalizeCategory(name: string): string {
  const norm = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

  for (const [group, aliases] of Object.entries(STOCK_CATEGORIES)) {
    if (aliases.includes(norm)) return group;
  }
  return getCanonicalCategory(name);
}

interface StockProduct {
  name: string;
  price: number;
  stock: number | null;
  stockControl: boolean;
  sucursales: { id: string; stock: number | null; stockControl: boolean }[];
}

export async function GET(request: NextRequest) {
  const token = getSessionFromRequest(request);
  if (!token) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const session = await verifySession(token);
  if (!session) {
    return NextResponse.json({ error: "Sesion expirada" }, { status: 401 });
  }

  try {
    // Fetch products and categories from all sucursales in parallel
    const results = await Promise.all(
      SUCURSALES.map(async (suc) => {
        const [products, categories] = await Promise.all([
          getProducts(suc),
          getCategories(suc).catch(() => []),
        ]);

        const catMap = new Map<string, string>();
        categories.forEach((c) => catMap.set(c.id, c.name));

        return { sucursalId: suc.id, sucursalName: suc.name, products, catMap };
      })
    );

    // Merge products across sucursales, normalize and group
    const productMap = new Map<string, StockProduct & { category: string }>();

    for (const { sucursalId, products, catMap } of results) {
      for (const p of products) {
        if (!p.active) continue;

        const key = getNormalizedKey(p.name);
        const canonicalName = getCanonicalName(p.name);
        const rawCategory = p.categoryId ? catMap.get(p.categoryId) || "Sin categoria" : "Sin categoria";
        const category = normalizeCategory(rawCategory);

        if (!productMap.has(key)) {
          productMap.set(key, {
            name: canonicalName,
            category,
            price: p.price || 0,
            stock: p.stock,
            stockControl: p.stockControl,
            sucursales: [{ id: sucursalId, stock: p.stock, stockControl: p.stockControl }],
          });
        } else {
          const existing = productMap.get(key)!;
          existing.sucursales.push({ id: sucursalId, stock: p.stock, stockControl: p.stockControl });
          // Use highest price
          if ((p.price || 0) > existing.price) {
            existing.price = p.price || 0;
          }
          // Aggregate stock: if any sucursal has stockControl, show combined
          if (p.stockControl) existing.stockControl = true;
          if (p.stock !== null) {
            existing.stock = (existing.stock || 0) + p.stock;
          }
        }
      }
    }

    // Group by category
    const categoryGroups: Record<string, StockProduct[]> = {};

    for (const product of Array.from(productMap.values())) {
      const cat = product.category;
      if (!categoryGroups[cat]) categoryGroups[cat] = [];
      categoryGroups[cat].push({
        name: product.name,
        price: product.price,
        stock: product.stock,
        stockControl: product.stockControl,
        sucursales: product.sucursales,
      });
    }

    // Sort products within each category by name
    for (const cat of Object.keys(categoryGroups)) {
      categoryGroups[cat].sort((a, b) => a.name.localeCompare(b.name));
    }

    // Order categories by the manager's preferred order, then alphabetical
    const preferredOrder = Object.keys(STOCK_CATEGORIES);
    const sortedCategories = Object.entries(categoryGroups).sort(([a], [b]) => {
      const idxA = preferredOrder.indexOf(a);
      const idxB = preferredOrder.indexOf(b);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.localeCompare(b);
    });

    const data = {
      categories: sortedCategories.map(([name, products]) => ({
        name,
        count: products.length,
        withStock: products.filter((p) => p.stockControl).length,
        totalStock: products.reduce((s, p) => s + (p.stock || 0), 0),
        products,
      })),
      totalProducts: productMap.size,
      totalWithStock: Array.from(productMap.values()).filter((p) => p.stockControl).length,
      lastUpdated: new Date().toISOString(),
    };

    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "private, max-age=300", // 5 min cache
      },
    });
  } catch (error) {
    console.error("Error obteniendo stock:", error);
    return NextResponse.json(
      {
        error: "Error al obtener stock",
        details: error instanceof Error ? error.message : "Error desconocido",
      },
      { status: 500 }
    );
  }
}
