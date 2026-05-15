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

const TRAGOS_ID = "1hIEQr6aRdYiemyTOYexm9UJTBXxfnyvBbSbEW_yi4d8";

const meta = await sheets.spreadsheets.get({
  spreadsheetId: TRAGOS_ID,
  fields: "sheets(properties(title,gridProperties))",
});
console.log(`Tabs de "tragos":`);
for (const s of meta.data.sheets) {
  const p = s.properties;
  console.log(`  - "${p.title}" (${p.gridProperties.rowCount}r × ${p.gridProperties.columnCount}c)`);
}

for (const s of meta.data.sheets.slice(0, 3)) {
  const t = s.properties.title;
  console.log(`\n=== ${t} (primeras 15 filas) ===`);
  const data = await sheets.spreadsheets.values.get({
    spreadsheetId: TRAGOS_ID,
    range: `'${t}'!A1:M20`,
  });
  for (const [i, row] of (data.data.values || []).entries()) {
    const filled = row.filter((c) => c && String(c).trim());
    if (filled.length === 0) continue;
    console.log(`  row ${i+1}:`);
    row.forEach((cell, ci) => {
      const col = String.fromCharCode(65 + ci);
      if (cell && String(cell).trim()) {
        console.log(`    ${col}: ${String(cell).substring(0,60)}`);
      }
    });
  }
}

// Check "RECETA DE TODO" folder
console.log("\n=== Re-explorando 'RECETA DE TODO' con shareds links ===");
const drive = google.drive({ version: "v3", auth });
const contents = await drive.files.list({
  q: "'1hILtGrl1zBIMDNvw1ad4GT2oTSD-FCIu' in parents and trashed=false",
  pageSize: 300,
  fields: "files(id, name, mimeType, modifiedTime, owners)",
  orderBy: "name",
  includeItemsFromAllDrives: true,
  supportsAllDrives: true,
});
console.log(`Archivos en folder: ${contents.data.files.length}`);
for (const f of contents.data.files) {
  console.log(`  [${f.mimeType.replace("application/vnd.google-apps.", "")}] ${f.name}`);
}
