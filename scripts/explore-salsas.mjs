import { google } from "googleapis";
import dotenv from "dotenv";
import * as XLSX from "xlsx";
dotenv.config({ path: "/Users/matiaskw/Desktop/masunori-dashboard/.env.prod.gcp" });
const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
const saJson = JSON.parse(raw.replace(/\n/g, "\\n"));
const auth = new google.auth.GoogleAuth({ credentials: saJson, scopes: ["https://www.googleapis.com/auth/drive"] });
const drive = google.drive({ version: "v3", auth });
const res = await drive.files.get({ fileId: "1JrWveHVt6Qj6LopEUXwLInngEyZxTsGu", alt: "media" }, { responseType: "arraybuffer" });
const wb = XLSX.read(Buffer.from(res.data), { type: "buffer" });
const rows = XLSX.utils.sheet_to_json(wb.Sheets["SALSAS"], { header: 1, defval: "" });
console.log("Headers row 3-4:");
console.log(rows[2]);
console.log(rows[3]);
console.log("\nMuestra row 5-15:");
for (let i = 4; i < 16; i++) {
  const r = rows[i] || [];
  const filled = r.map((c, idx) => c !== "" && c !== null && c !== undefined ? `${String.fromCharCode(65+idx)}=${String(c).substring(0,40)}` : null).filter(Boolean);
  if (filled.length > 0) console.log(`  ${i+1}: ${filled.join(" | ")}`);
}
