import { google } from "googleapis";
import dotenv from "dotenv";
dotenv.config({ path: "/Users/matiaskw/Desktop/masunori-dashboard/.env.prod.gcp" });
const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
const saJson = JSON.parse(raw.replace(/\n/g, "\\n"));
const auth = new google.auth.GoogleAuth({ credentials: saJson, scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"] });
const sheets = google.sheets({ version: "v4", auth });
const ID = process.env.SHEET_PALERMO_2026;
const data = await sheets.spreadsheets.values.get({ spreadsheetId: ID, range: "'INGRESOS Y EGRESOS EFECTIVO'!A1:R60" });
const rows = data.data.values || [];
console.log("Total rows:", rows.length);
rows.forEach((row, i) => {
  const preview = row.slice(0, 18).map(c => (c || "").toString().substring(0, 22)).join(" | ");
  console.log(`  [${i}] ${preview}`);
});
