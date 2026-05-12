import { google } from "googleapis";
import dotenv from "dotenv";

dotenv.config({ path: "/Users/matiaskw/Desktop/masunori-dashboard/.env.prod.gcp" });

const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
const saJson = JSON.parse(raw.replace(/\n/g, "\\n"));

const auth = new google.auth.GoogleAuth({
  credentials: saJson,
  scopes: [
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/spreadsheets",
  ],
});

const drive = google.drive({ version: "v3", auth });
const sheets = google.sheets({ version: "v4", auth });

const MADERO_ID = process.env.SHEET_MADERO_2026;
console.log("MADERO 2026 sheet:", MADERO_ID);

// 1. Metadata: nombre y tabs
const file = await drive.files.get({ fileId: MADERO_ID, fields: "id, name, parents" });
console.log("\nFile name:", file.data.name);
console.log("Parents:", file.data.parents);

const meta = await sheets.spreadsheets.get({
  spreadsheetId: MADERO_ID,
  fields: "sheets(properties(title,sheetId,gridProperties))",
});
console.log("\nAll tabs:");
for (const s of meta.data.sheets) {
  const p = s.properties;
  console.log(`  - "${p.title}" (${p.gridProperties.rowCount}r x ${p.gridProperties.columnCount}c)`);
}

// 2. Para cada tab que parezca de proveedores, leer primeras filas
const candidates = ["DATOSSS", "DEUDA AL DIA", "PROVEEDORES", "Proveedores"];
for (const tabName of candidates) {
  const hasTab = meta.data.sheets.find((s) => s.properties.title === tabName);
  if (!hasTab) continue;
  console.log(`\n=== Tab: ${tabName} ===`);
  try {
    const data = await sheets.spreadsheets.values.get({
      spreadsheetId: MADERO_ID,
      range: `'${tabName}'!A1:Z15`,
    });
    const rows = data.data.values || [];
    rows.forEach((row, idx) => {
      console.log(`Row ${idx + 1}:`);
      row.forEach((cell, i) => {
        const col = String.fromCharCode(65 + i);
        if (cell && String(cell).trim()) {
          console.log(`  ${col}: ${cell}`);
        }
      });
    });
  } catch (e) {
    console.log(`  ! ${e.message}`);
  }
}
