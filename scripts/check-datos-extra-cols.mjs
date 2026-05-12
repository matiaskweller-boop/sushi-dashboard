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

// Check headers and look for ANY data in L+ across all rows
const res = await sheets.spreadsheets.values.get({
  spreadsheetId: DATOS_ID,
  range: "'DATOS PROVEEDORES'!A2:AD90",
});
const rows = res.data.values || [];
const headers = rows[0] || [];
console.log("Headers row (row 2) — cols A-AD:");
for (let i = 0; i < 30; i++) {
  const col = String.fromCharCode(65 + i);
  console.log(`  ${i < 26 ? col : "A" + String.fromCharCode(65 + i - 26)}: ${headers[i] || "(empty)"}`);
}

// Count filled cells in cols L+ across all data rows
console.log("\nCells filled in cols L+ across all 80 proveedor rows:");
for (let c = 11; c < 30; c++) {
  let count = 0;
  for (let r = 1; r < rows.length; r++) {
    if (rows[r][c] && String(rows[r][c]).trim()) count++;
  }
  if (count > 0) {
    const colName = c < 26 ? String.fromCharCode(65 + c) : "A" + String.fromCharCode(65 + c - 26);
    console.log(`  col ${colName} (idx ${c}): ${count} cells with data, header="${headers[c] || ""}"`);
    // Show samples
    const samples = [];
    for (let r = 1; r < rows.length && samples.length < 3; r++) {
      if (rows[r][c]) samples.push(rows[r][c]);
    }
    samples.forEach(s => console.log(`    sample: ${String(s).substring(0, 80)}`));
  }
}
