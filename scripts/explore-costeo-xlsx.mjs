import { google } from "googleapis";
import dotenv from "dotenv";
import * as XLSX from "xlsx";

dotenv.config({ path: "/Users/matiaskw/Desktop/masunori-dashboard/.env.prod.gcp" });

const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
const saJson = JSON.parse(raw.replace(/\n/g, "\\n"));
const auth = new google.auth.GoogleAuth({
  credentials: saJson,
  scopes: ["https://www.googleapis.com/auth/drive"],
});
const drive = google.drive({ version: "v3", auth });

const COSTEO_ID = "1JrWveHVt6Qj6LopEUXwLInngEyZxTsGu";

console.log("=== Descargando MASUNORI_COSTEO_DASHBOARD.xlsx ===\n");
const res = await drive.files.get(
  { fileId: COSTEO_ID, alt: "media" },
  { responseType: "arraybuffer" }
);
const buffer = Buffer.from(res.data);
console.log(`Bytes: ${buffer.length}`);

const wb = XLSX.read(buffer, { type: "buffer" });
console.log(`\nTabs (${wb.SheetNames.length}):`);
for (const name of wb.SheetNames) {
  const ws = wb.Sheets[name];
  const range = ws["!ref"] || "";
  console.log(`  - "${name}" (range: ${range})`);
}

// Para cada tab, mostrar las primeras 8 filas
for (const name of wb.SheetNames.slice(0, 10)) {
  console.log(`\n=== Tab "${name}" (primeras 8 filas) ===`);
  const ws = wb.Sheets[name];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
  for (let i = 0; i < Math.min(8, rows.length); i++) {
    const filled = rows[i].map((c, ci) => {
      const col = String.fromCharCode(65 + ci);
      if (c !== "" && c !== null && c !== undefined) return `${col}=${String(c).substring(0, 50)}`;
      return null;
    }).filter(Boolean);
    if (filled.length > 0) {
      console.log(`  row ${i + 1}: ${filled.join(" | ")}`);
    }
  }
  console.log(`  Total rows: ${rows.length}`);
}
