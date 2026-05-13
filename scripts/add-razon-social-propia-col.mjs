import { google } from "googleapis";
import dotenv from "dotenv";

dotenv.config({ path: "/Users/matiaskw/Desktop/masunori-dashboard/.env.prod.gcp" });

const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
const saJson = JSON.parse(raw.replace(/\n/g, "\\n"));
const auth = new google.auth.GoogleAuth({
  credentials: saJson,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const sheets = google.sheets({ version: "v4", auth });

// Cada sucursal puede tener tab con casing distinto
const targets = [
  { name: "Palermo", id: process.env.SHEET_PALERMO_2026, expectedTab: "EGRESOS" },
  { name: "Belgrano", id: process.env.SHEET_BELGRANO_2026, expectedTab: "Egresos" },
  { name: "Madero", id: process.env.SHEET_MADERO_2026, expectedTab: "EGRESOS" },
];

for (const t of targets) {
  console.log(`\n=== ${t.name} ===`);
  const meta = await sheets.spreadsheets.get({
    spreadsheetId: t.id,
    fields: "sheets(properties(title,sheetId,gridProperties))",
  });
  // Buscar EGRESOS case-insensitive
  const tab = meta.data.sheets.find((s) => s.properties.title.toLowerCase() === "egresos");
  if (!tab) { console.log("! No tab egresos"); continue; }
  console.log(`Tab "${tab.properties.title}" (${tab.properties.gridProperties.columnCount} cols)`);

  // Check current V1
  const currentV = await sheets.spreadsheets.values.get({
    spreadsheetId: t.id,
    range: `'${tab.properties.title}'!V1`,
  });
  const v1 = currentV.data.values?.[0]?.[0] || "";
  console.log(`  V1 actual: "${v1}"`);

  if (v1.toLowerCase().includes("razon social propia") || v1.toLowerCase().includes("razón social propia")) {
    console.log(`  ✓ Ya tiene header RAZON SOCIAL PROPIA`);
    continue;
  }

  if (v1 && v1.trim()) {
    console.log(`  ⚠️  V1 tiene "${v1}" — NO sobreescribo. Skip.`);
    continue;
  }

  // Set header V1
  await sheets.spreadsheets.values.update({
    spreadsheetId: t.id,
    range: `'${tab.properties.title}'!V1`,
    valueInputOption: "RAW",
    requestBody: { values: [["RAZON SOCIAL PROPIA"]] },
  });
  console.log(`  ✓ V1 = "RAZON SOCIAL PROPIA"`);
}

console.log("\nDONE");
