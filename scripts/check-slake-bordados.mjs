import { google } from "googleapis";
import dotenv from "dotenv";

dotenv.config({ path: "/Users/matiaskw/Desktop/masunori-dashboard/.env.prod.gcp" });

const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
const saJson = JSON.parse(raw.replace(/\n/g, "\\n"));
const auth = new google.auth.GoogleAuth({
  credentials: saJson,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const sheets = google.sheets({ version: "v4", auth });

const DATOS_ID = "1DuEAFK3MxUZalMPzIfpT9ofrIuThOgu8bSvfbDWRBXk";

const res = await sheets.spreadsheets.values.get({
  spreadsheetId: DATOS_ID,
  range: "'DATOS PROVEEDORES'!A2:K",
});
const rows = res.data.values || [];

console.log("Buscando 'SLAKE', 'MIDA', 'BORDADOS', 'ZETA' en DATOS PROVEEDORES...\n");
let foundSlake = false;
let foundMida = false;
let foundBordados = false;
for (const row of rows) {
  const prov = (row[0] || "").toUpperCase();
  const razon = (row[3] || "").toUpperCase();
  const all = `${prov} ${razon}`;
  if (all.includes("SLAKE")) { console.log(`SLAKE en: PROV="${row[0]}" RAZON="${row[3]}"`); foundSlake = true; }
  if (all.includes("MIDA")) { console.log(`MIDA en: PROV="${row[0]}" RAZON="${row[3]}"`); foundMida = true; }
  if (all.includes("EMBOTELLAD")) { console.log(`EMBOTELLAD en: PROV="${row[0]}" RAZON="${row[3]}"`); }
  if (all.includes("BORDADOS")) { console.log(`BORDADOS en: PROV="${row[0]}" RAZON="${row[3]}"`); foundBordados = true; }
  if (all.includes("ZETA")) { console.log(`ZETA en: PROV="${row[0]}" RAZON="${row[3]}"`); }
}

console.log(`\nSLAKE encontrado: ${foundSlake}`);
console.log(`MIDA encontrado: ${foundMida}`);
console.log(`BORDADOS encontrado: ${foundBordados}`);
