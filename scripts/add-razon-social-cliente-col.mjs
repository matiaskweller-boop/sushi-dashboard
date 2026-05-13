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

for (const t of targets) {
  console.log(`\n=== ${t.name} ===`);
  const meta = await sheets.spreadsheets.get({
    spreadsheetId: t.id,
    fields: "sheets(properties(title,sheetId,gridProperties))",
  });
  const tab = meta.data.sheets.find((s) => s.properties.title.toLowerCase() === "egresos");
  if (!tab) { console.log("! No tab egresos"); continue; }
  const tabName = tab.properties.title;
  console.log(`Tab "${tabName}"`);

  // Palermo tiene "Numeracion" en W. Necesito verificar antes de pisar.
  const currentW = await sheets.spreadsheets.values.get({
    spreadsheetId: t.id,
    range: `'${tabName}'!W1`,
  });
  const w1 = currentW.data.values?.[0]?.[0] || "";
  console.log(`  W1 actual: "${w1}"`);

  if (w1.toLowerCase().includes("razon social cliente") || w1.toLowerCase().includes("razón social cliente")) {
    console.log(`  ✓ Ya tiene header RAZON SOCIAL CLIENTE`);
    continue;
  }

  if (w1 && w1.trim()) {
    console.log(`  ⚠️  W1 ya tiene "${w1}" — voy a buscar primera col vacia despues de V`);
    // Buscar primera col vacía entre W y AZ
    const headerRange = await sheets.spreadsheets.values.get({
      spreadsheetId: t.id,
      range: `'${tabName}'!W1:AZ1`,
    });
    const headers = headerRange.data.values?.[0] || [];
    let emptyColIdx = -1;
    for (let i = 0; i < headers.length; i++) {
      if (!headers[i] || !String(headers[i]).trim()) {
        emptyColIdx = i;
        break;
      }
    }
    if (emptyColIdx === -1) emptyColIdx = headers.length; // siguiente despues del ultimo
    const colNum = 23 + emptyColIdx; // W=23, X=24, ...
    const colLetter = colNum <= 26 ? String.fromCharCode(64 + colNum) : "A" + String.fromCharCode(64 + colNum - 26);
    console.log(`  ⚠️  No piso W. Voy a usar col ${colLetter} (${colNum}).`);
    // No autogenerar — mejor explícito. Skip y avisar.
    console.log(`  ⚠️  SKIP — Daniela tiene que verificar manualmente o cambiamos esquema.`);
    continue;
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId: t.id,
    range: `'${tabName}'!W1`,
    valueInputOption: "RAW",
    requestBody: { values: [["RAZON SOCIAL CLIENTE"]] },
  });
  console.log(`  ✓ W1 = "RAZON SOCIAL CLIENTE"`);
}

console.log("\nDONE");
