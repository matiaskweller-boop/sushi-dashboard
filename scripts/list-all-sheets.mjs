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

console.log("=== TODOS los archivos compartidos con el service account ===\n");

const all = await drive.files.list({
  q: "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false",
  pageSize: 200,
  fields: "files(id, name, modifiedTime, parents, owners)",
  orderBy: "modifiedTime desc",
});

console.log(`Spreadsheets: ${all.data.files.length}`);
for (const f of all.data.files) {
  const owners = (f.owners || []).map((o) => o.emailAddress).join(", ");
  console.log(`  📊 ${f.name}`);
  console.log(`     id: ${f.id}`);
  console.log(`     owners: ${owners}`);
  console.log();
}

console.log("\n=== Folders ===");
const folders = await drive.files.list({
  q: "mimeType='application/vnd.google-apps.folder' and trashed=false",
  pageSize: 200,
  fields: "files(id, name, modifiedTime, parents)",
  orderBy: "modifiedTime desc",
});
console.log(`Folders: ${folders.data.files.length}`);
for (const f of folders.data.files) {
  console.log(`  📁 ${f.name}  [${f.id}]`);
}
