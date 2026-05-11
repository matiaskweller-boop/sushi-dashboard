import { NextRequest, NextResponse } from "next/server";
import { verifySession, getSessionFromRequest } from "@/lib/auth";
import { getProducts, patchProduct } from "@/lib/fudo-client";
import { SUCURSALES } from "@/lib/sucursales";

const PROXY_BASE = "https://fudo-test.matiaskweller.workers.dev";
const PROXY_SECRET = "masunori-fudo-proxy-2026";

function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();
}

interface MenuItem {
  id: string;
  name: string;
  price: number;
  description?: string;
  tag?: string;
  fudoMatch?: string;
}

interface MenuSection {
  id: string;
  title: string;
  subtitle?: string;
  items: MenuItem[];
}

interface MenuPage {
  id: string;
  title: string;
  sections: MenuSection[];
}

interface MenuData {
  version: string;
  pages: MenuPage[];
}

async function readMenuFromKV(): Promise<MenuData> {
  const res = await fetch(`${PROXY_BASE}/menu-data`, {
    headers: { "X-Proxy-Secret": PROXY_SECRET },
  });
  if (!res.ok) throw new Error("Failed to read menu from KV");
  return res.json();
}

async function writeMenuToKV(data: MenuData): Promise<boolean> {
  const res = await fetch(`${PROXY_BASE}/menu-data`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Proxy-Secret": PROXY_SECRET,
    },
    body: JSON.stringify(data),
  });
  const result = await res.json();
  return result.success === true;
}

/**
 * GET: Read current menu data from Cloudflare KV
 */
export async function GET(request: NextRequest) {
  const token = getSessionFromRequest(request);
  if (!token) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const session = await verifySession(token);
  if (!session) {
    return NextResponse.json({ error: "Sesión expirada" }, { status: 401 });
  }

  try {
    const menuData = await readMenuFromKV();
    return NextResponse.json(menuData);
  } catch {
    // Fallback to static JSON if KV is empty
    const fs = await import("fs");
    const path = await import("path");
    const jsonPath = path.join(process.cwd(), "data/menu/masunori-menu.json");
    const data = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
    return NextResponse.json(data);
  }
}

/**
 * POST: Update a menu item's price/name/fudoMatch.
 * Persists to Cloudflare KV (persistent across deploys).
 */
