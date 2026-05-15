import { google } from "googleapis";
import dotenv from "dotenv";

dotenv.config({ path: "/Users/matiaskw/Desktop/masunori-dashboard/.env.prod.gcp" });

const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
const saJson = JSON.parse(raw.replace(/\n/g, "\\n"));
const auth = new google.auth.GoogleAuth({
  credentials: saJson,
  scopes: ["https://www.googleapis.com/auth/drive"],
});
const drive = google.drive({ version: "v3", auth });

// 1. Carpetas creadas/modificadas hoy o ayer
console.log("=== Carpetas modificadas en las ultimas 48h ===\n");
const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
const folders = await drive.files.list({
  q: `mimeType='application/vnd.google-apps.folder' and modifiedTime > '${since}' and trashed=false`,
  pageSize: 50,
  fields: "files(id, name, modifiedTime, parents)",
  orderBy: "modifiedTime desc",
});
console.log(`Total: ${folders.data.files.length}`);
for (const f of folders.data.files) {
  console.log(`📁 ${f.name}  [${f.id}]  mod ${f.modifiedTime}`);
}

// 2. Imagenes (png/svg) modificadas/creadas en 48h
console.log("\n\n=== Imagenes recientes (PNG/SVG/JPEG) ===");
const imgs = await drive.files.list({
  q: `(mimeType='image/png' or mimeType='image/svg+xml' or mimeType='image/jpeg') and modifiedTime > '${since}' and trashed=false`,
  pageSize: 50,
  fields: "files(id, name, mimeType, modifiedTime, parents, size)",
  orderBy: "modifiedTime desc",
});
console.log(`Total: ${imgs.data.files.length}`);
for (const f of imgs.data.files) {
  console.log(`  [${f.mimeType}] ${f.name}  (${f.size} bytes)  parents=${f.parents}  [${f.id}]`);
}
