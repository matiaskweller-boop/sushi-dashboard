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

console.log("=== Buscando 'mermas' y 'receta y merma' ===\n");

// Buscar todo lo que tenga 'merma'
const mermas = await drive.files.list({
  q: "(name contains 'merma' or name contains 'Merma' or name contains 'MERMA') and trashed=false",
  pageSize: 30,
  fields: "files(id, name, mimeType, modifiedTime, parents)",
});
console.log(`Resultados con 'merma': ${mermas.data.files.length}`);
for (const f of mermas.data.files) {
  const type = f.mimeType.replace("application/vnd.google-apps.", "").substring(0, 12);
  console.log(`  [${type.padEnd(12)}] ${f.name}  [${f.id}]`);
}

// Para cada spreadsheet, mostrar tabs
for (const f of mermas.data.files) {
  if (f.mimeType === "application/vnd.google-apps.spreadsheet") {
    console.log(`\n--- Tabs de "${f.name}" ---`);
    try {
      const meta = await sheets.spreadsheets.get({
        spreadsheetId: f.id,
        fields: "sheets(properties(title,gridProperties))",
      });
      for (const s of meta.data.sheets) {
        const p = s.properties;
        console.log(`  - "${p.title}" (${p.gridProperties.rowCount}r × ${p.gridProperties.columnCount}c)`);
      }
    } catch (e) {
      console.log(`  ! ${e.message}`);
    }
  } else if (f.mimeType === "application/vnd.google-apps.folder") {
    console.log(`\n--- Contenido de carpeta "${f.name}" ---`);
    const contents = await drive.files.list({
      q: `'${f.id}' in parents and trashed=false`,
      pageSize: 200,
      fields: "files(id, name, mimeType)",
      orderBy: "name",
    });
    for (const c of contents.data.files) {
      const type = c.mimeType.replace("application/vnd.google-apps.", "").substring(0, 12);
      console.log(`    [${type.padEnd(12)}] ${c.name}  [${c.id}]`);
    }
  }
}
