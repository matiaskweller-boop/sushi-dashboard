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
};

// Listar todas las tabs primero
for (const [suc, id] of Object.entries(SHEETS)) {
  console.log(`\n══════════════════════════════════ ${suc} ══════════════════════════════════`);
  const meta = await sheets.spreadsheets.get({ spreadsheetId: id, fields: "sheets(properties(title))" });
  console.log("\nTabs disponibles:");
  for (const s of meta.data.sheets) {
    console.log(`  - ${s.properties.title}`);
  }

  const TABS = [
    "INGRESOS Y EGRESOS EFECTIVO", "ARQUEO SANTANDER", "Mercado Pago", "Extr MP", "RETIROS",
  ];
  for (const tab of TABS) {
    console.log(`\n  📄 Tab: "${tab}"`);
    try {
      const data = await sheets.spreadsheets.values.get({
        spreadsheetId: id,
        range: `${tab}!A1:Z20`,
      });
      const rows = data.data.values || [];
      rows.forEach((row, i) => {
        const preview = row.slice(0, 12).map(c => (c || "").toString().substring(0, 22)).join(" | ");
        console.log(`     [${i}] ${preview}`);
      });
    } catch (e) {
      console.log(`     ⚠️  ${e.message.substring(0, 80)}`);
    }
  }
}
