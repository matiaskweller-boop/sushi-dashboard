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

console.log("=== Buscando 'costeo' / 'masunori costeo' ===\n");

const res = await drive.files.list({
  q: "(name contains 'costeo' or name contains 'Costeo' or name contains 'COSTEO' or name contains 'masunori costeo') and trashed=false",
  pageSize: 30,
  fields: "files(id, name, mimeType, modifiedTime, parents, owners)",
  orderBy: "modifiedTime desc",
});

console.log(`Encontrados: ${res.data.files.length}`);
for (const f of res.data.files) {
  const type = f.mimeType.replace("application/vnd.google-apps.", "");
  console.log(`\n[${type}] ${f.name}`);
  console.log(`  id: ${f.id}`);
  console.log(`  modificado: ${f.modifiedTime}`);
  console.log(`  parents: ${f.parents}`);

  if (f.mimeType === "application/vnd.google-apps.spreadsheet") {
    try {
      const meta = await sheets.spreadsheets.get({
        spreadsheetId: f.id,
        fields: "sheets(properties(title,gridProperties))",
      });
      console.log(`  Tabs (${meta.data.sheets.length}):`);
      for (const s of meta.data.sheets) {
        const p = s.properties;
        console.log(`    - "${p.title}" (${p.gridProperties.rowCount}r × ${p.gridProperties.columnCount}c)`);
      }
    } catch (e) {
      console.log(`  ! ${e.message}`);
    }
  }
}

if (res.data.files.length === 0) {
  console.log("\n⚠️  No se encontró 'masunori costeo dashboard'.");
  console.log("Necesito que compartas el archivo con el service account:");
  console.log("  masunori-erp-sa@masunori-dashboard.iam.gserviceaccount.com");
  console.log("Con permiso de lectura (Viewer) alcanza.");
}
