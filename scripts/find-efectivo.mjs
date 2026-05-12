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

console.log("=== Searching for 'Efectivo y mas' ===");
const res = await drive.files.list({
  q: "(name contains 'efectivo' or name contains 'Efectivo' or name contains 'EFECTIVO') and trashed=false",
  pageSize: 50,
  fields: "files(id, name, mimeType, modifiedTime, parents, webViewLink)",
  orderBy: "modifiedTime desc",
});

if (!res.data.files.length) {
  console.log("No matches. Listing all spreadsheets accessible to SA:");
  const all = await drive.files.list({
    q: "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false",
    pageSize: 100,
    fields: "files(id, name, modifiedTime)",
    orderBy: "modifiedTime desc",
  });
  for (const f of all.data.files) {
    console.log(`  ${f.name}  (${f.id})`);
  }
  process.exit(0);
}

for (const f of res.data.files) {
  const type = f.mimeType.replace("application/vnd.google-apps.", "");
  console.log(`\n[${type}] ${f.name}`);
  console.log(`  id: ${f.id}`);
  console.log(`  link: ${f.webViewLink}`);
  if (f.mimeType === "application/vnd.google-apps.spreadsheet") {
    try {
      const meta = await sheets.spreadsheets.get({
        spreadsheetId: f.id,
        fields: "sheets(properties(title,sheetId,gridProperties))",
      });
      console.log("  Tabs:");
      for (const s of meta.data.sheets) {
        const p = s.properties;
        console.log(`    - "${p.title}" (${p.gridProperties.rowCount}r x ${p.gridProperties.columnCount}c)`);
      }
      // Read first tab first 5 rows
      const firstTab = meta.data.sheets[0].properties.title;
      const data = await sheets.spreadsheets.values.get({
        spreadsheetId: f.id,
        range: `'${firstTab}'!A1:Z10`,
      });
      console.log(`\n  Sample from "${firstTab}":`);
      for (const row of data.data.values || []) {
        console.log(`    | ${row.slice(0, 10).join(" | ")}`);
      }
    } catch (e) {
      console.log(`  ! cannot read: ${e.message}`);
    }
  }
}
