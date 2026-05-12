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

const DATOS_ID = "1DuEAFK3MxUZalMPzIfpT9ofrIuThOgu8bSvfbDWRBXk";

const meta = await sheets.spreadsheets.get({
  spreadsheetId: DATOS_ID,
  fields: "sheets(properties(title,sheetId,gridProperties))",
});

console.log("=== DATOS spreadsheet ===\n");
console.log(`Tabs:`);
for (const s of meta.data.sheets) {
  const p = s.properties;
  console.log(`  - "${p.title}" (${p.gridProperties.rowCount}r × ${p.gridProperties.columnCount}c)  [gid: ${p.sheetId}]`);
}
console.log();

// Para cada tab, leer headers + primeras 3 filas + última fila con data
for (const s of meta.data.sheets) {
  const title = s.properties.title;
  const numCols = s.properties.gridProperties.columnCount;
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Tab "${title}" — ${numCols} cols`);
  console.log("=".repeat(60));

  function colLetter(n) {
    // 1=A, 26=Z, 27=AA, etc
    let s = "";
    while (n > 0) {
      const rem = (n - 1) % 26;
      s = String.fromCharCode(65 + rem) + s;
      n = Math.floor((n - 1) / 26);
    }
    return s;
  }
  try {
    const lastCol = colLetter(numCols);
    const data = await sheets.spreadsheets.values.get({
      spreadsheetId: DATOS_ID,
      range: `'${title}'!A1:${lastCol}5`,
    });
    const rows = data.data.values || [];
    console.log(`\nPrimeras 5 filas:`);
    rows.forEach((row, idx) => {
      console.log(`Row ${idx + 1}:`);
      row.forEach((cell, i) => {
        const col = colLetter(i + 1);
        if (cell !== undefined && cell !== null && String(cell).trim()) {
          const v = String(cell).substring(0, 100);
          console.log(`  ${col}: ${v}`);
        }
      });
    });

    // Ahora leer todas las filas para contar
    const allData = await sheets.spreadsheets.values.get({
      spreadsheetId: DATOS_ID,
      range: `'${title}'!A1:A`,
    });
    const allRows = allData.data.values || [];
    const filledRows = allRows.filter(r => r[0] && String(r[0]).trim()).length;
    console.log(`\n  Total filas con dato en col A: ${filledRows}`);

    // Mostrar última fila con data
    if (filledRows > 5) {
      const lastDataRow = filledRows;
      const lastRowData = await sheets.spreadsheets.values.get({
        spreadsheetId: DATOS_ID,
        range: `'${title}'!A${lastDataRow}:${lastCol}${lastDataRow}`,
      });
      const lastRow = lastRowData.data.values?.[0] || [];
      console.log(`\n  Última fila con data (row ${lastDataRow}):`);
      lastRow.forEach((cell, i) => {
        const col = colLetter(i + 1);
        if (cell !== undefined && cell !== null && String(cell).trim()) {
          console.log(`    ${col}: ${String(cell).substring(0, 80)}`);
        }
      });
    }
  } catch (e) {
    console.log(`  ! ${e.message}`);
  }
}
