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

console.log("=== Buscando imagenes del logo Masunori ===\n");

const q = "(name contains 'logo' or name contains 'Logo' or name contains 'LOGO' or name contains 'bonsai' or name contains 'isotipo' or name contains 'marca') and (mimeType='image/png' or mimeType='image/jpeg' or mimeType='image/svg+xml' or mimeType contains 'image') and trashed=false";

const res = await drive.files.list({
  q,
  pageSize: 50,
  fields: "files(id, name, mimeType, modifiedTime, parents, size)",
  orderBy: "modifiedTime desc",
});

console.log(`Imagenes encontradas: ${res.data.files.length}`);
for (const f of res.data.files) {
  console.log(`  [${f.mimeType}] ${f.name}  (${f.size} bytes)  [${f.id}]`);
}

// Buscar tambien todas las imagenes en folders de Masunori
console.log("\n=== Todas las imagenes accesibles ===");
const allImg = await drive.files.list({
  q: "(mimeType='image/png' or mimeType='image/jpeg' or mimeType='image/svg+xml') and trashed=false",
  pageSize: 50,
  fields: "files(id, name, mimeType, modifiedTime, size)",
  orderBy: "modifiedTime desc",
});
console.log(`Total imagenes: ${allImg.data.files.length}`);
for (const f of allImg.data.files.slice(0, 30)) {
  console.log(`  [${f.mimeType}] ${f.name}  [${f.id}]`);
}
