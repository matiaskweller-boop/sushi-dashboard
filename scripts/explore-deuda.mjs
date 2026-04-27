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

const SHEETS = {
  Palermo: process.env.SHEET_PALERMO_2026,
  Belgrano: process.env.SHEET_BELGRANO_2026,
  Madero: process.env.SHEET_MADERO_2026,
};

const TABS = ["DEUDA AL DIA", "CTA CTE", "DATOSSS"];

for (const [suc, id] of Object.entries(SHEETS)) {
  console.log(`\n══════════════════════════════════ ${suc} ══════════════════════════════════`);
  for (const tab of TABS) {
    console.log(`\n  📄 Tab: "${tab}"`);
    try {
      const data = await sheets.spreadsheets.values.get({
        spreadsheetId: id,
        range: `${tab}!A1:Z30`,
      });
      const rows = data.data.values || [];
      rows.forEach((row, i) => {
        const preview = row.slice(0, 12).map(c => (c || "").toString().substring(0, 25)).join(" | ");
        console.log(`     [${i}] ${preview}`);
      });
    } catch (e) {
      console.log(`     ⚠️  ${e.message.substring(0, 100)}`);
    }
  }
}
