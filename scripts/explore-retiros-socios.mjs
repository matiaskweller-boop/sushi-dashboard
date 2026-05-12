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
const SHEET_ID = "1x8ZI8qIDcHitHJA6Hadd3VtdZNwPL4h0pwOxyUghdw0";
const TAB = "RETIROS+CONSUMOS SOCIOS";

const data = await sheets.spreadsheets.values.get({
  spreadsheetId: SHEET_ID,
  range: `'${TAB}'!A1:AD30`,
});

console.log(`=== ${TAB} ===`);
const rows = data.data.values || [];
console.log(`Total rows fetched: ${rows.length}`);
console.log();
rows.forEach((row, idx) => {
  console.log(`Row ${idx + 1} (${row.length} cols):`);
  row.forEach((cell, i) => {
    const col = String.fromCharCode(65 + i);
    if (cell && String(cell).trim()) {
      console.log(`  ${col}: ${cell}`);
    }
  });
  console.log();
});
