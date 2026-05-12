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

// Buscar archivos con nombre "DATOS" (priorizar exactos)
console.log("=== Searching for 'DATOS' spreadsheet ===\n");

// Búsqueda amplia
const res = await drive.files.list({
  q: "(name='DATOS' or name='datos' or name='Datos') and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false",
  pageSize: 30,
  fields: "files(id, name, mimeType, modifiedTime, parents, owners, webViewLink)",
  orderBy: "modifiedTime desc",
});

if (res.data.files.length === 0) {
  console.log("No se encontró 'DATOS' exacto. Buscando con 'DATOS' contenido en el nombre...");
  const wider = await drive.files.list({
    q: "name contains 'DATOS' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false",
    pageSize: 30,
    fields: "files(id, name, modifiedTime)",
    orderBy: "modifiedTime desc",
  });
  for (const f of wider.data.files) {
    console.log(`  - ${f.name}  [${f.id}]  mod ${f.modifiedTime}`);
  }
  process.exit(0);
}

for (const f of res.data.files) {
  console.log(`📄 ${f.name}`);
  console.log(`   id: ${f.id}`);
  console.log(`   link: ${f.webViewLink}`);
  console.log(`   modificado: ${f.modifiedTime}`);
  console.log(`   parents: ${f.parents}`);
  console.log();

  try {
    const meta = await sheets.spreadsheets.get({
      spreadsheetId: f.id,
      fields: "sheets(properties(title,sheetId,gridProperties))",
    });
    console.log(`   Tabs (${meta.data.sheets.length}):`);
    for (const s of meta.data.sheets) {
      const p = s.properties;
      console.log(`     - "${p.title}" (${p.gridProperties.rowCount}r × ${p.gridProperties.columnCount}c)  [gid: ${p.sheetId}]`);
    }
    console.log();

    // Para cada tab, leer primeras 5 filas para ver headers
    for (const s of meta.data.sheets) {
      const title = s.properties.title;
      console.log(`   --- Tab "${title}" ---`);
      try {
        const data = await sheets.spreadsheets.values.get({
          spreadsheetId: f.id,
          range: `'${title}'!A1:Z10`,
        });
        const rows = data.data.values || [];
        rows.forEach((row, idx) => {
          // Solo mostrar filas no vacías
          const filled = row.filter((c) => c && String(c).trim().length > 0);
          if (filled.length === 0) return;
          console.log(`     row ${idx + 1}:`);
          row.forEach((cell, i) => {
            const col = String.fromCharCode(65 + i);
            if (cell && String(cell).trim()) {
              const v = String(cell).substring(0, 80);
              console.log(`       ${col}: ${v}`);
            }
          });
        });
      } catch (e) {
        console.log(`     ! ${e.message}`);
      }
      console.log();
    }
  } catch (e) {
    console.log(`   ! No se puede leer: ${e.message}`);
  }
}
