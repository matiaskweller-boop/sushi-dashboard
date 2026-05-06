import { google } from "googleapis";
import dotenv from "dotenv";

dotenv.config({ path: "/Users/matiaskw/Desktop/masunori-dashboard/.env.prod.gcp" });

const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
const saJson = JSON.parse(raw.replace(/\n/g, "\\n"));
const auth = new google.auth.GoogleAuth({
  credentials: saJson,
  scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
});
const sheets = google.sheets({ version: "v4", auth });

const SHEET = process.env.SHEET_PALERMO_2026;

// Leer DATOSSS completo
const data = await sheets.spreadsheets.values.get({
  spreadsheetId: SHEET,
  range: "DATOSSS!A1:M500",
});
const rows = data.data.values || [];

console.log(`Total rows: ${rows.length}\n`);

// Headers
console.log("== HEADERS ==");
console.log(rows[0]);
console.log();

// Extract rubros (col B) - complete list
const rubros = rows.slice(1).map(r => r[1]).filter(v => v && v.toString().trim()).map(s => s.toString().trim());
console.log(`== RUBROS (${rubros.length}) ==`);
rubros.forEach(r => console.log(`  - "${r}"`));
console.log();

// Extract insumos (col D)
const insumos = rows.slice(1).map(r => r[3]).filter(v => v && v.toString().trim()).map(s => s.toString().trim());
console.log(`== INSUMOS (${insumos.length}) ==`);
insumos.slice(0, 30).forEach(r => console.log(`  - "${r}"`));
console.log(`  ... (${insumos.length - 30} más)`);
console.log();

// Tipos comprobante (col K)
const tipos = rows.slice(1).map(r => r[10]).filter(v => v && v.toString().trim()).map(s => s.toString().trim());
console.log(`== TIPOS COMPROBANTE (${tipos.length}) ==`);
tipos.forEach(r => console.log(`  - "${r}"`));
console.log();

// Métodos de pago (col L)
const metodos = rows.slice(1).map(r => r[11]).filter(v => v && v.toString().trim()).map(s => s.toString().trim());
console.log(`== METODOS DE PAGO (${metodos.length}) ==`);
metodos.forEach(r => console.log(`  - "${r}"`));
