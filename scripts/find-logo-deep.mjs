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

// 1. Listar TODAS las carpetas accesibles
console.log("=== Todas las carpetas accesibles ===\n");
const folders = await drive.files.list({
  q: "mimeType='application/vnd.google-apps.folder' and trashed=false",
  pageSize: 200,
  fields: "files(id, name, parents, modifiedTime)",
  orderBy: "name",
});
for (const f of folders.data.files) {
  console.log(`📁 ${f.name}  [${f.id}]`);
}

// 2. Para cada carpeta, listar imagenes adentro (no profundo)
console.log("\n\n=== Imagenes dentro de cada carpeta ===");
for (const folder of folders.data.files) {
  const inside = await drive.files.list({
    q: `'${folder.id}' in parents and (mimeType contains 'image' or mimeType contains 'pdf' or name contains 'logo' or name contains 'marca') and trashed=false`,
    pageSize: 50,
    fields: "files(id, name, mimeType)",
  });
  if (inside.data.files.length > 0) {
    console.log(`\n📁 ${folder.name}:`);
    for (const f of inside.data.files) {
      const isLogo = f.name.toLowerCase().includes("logo") ||
                     f.name.toLowerCase().includes("marca") ||
                     f.name.toLowerCase().includes("isotipo") ||
                     f.name.toLowerCase().includes("masunori") ||
                     f.name.toLowerCase().includes("bonsai");
      console.log(`   ${isLogo ? "⭐" : "  "} [${f.mimeType.replace("application/vnd.google-apps.", "")}] ${f.name}  [${f.id}]`);
    }
  }
}
