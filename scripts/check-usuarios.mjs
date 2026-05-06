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

const SHEET = "1YMIE_t1O5RBfXGwFQf7xzh-TeuPUV6SfIl4Smj2mk1g";

const data = await sheets.spreadsheets.values.get({
  spreadsheetId: SHEET,
  range: "Usuarios!A1:Z20",
});
const rows = data.data.values || [];
console.log("Total rows:", rows.length);
console.log("\n== Headers ==");
console.log(rows[0]);
console.log("\n== Data rows ==");
rows.slice(1).forEach((r, i) => {
  console.log(`Row ${i + 2}:`, r);
});
