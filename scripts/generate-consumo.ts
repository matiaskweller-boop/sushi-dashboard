/**
 * Script to generate consumo-mensual.json from Fudo API.
 * Run once, then only current month is fetched live.
 *
 * Usage: npx tsx scripts/generate-consumo.ts
 */

// Load env vars from .env.local manually
import { readFileSync } from "fs";
try {
  const envContent = readFileSync(".env.local", "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.substring(0, eqIndex);
    const value = trimmed.substring(eqIndex + 1);
    process.env[key] = value;
  }
} catch { /* no .env.local */ }

// Inline minimal Fudo client for script context
const FUDO_AUTH_URL = "https://auth.fu.do/api";
const FUDO_API_BASE = "https://api.fu.do/v1alpha1";

interface SucursalConfig {
  id: string;
  name: string;
  apiKey: string;
  apiSecret: string;
}

const SUCURSALES: SucursalConfig[] = [
  {
    id: "palermo",
    name: "Palermo",
    apiKey: process.env.FUDO_PALERMO_API_KEY || "",
    apiSecret: process.env.FUDO_PALERMO_API_SECRET || "",
  },
  {
    id: "belgrano",
    name: "Belgrano",
    apiKey: process.env.FUDO_BELGRANO_API_KEY || "",
    apiSecret: process.env.FUDO_BELGRANO_API_SECRET || "",
  },
  {
    id: "puerto",
    name: "Puerto Madero",
    apiKey: process.env.FUDO_PUERTO_API_KEY || "",
    apiSecret: process.env.FUDO_PUERTO_API_SECRET || "",
  },
];

const tokenCache: Map<string, string> = new Map();

async function getAuthToken(suc: SucursalConfig): Promise<string> {
  if (tokenCache.has(suc.id)) return tokenCache.get(suc.id)!;
  const res = await fetch(FUDO_AUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey: suc.apiKey, apiSecret: suc.apiSecret }),
  });
  const data = await res.json();
  tokenCache.set(suc.id, data.token);
  return data.token;
}

async function fetchSalesPage(suc: SucursalConfig, page: number): Promise<any> {
  const jwt = await getAuthToken(suc);
  const url = `${FUDO_API_BASE}/sales?sort=-createdAt&include=items&page[size]=500&page[number]=${page}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${jwt}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Fudo error: ${res.status}`);
  return res.json();
}

// Load product metadata for name resolution
async function loadProducts(suc: SucursalConfig): Promise<Map<string, { name: string; categoryId: string | null }>> {
  const jwt = await getAuthToken(suc);
  const products = new Map<string, { name: string; categoryId: string | null }>();
  let page = 1;
  while (true) {
    const url = `${FUDO_API_BASE}/products?page[size]=500&page[number]=${page}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${jwt}`, Accept: "application/json" },
    });
    const data = await res.json();
    for (const r of data.data) {
      const catRel = r.relationships?.productCategory?.data;
      products.set(r.id, {
        name: r.attributes.name,
        categoryId: catRel ? catRel.id : null,
      });
    }
    if (data.data.length < 500) break;
    page++;
  }
  return products;
}

async function loadCategories(suc: SucursalConfig): Promise<Map<string, string>> {
  const jwt = await getAuthToken(suc);
  const categories = new Map<string, string>();
  let page = 1;
  while (true) {
    const url = `${FUDO_API_BASE}/product-categories?page[size]=500&page[number]=${page}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${jwt}`, Accept: "application/json" },
    });
    const data = await res.json();
    for (const r of data.data) {
      categories.set(r.id, r.attributes.name);
    }
    if (data.data.length < 500) break;
    page++;
  }
  return categories;
}

interface StoredProductData {
  categoryName: string;
  months: Record<string, { qty: number; bySucursal: Record<string, number> }>;
}

async function main() {
  // Generate months: last 5 completed months (not current)
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const months: string[] = [];
  for (let i = 5; i >= 1; i--) {
    const d = new Date(now);
    d.setMonth(d.getMonth() - i);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  console.log(`Generating consumption data for months: ${months.join(", ")}`);
  console.log(`Current month (${currentMonth}) will be fetched live.`);

  const result: Record<string, StoredProductData> = {};

  for (const suc of SUCURSALES) {
    console.log(`\nProcessing ${suc.name}...`);

    const products = await loadProducts(suc);
    const categories = await loadCategories(suc);
    console.log(`  Loaded ${products.size} products, ${categories.size} categories`);

    for (const monthKey of months) {
      const [year, month] = monthKey.split("-").map(Number);
      const fromDate = new Date(year, month - 1, 1);
      const toDate = new Date(year, month, 0); // last day of month
      const fromStr = `${year}-${String(month).padStart(2, "0")}-01`;
      const toStr = `${year}-${String(month).padStart(2, "0")}-${String(toDate.getDate()).padStart(2, "0")}`;

      const fromD = new Date(fromStr + "T00:00:00-03:00");
      const toD = new Date(toStr + "T23:59:59-03:00");

      console.log(`  Fetching ${monthKey} (${fromStr} to ${toStr})...`);

      let page = 1;
      let reachedBefore = false;
      let itemCount = 0;

      while (!reachedBefore) {
        try {
          const response = await fetchSalesPage(suc, page);
          if (!response.data || response.data.length === 0) break;

          for (const sale of response.data) {
            if (sale.attributes.saleState === "CANCELED") continue;
            const saleDate = new Date(sale.attributes.closedAt || sale.attributes.createdAt);
            if (saleDate > toD) continue;
            if (saleDate < fromD) { reachedBefore = true; break; }

            // Get items from included
            const itemIds = sale.relationships?.items?.data?.map((r: any) => r.id) || [];
            for (const itemId of itemIds) {
              const itemRes = response.included?.find((r: any) => r.type === "Item" && r.id === itemId);
              if (!itemRes || itemRes.attributes.canceled) continue;

              const productId = itemRes.relationships?.product?.data?.id || "";
              const productInfo = products.get(productId);
              const productName = productInfo?.name || `Producto #${productId}`;
              const categoryId = productInfo?.categoryId;
              const categoryName = categoryId ? (categories.get(categoryId) || "Sin categoria") : "Sin categoria";
              const quantity = itemRes.attributes.quantity || 1;

              if (!result[productName]) {
                result[productName] = { categoryName, months: {} };
              }
              if (!result[productName].months[monthKey]) {
                result[productName].months[monthKey] = { qty: 0, bySucursal: { palermo: 0, belgrano: 0, puerto: 0 } };
              }
              result[productName].months[monthKey].qty += quantity;
              result[productName].months[monthKey].bySucursal[suc.id] += quantity;
              itemCount++;
            }
          }

          if (response.data.length < 500) break;
          page++;
          if (page > 100) break;

          // Small delay to avoid rate limiting
          await new Promise(r => setTimeout(r, 200));
        } catch (err) {
          console.error(`  Error page ${page}:`, err);
          break;
        }
      }
      console.log(`    ${monthKey}: ${itemCount} items processed (page ${page})`);
    }
  }

  const productCount = Object.keys(result).length;
  console.log(`\nDone! ${productCount} unique products found.`);

  // Write to file
  const fs = await import("fs");
  const path = await import("path");
  const outPath = path.join(process.cwd(), "data", "consumo-mensual.json");
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
  console.log(`Written to ${outPath}`);
}

main().catch(console.error);
