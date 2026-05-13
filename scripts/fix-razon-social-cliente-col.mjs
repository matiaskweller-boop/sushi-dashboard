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

const targets = [
  { name: "Palermo", id: process.env.SHEET_PALERMO_2026 },
  { name: "Belgrano", id: process.env.SHEET_BELGRANO_2026 },
  { name: "Madero", id: process.env.SHEET_MADERO_2026 },
];

// Plan: usar col X para RAZON SOCIAL CLIENTE (saltando W donde Palermo tiene "Numeracion")
// Antes habia puesto W1 = "RAZON SOCIAL CLIENTE" en Belgrano y Madero. Lo limpio.

for (const t of targets) {
  console.log(`\n=== ${t.name} ===`);
  const meta = await sheets.spreadsheets.get({
    spreadsheetId: t.id,
    fields: "sheets(properties(title,sheetId,gridProperties))",
  });
  const tab = meta.data.sheets.find((s) => s.properties.title.toLowerCase() === "egresos");
  if (!tab) { console.log("! No tab egresos"); continue; }
  const tabName = tab.properties.title;

  // 1. Si W1 tiene "RAZON SOCIAL CLIENTE" (lo puse por error en el script anterior), limpiarlo
  const wRes = await sheets.spreadsheets.values.get({
    spreadsheetId: t.id,
    range: `'${tabName}'!W1`,
  });
  const w1 = wRes.data.values?.[0]?.[0] || "";
  if (w1.toLowerCase().includes("razon social cliente") || w1.toLowerCase().includes("razón social cliente")) {
    console.log(`  W1 era "${w1}" — limpiando`);
    await sheets.spreadsheets.values.update({
      spreadsheetId: t.id,
      range: `'${tabName}'!W1`,
      valueInputOption: "RAW",
      requestBody: { values: [[""]] },
    });
  } else {
    console.log(`  W1 actual: "${w1}" — no toco`);
  }

  // 2. Verificar X1 y setear si vacío
  const xRes = await sheets.spreadsheets.values.get({
    spreadsheetId: t.id,
    range: `'${tabName}'!X1`,
  });
  const x1 = xRes.data.values?.[0]?.[0] || "";
  console.log(`  X1 actual: "${x1}"`);
  if (!x1.trim()) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: t.id,
      range: `'${tabName}'!X1`,
      valueInputOption: "RAW",
      requestBody: { values: [["RAZON SOCIAL CLIENTE"]] },
    });
    console.log(`  ✓ X1 = "RAZON SOCIAL CLIENTE"`);
  } else {
    console.log(`  ⚠️  X1 tiene "${x1}" — skip (no piso)`);
  }
}

console.log("\nDONE");
