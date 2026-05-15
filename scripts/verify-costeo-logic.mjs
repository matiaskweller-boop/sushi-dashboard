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
console.log("Descargando MASUNORI_COSTEO_DASHBOARD.xlsx...\n");
const res = await drive.files.get({ fileId: COSTEO_ID, alt: "media" }, { responseType: "arraybuffer" });
const buf = Buffer.from(res.data);
const wb = XLSX.read(buf, { type: "buffer" });

function rowsOf(tab) {
  return XLSX.utils.sheet_to_json(wb.Sheets[tab], { header: 1, defval: "" });
}

// ─── 1. INGREDIENTES: verificar formula merma ───
console.log("=".repeat(70));
console.log("1. INGREDIENTES — verificación de la fórmula de merma");
console.log("=".repeat(70));
const ing = rowsOf("INGREDIENTES");
// Headers en row 2 (idx 1):
// A: RUBRO  B: INSUMO  C: UNIDAD  D: CANT. UNIDAD  E: PRECIO BRUTO
// F: % MERMA  G: PRECIO NETO  H: ÚLTIMA COMPRA
console.log("Header:", ing[1]);

const examples = [];
for (let i = 2; i < ing.length; i++) {
  const r = ing[i];
  if (!r[1]) continue;
  const bruto = parseFloat(r[4]);
  const merma = parseFloat(r[5]);
  const neto = parseFloat(r[6]);
  if (isNaN(bruto) || isNaN(neto)) continue;

  // Probemos las 2 fórmulas:
  // F1 (multiplicativa, como ellos parecen usar): neto = bruto × (1 + |merma|)
  // F2 (correcta para % perdido): neto = bruto / (1 - |merma|)
  const f1 = bruto * (1 + Math.abs(merma));
  const f2 = merma !== 0 && Math.abs(merma) < 1 ? bruto / (1 - Math.abs(merma)) : bruto;

  const matchF1 = Math.abs(neto - f1) < 0.5;
  const matchF2 = Math.abs(neto - f2) < 0.5;

  examples.push({
    insumo: r[1],
    bruto: bruto.toFixed(2),
    merma,
    neto: neto.toFixed(2),
    f1Result: f1.toFixed(2),
    f2Result: f2.toFixed(2),
    matchF1,
    matchF2,
  });
}

console.log(`\nMuestra (primeros 15 ingredientes con merma ≠ 0):`);
const conMerma = examples.filter(e => e.merma !== 0).slice(0, 15);
for (const e of conMerma) {
  console.log(`  ${e.insumo.padEnd(30)} bruto=${e.bruto}  merma=${e.merma}  neto=${e.neto}  F1×(1+merm)=${e.f1Result} ${e.matchF1 ? "✓" : "✗"}  F2/(1-merm)=${e.f2Result} ${e.matchF2 ? "✓" : "✗"}`);
}

// Estadísticas
const totalConMerma = examples.filter(e => e.merma !== 0).length;
const f1Wins = examples.filter(e => e.merma !== 0 && e.matchF1).length;
const f2Wins = examples.filter(e => e.merma !== 0 && e.matchF2).length;
console.log(`\nTotal con merma ≠ 0: ${totalConMerma}`);
console.log(`Cumplen F1 (bruto × 1+merma): ${f1Wins}/${totalConMerma}`);
console.log(`Cumplen F2 (bruto / 1-merma): ${f2Wins}/${totalConMerma}`);

// ─── 2. RECETAS: verificar costo_linea = cant × precio_neto ───
console.log("\n" + "=".repeat(70));
console.log("2. RECETAS — verificación COSTO LINEA = CANTIDAD × PRECIO NETO");
console.log("=".repeat(70));
const rec = rowsOf("RECETAS");
// Header row 3 (idx 2):
// A: RECETA  B: INGREDIENTE  C: RUBRO  D: CANTIDAD(kg)  E: UNIDAD
// F: PRECIO NETO $/kg  G: COSTO LINEA  H: %  I: NOTAS
console.log("Header:", rec[2]);
let recVerified = 0, recBad = 0;
const badRecetas = [];
for (let i = 3; i < rec.length; i++) {
  const r = rec[i];
  const receta = r[0] || "";
  if (receta.includes("▶") || !r[1]) continue;
  const cantidad = parseFloat(r[3]);
  const precioNeto = parseFloat(r[5]);
  const costoLinea = parseFloat(r[6]);
  if (isNaN(cantidad) || isNaN(precioNeto) || isNaN(costoLinea)) continue;
  const expected = cantidad * precioNeto;
  const diff = Math.abs(costoLinea - expected);
  if (diff > 0.5) {
    recBad++;
    if (badRecetas.length < 5) badRecetas.push({ receta, ing: r[1], cant: cantidad, neto: precioNeto, costo: costoLinea, esperado: expected });
  } else {
    recVerified++;
  }
}
console.log(`Lineas verificadas: ${recVerified}, mal: ${recBad}`);
if (badRecetas.length > 0) {
  console.log("Ejemplos malos:");
  for (const b of badRecetas) {
    console.log(`  ${b.receta} - ${b.ing}: cant=${b.cant} × neto=${b.neto} = ${b.esperado} pero costo_linea=${b.costo}`);
  }
}

