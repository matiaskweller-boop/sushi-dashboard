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

const meta = await sheets.spreadsheets.get({
  spreadsheetId: process.env.SHEET_BELGRANO_2026,
  fields: "sheets(properties(title,sheetId,gridProperties))",
});
console.log("Belgrano 2026 tabs:");
for (const s of meta.data.sheets) {
  console.log(`  - "${s.properties.title}" (${s.properties.gridProperties.rowCount}r × ${s.properties.gridProperties.columnCount}c)`);
}
