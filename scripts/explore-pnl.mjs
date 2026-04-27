import { google } from "googleapis";
import dotenv from "dotenv";

dotenv.config({ path: "/Users/matiaskw/Desktop/masunori-dashboard/.env.prod.gcp" });

const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
const saJson = JSON.parse(raw.replace(/\n/g, "\\n"));

const auth = new google.auth.GoogleAuth({
  credentials: saJson,
  scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
});
const sheets = google.sheets({ version: "v4", auth });

// 2026 Palermo
const SHEET_ID = process.env.SHEET_PALERMO_2026;

const TABS_TO_EXPLORE = ["P&L", "EERR", "INGRESOS", "EGRESOS"];

for (const tab of TABS_TO_EXPLORE) {
  console.log(`\n══════════════════════════════════`);
  console.log(`📄 Tab: "${tab}"`);
  console.log(`══════════════════════════════════`);

  try {
    const data = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${tab}!A1:Z60`,
    });
    const rows = data.data.values || [];
    rows.forEach((row, i) => {
      const preview = row.slice(0, 15).map(c => (c || "").toString().substring(0, 25)).join(" | ");
      console.log(`  [${i}] ${preview}`);
    });
  } catch (e) {
    console.log(`  ⚠️  Error: ${e.message.substring(0, 200)}`);
  }
}
