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

const SUCURSALES = {
  Palermo: process.env.SHEET_PALERMO_2026,
  Belgrano: process.env.SHEET_BELGRANO_2026,
  Madero: process.env.SHEET_MADERO_2026,
};

const KEYWORDS = ["PALERMO", "BELGRANO", "MADERO", "ENVIO", "TRANSFER", "INTER", "SUCURSAL"];

for (const [suc, id] of Object.entries(SUCURSALES)) {
  console.log(`\n══════════════════════════════════ ${suc} ══════════════════════════════════`);

  // Leer EGRESOS y filtrar filas que matcheen keywords
  const data = await sheets.spreadsheets.values.get({
    spreadsheetId: id,
    range: "EGRESOS!A1:U6000",
  });
  const rows = data.data.values || [];
  const headers = rows[0] || [];
  console.log(`Headers: ${headers.slice(0, 16).join(" | ")}`);
  console.log(`Total filas: ${rows.length - 1}`);

  // Para cada fila, juntar los campos en string para buscar
  const matches = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;
    const allText = row.join(" ").toUpperCase();
    if (KEYWORDS.some((k) => allText.includes(k))) {
      matches.push({ rownum: i + 1, row });
    }
  }

  console.log(`\nFilas que mencionan PALERMO/BELGRANO/MADERO/ENVIO/TRANSFER (${matches.length}):`);
  matches.slice(0, 25).forEach(({ rownum, row }) => {
    // Mostrar las cols clave: B (FechaIng), C (FechaFC), E (Proveedor), F (Tipo), G (Nro), H (Rubro), I (Insumos), J (Total), M (Metodo)
    const summary = [
      row[1] || "",     // B Fecha ing
      row[4] || "",     // E Proveedor
      row[7] || "",     // H Rubro
      (row[8] || "").substring(0, 35), // I Insumo
      row[9] || "",     // J Total
      row[12] || "",    // M Metodo Pago
    ].map((s) => s.toString().padEnd(20).substring(0, 20));
    console.log(`  ${rownum}: ${summary.join(" | ")}`);
  });
  if (matches.length > 25) console.log(`  ... y ${matches.length - 25} más`);

  // También veamos los rubros únicos que tengan "Envio" o similar
  const enviosRubros = new Set();
  for (const { row } of matches) {
    const rubro = (row[7] || "").toString().trim();
    if (rubro) enviosRubros.add(rubro);
  }
  console.log(`\nRubros distintos que matchearon: ${Array.from(enviosRubros).join(", ")}`);

  // Y los proveedores únicos
  const enviosProvs = new Set();
  for (const { row } of matches) {
    const prov = (row[4] || "").toString().trim();
    if (prov) enviosProvs.add(prov);
  }
  console.log(`\nProveedores distintos que matchearon (top 30):`);
  Array.from(enviosProvs).slice(0, 30).forEach((p) => console.log(`  - "${p}"`));
}
