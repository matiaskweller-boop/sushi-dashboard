import { google } from "googleapis";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config({ path: "/Users/matiaskw/Desktop/masunori-dashboard/.env.prod.gcp" });

const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
const saJson = JSON.parse(raw.replace(/\n/g, "\\n"));
const auth = new google.auth.GoogleAuth({
  credentials: saJson,
  scopes: ["https://www.googleapis.com/auth/drive"],
});
const drive = google.drive({ version: "v3", auth });

const LOGOS_FOLDER = "1MVA_mbQg9u6EfRCxvTBxvYf_pqxozBRY";
const OUT_DIR = "/tmp/masunori-logos";
fs.mkdirSync(OUT_DIR, { recursive: true });

const items = await drive.files.list({
  q: `'${LOGOS_FOLDER}' in parents and trashed=false`,
  pageSize: 50,
  fields: "files(id, name, mimeType, size)",
});

console.log(`Archivos en carpeta logos: ${items.data.files.length}\n`);
for (const f of items.data.files) {
  console.log(`Descargando ${f.name} (${f.size} bytes)...`);
  if (parseInt(f.size) === 0) {
    console.log("  ⚠️  Archivo vacio, skip");
    continue;
  }
  const res = await drive.files.get(
    { fileId: f.id, alt: "media" },
    { responseType: "arraybuffer" }
  );
  const buf = Buffer.from(res.data);
  const safeName = f.name.replace(/[^a-zA-Z0-9.]/g, "_");
  const outPath = path.join(OUT_DIR, safeName);
  fs.writeFileSync(outPath, buf);
  console.log(`  ✓ ${outPath} (${buf.length} bytes)`);
}

console.log("\nDONE");
console.log("Archivos en " + OUT_DIR + ":");
const files = fs.readdirSync(OUT_DIR);
files.forEach(f => console.log("  " + f));
