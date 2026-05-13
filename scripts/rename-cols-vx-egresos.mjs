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

// Plan:
// - V1: era "RAZON SOCIAL PROPIA" (lo limpio porque ya no escribimos ahí)
// - X1: era "RAZON SOCIAL CLIENTE" → cambio a "RAZON SOCIAL PROPIA"
// (W1 en Palermo tiene "Numeracion" — NO toco)

for (const t of targets) {
  console.log(`\n=== ${t.name} ===`);
  const meta = await sheets.spreadsheets.get({
    spreadsheetId: t.id,
    fields: "sheets(properties(title))",
  });
  const tab = meta.data.sheets.find((s) => s.properties.title.toLowerCase() === "egresos");
  if (!tab) { console.log("! No tab"); continue; }
  const tabName = tab.properties.title;

  // V1: leer y limpiar si es "RAZON SOCIAL PROPIA" (que era mi v1 original)
  const v1Res = await sheets.spreadsheets.values.get({
    spreadsheetId: t.id,
    range: `'${tabName}'!V1`,
  });
  const v1 = v1Res.data.values?.[0]?.[0] || "";
  console.log(`  V1: "${v1}"`);
  if (v1.toLowerCase().includes("razon social propia") || v1.toLowerCase().includes("razón social propia")) {
    console.log(`  → limpio V1`);
    await sheets.spreadsheets.values.update({
      spreadsheetId: t.id,
      range: `'${tabName}'!V1`,
      valueInputOption: "RAW",
      requestBody: { values: [[""]] },
    });
  }

  // X1: cambiar a "RAZON SOCIAL PROPIA"
  const x1Res = await sheets.spreadsheets.values.get({
    spreadsheetId: t.id,
    range: `'${tabName}'!X1`,
  });
  const x1 = x1Res.data.values?.[0]?.[0] || "";
  console.log(`  X1: "${x1}"`);
  if (x1.toLowerCase() !== "razon social propia" && x1.toLowerCase() !== "razón social propia") {
    await sheets.spreadsheets.values.update({
      spreadsheetId: t.id,
      range: `'${tabName}'!X1`,
      valueInputOption: "RAW",
      requestBody: { values: [["RAZON SOCIAL PROPIA"]] },
    });
    console.log(`  → X1 ahora "RAZON SOCIAL PROPIA"`);
  } else {
    console.log(`  → ya está`);
  }
}

console.log("\nDONE");