// ─── 3. PLATOS Y PRECIOS: verificar COSTO TOTAL ───
console.log("\n" + "=".repeat(70));
console.log("3. PLATOS Y PRECIOS — verificación COSTO TOTAL = proteina + shari + salsas");
console.log("=".repeat(70));
const platos = rowsOf("PLATOS Y PRECIOS");
// Header row 3:
// A: PLATO  B: PROTEINA  C: CANT(kg)  D: COSTO PROT  E: SHARI(kg)  F: COSTO SHARI
// G: SALSAS desc  H: COSTO SALSAS  I: COSTO TOTAL  J: FOOD COST REAL
// K: PRECIO MENU  L: GANANCIA  M: % FOOD COST OBJ  N: PRECIO VENTA SUG  O: PRECIO VENTA REDOND
console.log("Header:", platos[2]);
let platosOK = 0, platosBad = 0;
const badPlatos = [];
for (let i = 3; i < platos.length; i++) {
  const r = platos[i];
  const plato = r[0] || "";
  if (plato.includes("═") || plato.includes("▸") || !plato.trim()) continue;
  const costoProt = parseFloat(r[3]) || 0;
  const costoShari = parseFloat(r[5]) || 0;
  const costoSalsas = parseFloat(r[7]) || 0;
  const costoTotal = parseFloat(r[8]) || 0;
  const expected = costoProt + costoShari + costoSalsas;
  if (Math.abs(costoTotal - expected) > 0.5) {
    platosBad++;
    if (badPlatos.length < 5) badPlatos.push({ plato, costoProt, costoShari, costoSalsas, costoTotal, expected });
  } else {
    platosOK++;
  }
}
console.log(`Platos verificados: ${platosOK}, mal: ${platosBad}`);
if (badPlatos.length > 0) {
  for (const b of badPlatos) {
    console.log(`  ${b.plato}: ${b.costoProt}+${b.costoShari}+${b.costoSalsas}=${b.expected} pero costoTotal=${b.costoTotal}`);
  }
}

// ─── 4. FOOD COST REAL = costo / precio menu ───
console.log("\n" + "=".repeat(70));
console.log("4. PLATOS Y PRECIOS — verificación FOOD COST = costo / precio menu");
console.log("=".repeat(70));
let fcOK = 0, fcBad = 0;
const badFc = [];
const platosMuestra = [];
for (let i = 3; i < platos.length; i++) {
  const r = platos[i];
  const plato = r[0] || "";
  if (plato.includes("═") || plato.includes("▸") || !plato.trim()) continue;
  const costoTotal = parseFloat(r[8]) || 0;
  const foodCost = parseFloat(r[9]) || 0;
  const precioMenu = parseFloat(r[10]) || 0;
  if (precioMenu === 0 || costoTotal === 0) continue;
  const expected = costoTotal / precioMenu;
  if (Math.abs(foodCost - expected) > 0.001) {
    fcBad++;
    if (badFc.length < 5) badFc.push({ plato, costoTotal, precioMenu, foodCost, expected });
  } else {
    fcOK++;
    if (platosMuestra.length < 5) platosMuestra.push({ plato, costoTotal, precioMenu, fcPct: (foodCost * 100).toFixed(2) });
  }
}
console.log(`Platos FC OK: ${fcOK}, mal: ${fcBad}`);
console.log("\nMuestra de food costs:");
for (const m of platosMuestra) {
  console.log(`  ${m.plato.padEnd(35)} costo=${m.costoTotal.toFixed(2).padEnd(10)} precio=${m.precioMenu.toFixed(0).padEnd(8)} FC=${m.fcPct}%`);
}
