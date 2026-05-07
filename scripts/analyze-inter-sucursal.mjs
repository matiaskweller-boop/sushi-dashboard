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

function parseArs(s) {
  if (!s) return 0;
  const cleaned = s.toString().replace(/[^\d,\-]/g, "").replace(",", ".");
  return parseFloat(cleaned) || 0;
}

// Patrones para detectar movimientos inter-sucursal
const PATTERNS_INTER = [
  /PAGO POR GASTO HECHO POR/i,
  /\benvio\s+de\s+(mercaderia|pesca|trucha|pollo|.+)\s+(de|a|entre)\s+(palermo|belgrano|madero)/i,
  /\benvio\s+entre\s+locales/i,
  /\bdeuda\s+con\s+(palermo|belgrano|madero)/i,
  /\bflete\s+que\s+pago\s+(palermo|belgrano|madero)/i,
  /\bentre\s+sucursales/i,
  /\buber\s+entre\s+locales/i,
];

// Solo nombres de sucursales (suelto, para indicar mencion)
const SUC_NAMES = ["palermo", "belgrano", "madero"];

function isInterSucursalRow(rubro, insumo, proveedor) {
  const allText = `${rubro} ${insumo} ${proveedor}`.toLowerCase();
  return PATTERNS_INTER.some((re) => re.test(allText));
}

function findOtherSucursalMentioned(text, currentSucursal) {
  const lower = text.toLowerCase();
  const mentioned = SUC_NAMES.filter((s) => lower.includes(s) && s !== currentSucursal.toLowerCase());
  return mentioned;
}

for (const [suc, id] of Object.entries(SUCURSALES)) {
  console.log(`\n══════════════ ${suc.toUpperCase()} ══════════════`);

  const data = await sheets.spreadsheets.values.get({
    spreadsheetId: id,
    range: "EGRESOS!A1:U6000",
  });
  const rows = data.data.values || [];
  console.log(`Total filas con datos: ${rows.length - 1}`);

  // Filtrar filas inter-sucursales por patrón
  const interRows = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] || [];
    const fechaIng = (row[1] || "").toString();
    const fechaFC = (row[2] || "").toString();
    const proveedor = (row[4] || "").toString();
    const rubro = (row[7] || "").toString();
    const insumo = (row[8] || "").toString();
    const total = parseArs(row[9] || "");
    const metodo = (row[12] || "").toString();

    if (!fechaIng && !fechaFC) continue;
    if (total === 0) continue;

    if (isInterSucursalRow(rubro, insumo, proveedor)) {
      const otherSucs = findOtherSucursalMentioned(`${rubro} ${insumo} ${proveedor}`, suc);
      interRows.push({
        rownum: i + 1,
        fecha: fechaIng || fechaFC,
        proveedor,
        rubro: rubro.trim(),
        insumo: insumo.trim(),
        total,
        metodo,
        otherSucs,
      });
    }
  }

  console.log(`Filas inter-sucursal detectadas por patrón: ${interRows.length}`);
  const totalInter = interRows.reduce((s, r) => s + r.total, 0);
  console.log(`Total $ en filas inter-sucursal: $${totalInter.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

  // Por sucursal mencionada
  const porSuc = { palermo: 0, belgrano: 0, madero: 0, ninguna: 0 };
  for (const r of interRows) {
    if (r.otherSucs.length === 0) {
      porSuc.ninguna += r.total;
    } else {
      for (const s of r.otherSucs) {
        porSuc[s] += r.total;
      }
    }
  }
  console.log(`\nDistribución por sucursal mencionada (texto):`);
  Object.entries(porSuc).forEach(([s, total]) => {
    if (s === suc.toLowerCase()) return;
    console.log(`  - menciona ${s}: $${total.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  });

  // Top 15 patterns de rubros encontrados
  const rubroCount = {};
  for (const r of interRows) {
    rubroCount[r.rubro] = (rubroCount[r.rubro] || 0) + r.total;
  }
  const topRubros = Object.entries(rubroCount).sort(([, a], [, b]) => b - a).slice(0, 10);
  console.log(`\nTop rubros inter-sucursal:`);
  for (const [rubro, total] of topRubros) {
    console.log(`  ${rubro.substring(0, 80).padEnd(80)} $${total.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`);
  }

  // Detectar duplicados: pares de filas con mismo monto + mismo día (próximas filas)
  // y descripcion similar
  console.log(`\nMuestras de filas inter-sucursal (primeras 8):`);
  interRows.slice(0, 8).forEach((r) => {
    console.log(`  ${r.fecha.padEnd(12)} | $${String(r.total).padEnd(12)} | rubro="${r.rubro.substring(0, 35).padEnd(35)}" | insumo="${r.insumo.substring(0, 30)}"`);
  });
}

// Cross-check: encontrar montos coincidentes entre sucursales
console.log(`\n══════════════ CROSS-CHECK ENTRE SUCURSALES ══════════════`);
console.log(`Buscando posibles "envíos" donde el mismo monto aparece en otra sucursal el mismo día...\n`);

// Cargar todas las filas con monto de las 3 sucursales
const allRows = {};
for (const [suc, id] of Object.entries(SUCURSALES)) {
  const data = await sheets.spreadsheets.values.get({
    spreadsheetId: id,
    range: "EGRESOS!A1:U6000",
  });
  const rows = data.data.values || [];
  allRows[suc] = rows.slice(1).map((r, i) => ({
    rownum: i + 2,
    fecha: ((r[1] || "") + "").trim(),
    fechaFC: ((r[2] || "") + "").trim(),
    proveedor: ((r[4] || "") + "").trim(),
    rubro: ((r[7] || "") + "").trim(),
    insumo: ((r[8] || "") + "").trim(),
    total: parseArs(r[9] || ""),
  })).filter(r => r.total > 0);
}

// Función para normalizar fecha a YYYY-MM-DD
function normalizeDate(s) {
  // "DD/M/YYYY" o "DD/MM/YY" → YYYY-MM-DD
  const m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (!m) return s;
  const day = m[1].padStart(2, "0");
  const month = m[2].padStart(2, "0");
  let year = m[3];
  if (year.length === 2) year = "20" + year;
  return `${year}-${month}-${day}`;
}

// Buscar coincidencias de monto + fecha entre Madero y Palermo / Belgrano
let matchCount = 0;
const tolerance = 0.01; // tolerancia ARS
for (const r of allRows.Madero) {
  if (r.total === 0) continue;
  const fechaM = normalizeDate(r.fecha) || normalizeDate(r.fechaFC);
  if (!fechaM) continue;

  // Buscar en Palermo
  for (const p of allRows.Palermo) {
    if (Math.abs(p.total - r.total) > tolerance) continue;
    const fechaP = normalizeDate(p.fecha) || normalizeDate(p.fechaFC);
    if (fechaM !== fechaP) continue;
    matchCount++;
    if (matchCount <= 15) {
      console.log(`MADERO row ${r.rownum} ↔ PALERMO row ${p.rownum}: ${fechaM} | $${r.total.toLocaleString("es-AR")}`);
      console.log(`  Madero: rubro="${r.rubro.substring(0, 40)}" insumo="${r.insumo.substring(0, 30)}"`);
      console.log(`  Palermo: rubro="${p.rubro.substring(0, 40)}" insumo="${p.insumo.substring(0, 30)}"`);
    }
    break;
  }
}
console.log(`\nTotal pares Madero↔Palermo (mismo monto, mismo día): ${matchCount}`);
