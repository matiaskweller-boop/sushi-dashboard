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

console.log("=== Searching for MADERO DATOSS ===");
const res = await drive.files.list({
  q: "(name contains 'datoss' or name contains 'DATOSS' or name contains 'Datoss') and trashed=false",
  pageSize: 30,
  fields: "files(id, name, mimeType, modifiedTime, parents, webViewLink)",
  orderBy: "modifiedTime desc",
});

for (const f of res.data.files) {
  console.log(`\n[${f.mimeType.replace("application/vnd.google-apps.", "")}] ${f.name}`);
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
    } catch (e) {
      console.log(`  ! cannot read: ${e.message}`);
    }
  }
}

// Also search for "master proveedores" in case it already exists
console.log("\n=== Searching for existing MASTER PROVEEDORES ===");
const res2 = await drive.files.list({
  q: "(name contains 'master' or name contains 'MASTER' or name contains 'Master') and (name contains 'proveedor' or name contains 'Proveedor' or name contains 'PROVEEDOR') and trashed=false",
  pageSize: 10,
  fields: "files(id, name, mimeType, modifiedTime)",
});
if (res2.data.files.length === 0) {
  console.log("  None found.");
} else {
  for (const f of res2.data.files) {
    console.log(`  ${f.name} (${f.id})`);
  }
}
