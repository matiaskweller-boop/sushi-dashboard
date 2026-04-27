import { NextRequest, NextResponse } from "next/server";
import { verifySession, getSessionFromRequest } from "@/lib/auth";
import { getProducts, getCategories, patchProduct, createProduct } from "@/lib/fudo-client";
import { SUCURSALES } from "@/lib/sucursales";
import { getNormalizedKey, getCanonicalCategory } from "@/lib/product-aliases";

interface ProductBySucursal {
  id: string;
  name: string;
  price: number;
  active: boolean;
  stock: number | null;
  stockControl: boolean;
  category: string;
  rawCategory: string;
}

interface MergedProduct {
  normalizedKey: string;
  canonicalName: string;
  category: string;
  hasInconsistentNames: boolean;
  sucursales: Record<string, ProductBySucursal>;
}

/**
 * GET: List all products grouped by normalized name,
 * showing per-sucursal details and inconsistencies.
 */
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
    const results = await Promise.all(
      SUCURSALES.map(async (suc) => {
        const [products, categories] = await Promise.all([
          getProducts(suc),
          getCategories(suc).catch(() => []),
        ]);
        const catMap = new Map<string, string>();
        categories.forEach((c) => catMap.set(c.id, c.name));
        return { sucursalId: suc.id, products, catMap };
      })
    );

    const productMap = new Map<string, MergedProduct>();

    for (const { sucursalId, products, catMap } of results) {
      for (const p of products) {
        const key = getNormalizedKey(p.name);
        const rawCat = p.categoryId ? catMap.get(p.categoryId) || "Sin categoria" : "Sin categoria";
        const category = getCanonicalCategory(rawCat);

        const sucData: ProductBySucursal = {
          id: p.id,
          name: p.name,
          price: p.price || 0,
          active: p.active,
          stock: p.stock,
          stockControl: p.stockControl,
          category,
          rawCategory: rawCat,
        };

        if (!productMap.has(key)) {
          productMap.set(key, {
            normalizedKey: key,
            canonicalName: p.name,
            category,
            hasInconsistentNames: false,
            sucursales: { [sucursalId]: sucData },
          });
        } else {
          const existing = productMap.get(key)!;
          existing.sucursales[sucursalId] = sucData;
          // Check if names differ
          const names = new Set(
            Object.values(existing.sucursales).map((s) => s.name)
          );
          existing.hasInconsistentNames = names.size > 1;
        }
      }
    }

    const products = Array.from(productMap.values()).sort((a, b) =>
      a.canonicalName.localeCompare(b.canonicalName)
    );

    const inconsistentCount = products.filter(
      (p) => p.hasInconsistentNames
    ).length;

    return NextResponse.json({
      products,
      totalProducts: products.length,
      inconsistentCount,
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error listing products:", error);
    return NextResponse.json(
      { error: "Error al listar productos", details: error instanceof Error ? error.message : "Error desconocido" },
      { status: 500 }
    );
  }
}

/**
 * PATCH: Update product name/price across sucursales.
 * Body: { updates: [{ sucursalId, productId, changes: { name?, price? } }] }
 */
