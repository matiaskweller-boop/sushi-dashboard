import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const PROXY_BASE = "https://fudo-test.matiaskweller.workers.dev";
const PROXY_SECRET = "masunori-fudo-proxy-2026";

interface KvItem {
  id: string;
  name: string;
  price: number;
  description?: string;
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
      items: KvItem[];
    }>;
  }>;
}

function formatPrintPrice(price: number): string {
  const rounded = Math.round(price);
  const str = rounded.toString();
  const parts: string[] = [];
  for (let i = str.length; i > 0; i -= 3) {
    parts.unshift(str.slice(Math.max(0, i - 3), i));
  }
  return "$" + parts.join(".");
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function unescapeHtml(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

/**
 * Parse the static HTML to extract ALL items with their correct names,
 * descriptions, and prices. This is the source of truth.
 */
function parseHtmlItems(html: string): Map<string, { name: string; price: number; description: string }> {
  const items = new Map<string, { name: string; price: number; description: string }>();
  const lines = html.split("\n");

  for (const line of lines) {
    const idMatch = line.match(/data-menu-id="([^"]+)"/);
    if (!idMatch) continue;
    const id = idMatch[1];

    // Extract name
    let name = "";
    const nameTag = line.match(/<div class="item-name">([^<]+)/);
    const nameBuild = line.match(/<span class="build-item"[^>]*>([^<]+)/);
    const nameHL = line.match(/<div class="highlight-title"[^>]*>([^<]+)/);
    if (nameTag) name = unescapeHtml(nameTag[1].trim());
    else if (nameBuild) name = unescapeHtml(nameBuild[1].trim());
    else if (nameHL) name = unescapeHtml(nameHL[1].trim());

    // Extract price
    let price = 0;
    const priceMatch = line.match(/\$(\d[\d.]*)/);
    if (priceMatch) price = parseInt(priceMatch[1].replace(/\./g, ""));

    // Extract description
    let description = "";
    const descMatch = line.match(/<div class="item-desc">([^<]+)/);
    if (descMatch) description = unescapeHtml(descMatch[1].trim());

    if (name) items.set(id, { name, price, description });
  }

  return items;
}

/**
 * GET: Generate PDF HTML.
 *
 * Step 1: Parse HTML static file to get the SOURCE OF TRUTH (correct names, accents, descriptions)
 * Step 2: Read KV for user overrides (price/name/desc changes made from dashboard)
 * Step 3: Sync KV — update KV items that are wrong vs HTML base
 * Step 4: Apply KV overrides (only user-changed values) to HTML and serve
 */
export async function GET() {
  try {
    const htmlPath = path.join(process.cwd(), "public/menu-print.html");
    let html = fs.readFileSync(htmlPath, "utf-8");

    // Step 1: Parse HTML for base data (source of truth for names/descriptions)
    const htmlBase = parseHtmlItems(html);

    // Step 2: Read KV
    let kvMenu: MenuData | null = null;
    try {
      const res = await fetch(`${PROXY_BASE}/menu-data`, {
        headers: { "X-Proxy-Secret": PROXY_SECRET },
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.pages) kvMenu = data as MenuData;
      }
    } catch {
      // KV unavailable — serve HTML as-is
    }

    if (!kvMenu) {
      return new NextResponse(html, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    // Step 3: Sync KV — fix items where KV has wrong base data
    // Only fix names/descriptions that match the old wrong format (no accents, commas vs dots)
    // Preserve user price changes
    let kvChanged = false;
    for (const page of kvMenu.pages) {
      for (const section of page.sections) {
        for (const item of section.items) {
          const base = htmlBase.get(item.id);
          if (!base) continue;

          // Fix description: if KV desc is the "no accent" version of HTML desc, sync it
          if (base.description && item.description) {
            const kvNorm = item.description.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[·]/g, ",");
            const htmlNorm = base.description.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[·]/g, ",");
            if (kvNorm === htmlNorm && item.description !== base.description) {
              item.description = base.description;
              kvChanged = true;
            }
          }
          // If KV has no description but HTML does, copy it
          if (base.description && !item.description) {
            item.description = base.description;
            kvChanged = true;
          }
        }
      }
    }

    // Save synced KV if changed
    if (kvChanged) {
      try {
        await fetch(`${PROXY_BASE}/menu-data`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Proxy-Secret": PROXY_SECRET,
          },
          body: JSON.stringify(kvMenu),
        });
      } catch {
        // non-critical
      }
    }

    // Step 4: Build final lookup — KV prices + KV names/descs (now synced)
    const kvById = new Map<string, KvItem>();
    for (const page of kvMenu.pages) {
      for (const section of page.sections) {
        for (const item of section.items) {
          kvById.set(item.id, item);
        }
      }
    }

    // Apply to HTML
    const lines = html.split("\n");
    const newLines: string[] = [];
    let pendingId: string | null = null;

    for (const line of lines) {
      let newLine = line;

      const idMatch = line.match(/data-menu-id="([^"]+)"/);
      if (idMatch) {
        const id = idMatch[1];
        const kvItem = kvById.get(id);

        // If item was deleted from KV (dashboard), hide it in the PDF
        if (!kvItem) {
          newLine = newLine.replace(/<div class="item"/, '<div class="item" style="display:none"');
          newLine = newLine.replace(/<span class="build-item"/, '<span class="build-item" style="display:none"');
          newLines.push(newLine);
          continue;
        }

        if (kvItem) {
          const newPrice = formatPrintPrice(kvItem.price);

          // Replace price
          if (/\$[\d.]+/.test(newLine)) {
            newLine = newLine.replace(/\$[\d.]+/g, newPrice);
          } else {
            pendingId = id;
          }

          // Replace item-name
          const nameWithTag = newLine.match(/(<div class="item-name">)[^<]*(<span class="tag">)/);
          const nameSimple = newLine.match(/(<div class="item-name">)([^<]+)(<\/div>)/);
          if (nameWithTag) {
            newLine = newLine.replace(
              /(<div class="item-name">)[^<]*(<span class="tag">)/,
              `$1${escapeHtml(kvItem.name)} $2`
            );
          } else if (nameSimple) {
            newLine = newLine.replace(
              /(<div class="item-name">)[^<]+(<\/div>)/,
              `$1${escapeHtml(kvItem.name)}$2`
            );
          }

          // Replace build-item name
          if (/class="build-item"/.test(newLine)) {
            newLine = newLine.replace(
              /(<span class="build-item"[^>]*>)[^<]+(<\/span>)/,
              `$1${escapeHtml(kvItem.name)}$2`
            );
          }

          // Replace highlight-title
          if (/class="highlight-title"/.test(newLine)) {
            newLine = newLine.replace(
              /(<div class="highlight-title"[^>]*>)[^<]+(<\/div>)/,
              `$1${escapeHtml(kvItem.name)}$2`
            );
          }

          // Replace description
          if (kvItem.description && /class="item-desc"/.test(newLine)) {
            newLine = newLine.replace(
              /(<div class="item-desc">)[^<]+(<\/div>)/,
              `$1${escapeHtml(kvItem.description)}$2`
            );
          }
        }
      }

      // Handle pending price (Omakase highlight-price)
      if (pendingId && /class="highlight-price"/.test(newLine)) {
        const kvItem = kvById.get(pendingId);
        if (kvItem) {
          newLine = newLine.replace(/\$[\d.]+/, formatPrintPrice(kvItem.price));
        }
        pendingId = null;
      }

      newLines.push(newLine);
    }

    html = newLines.join("\n");

    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (e) {
    console.error("Print HTML error:", e);
    const htmlPath = path.join(process.cwd(), "public/menu-print.html");
    const html = fs.readFileSync(htmlPath, "utf-8");
    return new NextResponse(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }
}
