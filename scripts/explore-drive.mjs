import { google } from "googleapis";
import dotenv from "dotenv";

dotenv.config({ path: "/Users/matiaskw/Desktop/masunori-dashboard/.env.prod.gcp" });

// Vercel stored JSON has real newlines inside strings that break JSON.parse.
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

console.log("=== Files shared with service account ===");
const res = await drive.files.list({
  pageSize: 100,
  fields: "files(id, name, mimeType, modifiedTime, size, parents, webViewLink)",
  orderBy: "modifiedTime desc",
});

if (res.data.files.length === 0) {
  console.log("No files found. Share a folder with:");
  console.log("  masunori-erp-sa@masunori-dashboard.iam.gserviceaccount.com");
  process.exit(1);
}

for (const f of res.data.files) {
  const type = f.mimeType.replace("application/vnd.google-apps.", "").replace("application/", "");
  console.log(`  [${type.padEnd(20)}] ${f.name}  (${f.id})`);
}

const folder = res.data.files.find(
  (f) => f.name === "Masunori" && f.mimeType === "application/vnd.google-apps.folder"
);

if (folder) {
  console.log(`\n=== Contents of Masunori folder (${folder.id}) ===`);
  const contents = await drive.files.list({
    q: `'${folder.id}' in parents and trashed=false`,
    pageSize: 200,
    fields: "files(id, name, mimeType, modifiedTime, size)",
    orderBy: "name",
  });
  for (const f of contents.data.files) {
    const type = f.mimeType.replace("application/vnd.google-apps.", "").replace("application/", "");
    console.log(`  [${type.padEnd(20)}] ${f.name}`);
  }
  console.log(`\nFolder ID: ${folder.id}`);
} else {
  console.log("\n⚠️  No 'Masunori' folder found at root.");
  res.data.files
    .filter((f) => f.mimeType === "application/vnd.google-apps.folder")
    .forEach((f) => console.log(`  Folder: ${f.name} (${f.id})`));
}