export async function POST(request: NextRequest) {
  const token = getSessionFromRequest(request);
  if (!token) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const session = await verifySession(token);
  if (!session) {
    return NextResponse.json({ error: "Sesión expirada" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const action: string = body.action || "update";

    // 1. Read menu from KV
    let menuData: MenuData;
    try {
      menuData = await readMenuFromKV();
    } catch {
      const fs = await import("fs");
      const path = await import("path");
      const jsonPath = path.join(process.cwd(), "data/menu/masunori-menu.json");
      menuData = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
    }

    // ===== UPDATE =====
    if (action === "update") {
      const { itemId, changes, syncFudo } = body as {
        itemId: string;
        changes: { price?: number; name?: string; description?: string; tag?: string; fudoMatch?: string };
        syncFudo?: boolean;
      };
      if (!itemId || !changes) {
        return NextResponse.json({ error: "itemId y changes requeridos" }, { status: 400 });
      }

      let foundItem: MenuItem | null = null;
      for (const page of menuData.pages) {
        for (const section of page.sections) {
          const item = section.items.find((i) => i.id === itemId);
          if (item) { foundItem = item; break; }
        }
        if (foundItem) break;
      }
      if (!foundItem) {
        return NextResponse.json({ error: `Item ${itemId} no encontrado` }, { status: 404 });
      }

      // Save fudoMatch before applying changes
      const fudoMatchName = changes.fudoMatch !== undefined
        ? (changes.fudoMatch || undefined)
        : foundItem.fudoMatch;

      if (changes.price !== undefined) foundItem.price = changes.price;
      if (changes.name !== undefined) foundItem.name = changes.name;
      if (changes.description !== undefined) foundItem.description = changes.description || undefined;
      if (changes.tag !== undefined) {
        if (changes.tag === "") delete foundItem.tag;
        else foundItem.tag = changes.tag;
      }
      if (changes.fudoMatch !== undefined) {
        if (changes.fudoMatch === "") delete foundItem.fudoMatch;
        else foundItem.fudoMatch = changes.fudoMatch;
      }

      const saved = await writeMenuToKV(menuData);

      // Sync to Fudo if requested and there's a match name
      const fudoResults: Array<{ sucursal: string; success: boolean; error?: string }> = [];
      if (syncFudo && fudoMatchName && changes.price !== undefined) {
        const searchName = normalize(fudoMatchName);

        // Search EACH sucursal independently for the product
        for (const suc of SUCURSALES) {
          try {
            const products = await getProducts(suc);
            // Find product by fuzzy normalized name match
            const match = products.find((p) => normalize(p.name) === searchName);
            if (match && changes.price !== match.price) {
              const result = await patchProduct(suc, match.id, { price: changes.price });
              fudoResults.push({ sucursal: suc.name, success: result.success, error: result.error });
            } else if (!match) {
              fudoResults.push({ sucursal: suc.name, success: false, error: "No encontrado" });
            } else {
              fudoResults.push({ sucursal: suc.name, success: true }); // same price already
            }
          } catch (e) {
            fudoResults.push({ sucursal: suc.name, success: false, error: e instanceof Error ? e.message : "Error" });
          }
        }
      }

      return NextResponse.json({
        success: true,
        saved,
        item: foundItem,
        fudo: fudoResults.length > 0 ? fudoResults : undefined,
      });
    }

    // ===== ADD =====
    if (action === "add") {
      const { sectionId, item } = body as {
        sectionId: string;
        item: { name: string; price: number; description?: string; tag?: string; fudoMatch?: string };
      };
      if (!sectionId || !item?.name || item?.price === undefined) {
        return NextResponse.json({ error: "sectionId, item.name y item.price requeridos" }, { status: 400 });
      }

      // Find section
      let foundSection: MenuSection | null = null;
      for (const page of menuData.pages) {
        const sec = page.sections.find((s) => s.id === sectionId);
        if (sec) { foundSection = sec; break; }
      }
      if (!foundSection) {
        return NextResponse.json({ error: `Seccion ${sectionId} no encontrada` }, { status: 404 });
      }

      // Generate ID from name
      const id = sectionId + "-" + item.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/, "");

      // Check duplicate
      if (foundSection.items.some((i) => i.id === id)) {
        return NextResponse.json({ error: `Item ${id} ya existe` }, { status: 409 });
      }

      const newItem: MenuItem = {
        id,
        name: item.name,
        price: item.price,
        ...(item.description ? { description: item.description } : {}),
        ...(item.tag ? { tag: item.tag } : {}),
        ...(item.fudoMatch ? { fudoMatch: item.fudoMatch } : {}),
      };

      foundSection.items.push(newItem);
      const saved = await writeMenuToKV(menuData);
      return NextResponse.json({ success: true, saved, item: newItem });
    }

    // ===== DELETE =====
    if (action === "delete") {
      const { itemId } = body as { itemId: string };
      if (!itemId) {
        return NextResponse.json({ error: "itemId requerido" }, { status: 400 });
      }

      let deleted = false;
      for (const page of menuData.pages) {
        for (const section of page.sections) {
          const idx = section.items.findIndex((i) => i.id === itemId);
          if (idx !== -1) {
            section.items.splice(idx, 1);
            deleted = true;
            break;
          }
        }
        if (deleted) break;
      }
      if (!deleted) {
        return NextResponse.json({ error: `Item ${itemId} no encontrado` }, { status: 404 });
      }

      const saved = await writeMenuToKV(menuData);
      return NextResponse.json({ success: true, saved, deleted: itemId });
    }

    return NextResponse.json({ error: `Accion '${action}' no reconocida` }, { status: 400 });
  } catch (e) {
    console.error("Menu save error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error interno" },
      { status: 500 }
    );
  }
}
