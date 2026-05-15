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

const candidates = [
  { id: "12dnPErx1BVARANllU1LESCN3qKrwdKsK", name: "MASUNORI y Claude" },
  { id: "1NQCPi8q6RruYQvwjoKlVL7wn8Murw9-n", name: "DOCUMENTACION LOCALES" },
  { id: "1czzxQeHN-eIyhgKKgZbsaqL6-CXWJc8q", name: "PALERMO DOCUMENTOS IMPORTANTES" },
];

for (const f of candidates) {
  console.log(`\n📁 ${f.name}  [${f.id}]`);
  console.log("─".repeat(60));
  try {
    // Listar todo el contenido (no recursivo)
    const res = await drive.files.list({
      q: `'${f.id}' in parents and trashed=false`,
      pageSize: 200,
      fields: "files(id, name, mimeType, size)",
      orderBy: "name",
    });
    for (const item of res.data.files) {
      const type = item.mimeType.replace("application/vnd.google-apps.", "");
      console.log(`  [${type.padEnd(14)}] ${item.name}`);
    }
  } catch (e) {
    console.log(`  ! ${e.message}`);
  }
}
