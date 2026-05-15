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

console.log("=== Buscando carpeta/archivos de 'recetas' ===\n");

// 1. Buscar carpetas con 'receta'
const folders = await drive.files.list({
  q: "mimeType='application/vnd.google-apps.folder' and (name contains 'receta' or name contains 'Receta' or name contains 'RECETA') and trashed=false",
  pageSize: 30,
  fields: "files(id, name, modifiedTime, parents)",
});
console.log(`Carpetas encontradas: ${folders.data.files.length}`);
for (const f of folders.data.files) {
  console.log(`  📁 ${f.name}  [${f.id}]`);
}

// 2. Buscar spreadsheets con 'receta'
console.log("\n=== Spreadsheets con 'receta' ===");
const recetasSheets = await drive.files.list({
  q: "mimeType='application/vnd.google-apps.spreadsheet' and (name contains 'receta' or name contains 'Receta' or name contains 'RECETA') and trashed=false",
  pageSize: 30,
  fields: "files(id, name, modifiedTime, parents)",
});
console.log(`Spreadsheets: ${recetasSheets.data.files.length}`);
for (const f of recetasSheets.data.files) {
  console.log(`  📊 ${f.name}  [${f.id}]  mod ${f.modifiedTime}`);
}

// 3. Si encontró carpetas, listar contenido
for (const folder of folders.data.files) {
  console.log(`\n=== Contenido de "${folder.name}" ===`);
  const contents = await drive.files.list({
    q: `'${folder.id}' in parents and trashed=false`,
    pageSize: 300,
    fields: "files(id, name, mimeType, modifiedTime)",
    orderBy: "name",
  });
  console.log(`Total archivos: ${contents.data.files.length}`);
  for (const f of contents.data.files.slice(0, 50)) {
    const type = f.mimeType.replace("application/vnd.google-apps.", "").substring(0, 12);
    console.log(`  [${type.padEnd(12)}] ${f.name}`);
  }
  if (contents.data.files.length > 50) {
    console.log(`  ... y ${contents.data.files.length - 50} más`);
  }
}
