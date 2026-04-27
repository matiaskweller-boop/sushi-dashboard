/**
 * Backup all Fudo products from all sucursales before making any changes.
 * Run: npx ts-node scripts/backup-fudo-products.ts
 * Or:  node -e "require('./scripts/backup-fudo-products.ts')"
 */

const FUDO_AUTH_URL = "https://auth.fu.do/api";
const FUDO_API_BASE = "https://api.fu.do/v1alpha1";

interface SucursalEnv {
  name: string;
  id: string;
  keyEnv: string;
  secretEnv: string;
}

const SUCURSALES: SucursalEnv[] = [
  { name: "Palermo", id: "palermo", keyEnv: "FUDO_PALERMO_API_KEY", secretEnv: "FUDO_PALERMO_API_SECRET" },
  { name: "Belgrano", id: "belgrano", keyEnv: "FUDO_BELGRANO_API_KEY", secretEnv: "FUDO_BELGRANO_API_SECRET" },
  { name: "Puerto", id: "puerto", keyEnv: "FUDO_PUERTO_API_KEY", secretEnv: "FUDO_PUERTO_API_SECRET" },
];

async function getToken(apiKey: string, apiSecret: string): Promise<string> {
  const res = await fetch(FUDO_AUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey, apiSecret }),
  });
  if (!res.ok) throw new Error(`Auth failed: ${res.status}`);
  const data = await res.json();
  return data.token;
}

async function getAllProducts(token: string): Promise<any[]> {
  let all: any[] = [];
  let page = 1;
  while (true) {
    const res = await fetch(`${FUDO_API_BASE}/products?page[size]=500&page[number]=${page}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`Products fetch failed: ${res.status}`);
    const data = await res.json();
    all = all.concat(data.data);
    if (data.data.length < 500) break;
    page++;
  }
  return all;
}

async function getAllCategories(token: string): Promise<any[]> {
  const res = await fetch(`${FUDO_API_BASE}/product-categories?page[size]=500`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Categories fetch failed: ${res.status}`);
  const data = await res.json();
  return data.data;
}

async function main() {
  // Load env
  const fs = require("fs");
  const path = require("path");
  const envPath = path.join(__dirname, "..", ".env.local");
  const envContent = fs.readFileSync(envPath, "utf8");
  envContent.split("\n").forEach((line: string) => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) process.env[match[1].trim()] = match[2].trim();
  });

  const backup: Record<string, any> = {
    timestamp: new Date().toISOString(),
    sucursales: {},
  };

  for (const suc of SUCURSALES) {
    const apiKey = process.env[suc.keyEnv];
    const apiSecret = process.env[suc.secretEnv];
    if (!apiKey || !apiSecret) {
      console.error(`Missing env vars for ${suc.name}`);
      continue;
    }

    console.log(`Backing up ${suc.name}...`);
    const token = await getToken(apiKey, apiSecret);
    const [products, categories] = await Promise.all([
      getAllProducts(token),
      getAllCategories(token),
    ]);

    backup.sucursales[suc.id] = {
      name: suc.name,
      products,
      categories,
      productCount: products.length,
      activeCount: products.filter((p: any) => p.attributes.active).length,
    };

    console.log(`  ${suc.name}: ${products.length} products (${products.filter((p: any) => p.attributes.active).length} active), ${categories.length} categories`);
  }

  const date = new Date().toISOString().split("T")[0];
  const backupPath = path.join(__dirname, "..", "data", "backup", `products-backup-${date}.json`);
  fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2));
  console.log(`\nBackup saved to: ${backupPath}`);
  console.log(`Total size: ${(fs.statSync(backupPath).size / 1024).toFixed(1)} KB`);
}

main().catch(console.error);
