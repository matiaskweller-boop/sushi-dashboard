import { NextRequest, NextResponse } from "next/server";
import { verifySession, getSessionFromRequest } from "@/lib/auth";
import { getProducts } from "@/lib/fudo-client";
import { SUCURSALES } from "@/lib/sucursales";

const PROXY_BASE = "https://fudo-test.matiaskweller.workers.dev";
const PROXY_SECRET = "masunori-fudo-proxy-2026";

interface MenuItem {
  id: string;
  name: string;
  price: number;
  description?: string;
  fudoMatch?: string;
}

interface MenuData {
  version: string;
  pages: Array<{
    id: string;
    title: string;
    sections: Array<{
      id: string;
      title: string;
      subtitle?: string;
      items: MenuItem[];
    }>;
  }>;
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * POST: Auto-sync menu items with Fudo products.
 * Searches ALL active Fudo products across ALL sucursales,
 * finds the best match for each unlinked menu item,
 * and updates fudoMatch in KV.
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
    // 1. Get ALL active Fudo products from all sucursales
    const allFudoNames = new Set<string>();
    const fudoByNorm = new Map<string, string>(); // normalized -> original name

    for (const suc of SUCURSALES) {
      try {
        const products = await getProducts(suc);
        for (const p of products) {
          if (p.active) {
            const norm = normalize(p.name);
            if (!fudoByNorm.has(norm)) {
              fudoByNorm.set(norm, p.name);
            }
            allFudoNames.add(p.name);
          }
        }
      } catch {
        // Skip failed sucursal
      }
    }

    // 2. Read menu from KV
    const kvRes = await fetch(`${PROXY_BASE}/menu-data`, {
      headers: { "X-Proxy-Secret": PROXY_SECRET },
      cache: "no-store",
    });
    if (!kvRes.ok) {
      return NextResponse.json({ error: "No se pudo leer KV" }, { status: 500 });
    }
    const menu: MenuData = await kvRes.json();

    // 3. For each menu item, try to find a Fudo match
    const results: Array<{
      id: string;
      name: string;
      status: "already" | "found" | "not_found";
      fudoMatch?: string;
    }> = [];

    let newMatches = 0;
    let verified = 0;
    let broken = 0;

    for (const page of menu.pages) {
      for (const section of page.sections) {
        for (const item of section.items) {
          // If already has fudoMatch, verify it still exists
          if (item.fudoMatch) {
            const norm = normalize(item.fudoMatch);
            if (fudoByNorm.has(norm)) {
              // Match still valid — update to current Fudo name in case it changed
              const currentName = fudoByNorm.get(norm)!;
              if (item.fudoMatch !== currentName) {
                item.fudoMatch = currentName;
                newMatches++;
              }
              verified++;
              results.push({ id: item.id, name: item.name, status: "already", fudoMatch: item.fudoMatch });
            } else {
              // Match broken — try to find new match
              const found = findBestMatch(item.name, item.fudoMatch, fudoByNorm);
              if (found) {
                item.fudoMatch = found;
                newMatches++;
                broken++;
                results.push({ id: item.id, name: item.name, status: "found", fudoMatch: found });
              } else {
                // Can't find it — clear broken match
                delete item.fudoMatch;
                broken++;
                results.push({ id: item.id, name: item.name, status: "not_found" });
              }
            }
            continue;
          }

          // No fudoMatch — try to find one
          const found = findBestMatch(item.name, null, fudoByNorm);
          if (found) {
            item.fudoMatch = found;
            newMatches++;
            results.push({ id: item.id, name: item.name, status: "found", fudoMatch: found });
          } else {
            results.push({ id: item.id, name: item.name, status: "not_found" });
          }
        }
      }
    }

    // 4. Save updated menu to KV
    if (newMatches > 0 || broken > 0) {
      await fetch(`${PROXY_BASE}/menu-data`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Proxy-Secret": PROXY_SECRET,
        },
        body: JSON.stringify(menu),
      });
    }

    const notFound = results.filter((r) => r.status === "not_found").length;
    const found = results.filter((r) => r.status === "found").length;

    return NextResponse.json({
      success: true,
      totalItems: results.length,
      fudoProducts: allFudoNames.size,
      verified,
      newMatches: found,
      brokenFixed: broken,
      notFound,
      details: results.filter((r) => r.status !== "already"),
    });
  } catch (e) {
    console.error("Sync Fudo error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error interno" },
      { status: 500 }
    );
  }
}

/**
 * Find the best Fudo product match for a menu item.
 * Uses multiple strategies:
 * 1. Exact normalized match on item name
 * 2. Exact normalized match on old fudoMatch
 * 3. Substring containment (both directions)
 * 4. Word overlap scoring
 */
function findBestMatch(
  menuName: string,
  oldFudoMatch: string | null,
  fudoByNorm: Map<string, string>
): string | null {
  const menuNorm = normalize(menuName);

  // Strategy 1: Exact match on menu name
  if (fudoByNorm.has(menuNorm)) return fudoByNorm.get(menuNorm)!;

  // Strategy 2: Exact match on old fudoMatch
  if (oldFudoMatch) {
    const oldNorm = normalize(oldFudoMatch);
    if (fudoByNorm.has(oldNorm)) return fudoByNorm.get(oldNorm)!;
  }

  // Strategy 3: Containment — find Fudo names containing the menu name or vice versa
  const menuWords = menuNorm.split(" ").filter((w) => w.length > 2);
  let bestMatch: string | null = null;
  let bestScore = 0;

  for (const fudoNorm of Array.from(fudoByNorm.keys())) {
    const fudoName = fudoByNorm.get(fudoNorm)!;
    // Full containment
    if (fudoNorm.includes(menuNorm) || menuNorm.includes(fudoNorm)) {
      const score = Math.min(menuNorm.length, fudoNorm.length) / Math.max(menuNorm.length, fudoNorm.length);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = fudoName;
      }
      continue;
    }

    // Strategy 4: Word overlap
    if (menuWords.length >= 2) {
      const fudoWords = fudoNorm.split(" ").filter((w) => w.length > 2);
      const overlap = menuWords.filter((w) => fudoWords.some((fw) => fw.includes(w) || w.includes(fw))).length;
      const score = overlap / Math.max(menuWords.length, fudoWords.length);
      if (score > 0.6 && score > bestScore) {
        bestScore = score;
        bestMatch = fudoName;
      }
    }
  }

  return bestMatch;
}