export async function PATCH(request: NextRequest) {
  const token = getSessionFromRequest(request);
  if (!token) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const session = await verifySession(token);
  if (!session) {
    return NextResponse.json({ error: "Sesion expirada" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { updates } = body as {
      updates: Array<{
        sucursalId: string;
        productId: string;
        changes: { name?: string; price?: number };
      }>;
    };

    if (!updates || !Array.isArray(updates) || updates.length === 0) {
      return NextResponse.json(
        { error: "No updates provided" },
        { status: 400 }
      );
    }

    // Safety: max 10 updates per request
    if (updates.length > 10) {
      return NextResponse.json(
        { error: "Too many updates (max 10)" },
        { status: 400 }
      );
    }

    const results: Array<{
      sucursalId: string;
      productId: string;
      success: boolean;
      error?: string;
    }> = [];

    // Process sequentially per sucursal to respect rate limits
    const bySucursal = new Map<string, typeof updates>();
    for (const u of updates) {
      if (!bySucursal.has(u.sucursalId)) bySucursal.set(u.sucursalId, []);
      bySucursal.get(u.sucursalId)!.push(u);
    }

    // Process all sucursales in parallel, but sequentially within each
    await Promise.all(
      Array.from(bySucursal.entries()).map(async ([sucursalId, sucUpdates]) => {
        const sucursal = SUCURSALES.find((s) => s.id === sucursalId);
        if (!sucursal) {
          sucUpdates.forEach((u) =>
            results.push({
              sucursalId,
              productId: u.productId,
              success: false,
              error: "Sucursal not found",
            })
          );
          return;
        }

        for (const u of sucUpdates) {
          // Only allow name and price changes (active is read-only in Fudo API)
          const safeChanges: { name?: string; price?: number } = {};
          if (u.changes.name !== undefined) safeChanges.name = u.changes.name;
          if (u.changes.price !== undefined) safeChanges.price = u.changes.price;

          const result = await patchProduct(sucursal, u.productId, safeChanges);
          results.push({
            sucursalId,
            productId: u.productId,
            success: result.success,
            error: result.error,
          });
        }
      })
    );

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;

    return NextResponse.json({
      results,
      summary: {
        total: results.length,
        success: successCount,
        failed: failCount,
      },
    });
  } catch (error) {
    console.error("Error updating products:", error);
    return NextResponse.json(
      { error: "Error al actualizar productos", details: error instanceof Error ? error.message : "Error desconocido" },
      { status: 500 }
    );
  }
}

/**
 * POST: Create a new product in selected sucursales.
 * Body: { name: string, price: number, sucursales: string[], categoryId: string, confirmed: boolean }
 *
 * IMPORTANT: This endpoint creates ONE product concept at a time.
 * The sucursales array specifies which sucursales to create it in (max 3, one per sucursal).
 * Each creation must be explicitly confirmed by a human (confirmed: true).
 */
// ⚠️ SAFETY: Creating products without category crashed the Fudo POS app for ALL users.
// NEVER create products without categoryId. NEVER batch-create products.
// Each creation must be confirmed individually by a human (confirmed: true).
export async function POST(request: NextRequest) {
  const token = getSessionFromRequest(request);
  if (!token) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const session = await verifySession(token);
  if (!session) {
    return NextResponse.json({ error: "Sesion expirada" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { name, price, sucursales: targetSucursales, categoryId, confirmed } = body as {
      name: string;
      price: number;
      sucursales: string[];
      categoryId: string;
      confirmed: boolean;
    };

    // SAFETY: Require explicit human confirmation before creating any product
    if (confirmed !== true) {
      return NextResponse.json(
        { error: "Se requiere confirmación explícita para crear productos. Enviar confirmed: true" },
        { status: 400 }
      );
    }

    // SAFETY: categoryId is MANDATORY — products without category crash the Fudo POS app
    if (!categoryId) {
      return NextResponse.json(
        { error: "Categoría obligatoria. Todos los productos deben tener una categoría asignada." },
        { status: 400 }
      );
    }

    if (!name || !price || !targetSucursales || targetSucursales.length === 0) {
      return NextResponse.json(
        { error: "Faltan datos: name, price, sucursales, categoryId" },
        { status: 400 }
      );
    }

    // SAFETY: Only allow creating in up to 3 sucursales (one product concept per call)
    if (targetSucursales.length > 3) {
      return NextResponse.json(
        { error: "Máximo 3 sucursales por producto (una entrada por sucursal)" },
        { status: 400 }
      );
    }

    const results: Array<{
      sucursalId: string;
      success: boolean;
      productId?: string;
      error?: string;
    }> = [];

    // Create in each selected sucursal sequentially
    for (const sucursalId of targetSucursales) {
      const sucursal = SUCURSALES.find((s) => s.id === sucursalId);
      if (!sucursal) {
        results.push({ sucursalId, success: false, error: "Sucursal not found" });
        continue;
      }

      const code = `${name.substring(0, 20).replace(/[^a-zA-Z0-9]/g, "_")}_${sucursalId}_${Date.now()}`;
      const result = await createProduct(sucursal, { name, price, code, categoryId });
      results.push({
        sucursalId,
        success: result.success,
        productId: result.productId,
        error: result.error,
      });
    }

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;

    return NextResponse.json({
      results,
      summary: { total: results.length, success: successCount, failed: failCount },
    });
  } catch (error) {
    console.error("Error creating product:", error);
    return NextResponse.json(
      { error: "Error al crear producto", details: error instanceof Error ? error.message : "Error desconocido" },
      { status: 500 }
    );
  }
}
