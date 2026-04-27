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

const ROOT_ID = "12dnPErx1BVARANllU1LESCN3qKrwdKsK";

async function listFolder(folderId, indent = "") {
  const res = await drive.files.list({
    q: `'${folderId}' in parents and trashed=false`,
    pageSize: 500,
    fields: "files(id, name, mimeType, modifiedTime, size)",
    orderBy: "modifiedTime desc",
  });
  const files = res.data.files || [];
  for (const f of files) {
    const isFolder = f.mimeType === "application/vnd.google-apps.folder";
    const date = f.modifiedTime?.substring(0, 10) || "";
    const type = f.mimeType.replace("application/vnd.google-apps.", "").replace("application/", "");
    const icon = isFolder ? "📁" : type.includes("spreadsheet") ? "📊" : type.includes("document") ? "📄" : type.includes("pdf") ? "📑" : "📎";
    console.log(`${indent}${icon} ${f.name} [${date}] (${type})`);
    if (isFolder) {
      await listFolder(f.id, indent + "  ");
    }
  }
}

console.log("=== MASUNORI folder structure ===\n");
await listFolder(ROOT_ID);
