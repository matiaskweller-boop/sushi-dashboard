/**
 * Verifica cómo cada item del menú matchea contra:
 *   1. PLATOS Y PRECIOS (exact / contains)
 *   2. INGREDIENTES (lookup por proteína)
 * Reporta cuáles items quedan sin costo o se matchean con el plato genérico.
 */
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

// 1. Cargar COSTEO
const res = await drive.files.get(
  { fileId: "1JrWveHVt6Qj6LopEUXwLInngEyZxTsGu", alt: "media" },
  { responseType: "arraybuffer" }
);
const wb = XLSX.read(Buffer.from(res.data), { type: "buffer" });

const platosRows = XLSX.utils.sheet_to_json(wb.Sheets["PLATOS Y PRECIOS"], { header: 1, defval: "" });
const platos = [];
for (let i = 3; i < platosRows.length; i++) {
  const r = platosRows[i];
  const name = String(r[0] || "").trim();
  if (!name || name.includes("═") || name.startsWith("  ▶")) continue;
  const costoTotal = parseFloat(r[8]) || 0;
  if (costoTotal <= 0) continue;
  platos.push({ plato: name, costoTotal });
}
console.log(`Platos en COSTEO: ${platos.length}`);

const ingRows = XLSX.utils.sheet_to_json(wb.Sheets["INGREDIENTES"], { header: 1, defval: "" });
const ingredientes = [];
for (let i = 2; i < ingRows.length; i++) {
  const r = ingRows[i];
  const insumo = String(r[1] || "").trim();
  if (!insumo) continue;
  const precioNeto = parseFloat(r[6]) || 0;
  ingredientes.push({ insumo, precioNeto });
}
console.log(`Ingredientes en COSTEO: ${ingredientes.length}`);

// 2. Cargar menu desde la KV (vía proxy)
const menuRes = await fetch("https://fudo-test.matiaskweller.workers.dev/menu-data", {
  headers: { "X-Proxy-Secret": "masunori-fudo-proxy-2026" },
});
const menuData = await menuRes.json();

const SECTION_SINGULAR = {
  ceviches: "Ceviche", handrolls: "Handroll", "hand rolls": "Handroll",
  niguiris: "Niguiri", nigiris: "Nigiri", sashimis: "Sashimi",
  rolls: "Roll", makis: "Maki", tatakis: "Tataki",
  tiraditos: "Tiradito", gunkans: "Gunkan", tartares: "Tartar",
  carpaccios: "Carpaccio", woks: "Wok", sopas: "Sopa",
  ensaladas: "Ensalada", entradas: "Entrada", postres: "Postre",
};
function buildName(section, name) {
  if (!section) return name;
  const sl = section.toLowerCase().trim();
  const nl = name.toLowerCase();
  const sing = SECTION_SINGULAR[sl];
  if (sing) {
    if (nl.includes(sing.toLowerCase())) return name;
    return `${sing} de ${name}`;
  }
  let s = section;
  if (sl.endsWith("es") && sl.length > 3) s = section.slice(0, -2);
  else if (sl.endsWith("s") && sl.length > 2) s = section.slice(0, -1);
  if (s !== section) {
    if (nl.includes(s.toLowerCase())) return name;
    return `${s} de ${name}`;
  }
  return `${section} - ${name}`;
}

function normalize(s) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();
}

const STOPWORDS = new Set(["arma", "tu", "de", "del", "la", "el", "con", "y", "o", "a", "al", "los", "las", "un", "una", "para", "por"]);
const TIPOS_PLATO = new Set(["handroll", "handrolls", "niguiri", "niguiris", "nigiri", "nigiris", "sashimi", "sashimis", "ceviche", "ceviches", "roll", "rolls", "maki", "makis", "tataki", "tatakis", "tiradito", "tiraditos", "gunkan", "gunkans", "tartar", "tartares", "tartars", "carpaccio", "carpaccios", "wok", "woks", "sopa", "sopas", "ensalada", "ensaladas", "chirashi", "combos", "combo", "platos", "plato", "calient", "caliente", "menu", "ejecutivo", "omakase"]);
const CATEGORIES_NO_PROTEIN = new Set(["tragos", "trago", "bebidas", "bebida", "vinos", "vino", "cervezas", "cerveza", "espumantes", "espumante", "champagnes", "champagne", "infusiones", "infusion", "cafes", "cafe", "mocktails", "mocktail", "sin alcohol", "alcohol", "jugos", "jugo", "postres", "postre", "cocteles", "coctel"]);

function extractInfo(displayName) {
  const norm = normalize(displayName);
  const words = norm.split(" ").filter(w => w.length > 2);
  if (words.length === 0) return { tipo: null, proteina: null };
  let tipo = null;
  for (const w of words) { if (TIPOS_PLATO.has(w)) { tipo = w; break; } }
  const restantes = words.filter(w => !STOPWORDS.has(w) && !TIPOS_PLATO.has(w));
  const proteina = restantes.length > 0 ? restantes[restantes.length - 1] : null;
  return { tipo, proteina };
}

const SECCIONES_NO_AUTO_COST = ["combos", "combo", "omakase", "menu ejecutivo", "menus", "tragos", "bebidas", "vinos", "cervezas", "espumantes", "champagnes", "infusiones", "cafes", "mocktails", "sin alcohol", "jugos", "postres", "cocteles"];

function shouldAutoCost(section) {
  if (!section) return true;
  const sl = section.toLowerCase().trim();
  for (const s of SECCIONES_NO_AUTO_COST) if (sl.includes(s)) return false;
  return true;
}

function findCostByName(name, section) {
  if (!shouldAutoCost(section)) return null;
  const norm = normalize(name);
  if (!norm) return null;
  for (const p of platos) if (normalize(p.plato) === norm) return p;
  const { tipo, proteina } = extractInfo(name);
  if (!proteina) return null;
  for (const p of platos) {
    const platoWords = normalize(p.plato).split(" ");
    if (!platoWords.includes(proteina)) continue;
    const platoTipo = platoWords.find(w => TIPOS_PLATO.has(w)) || null;
    if (tipo && platoTipo) {
      if (tipo !== platoTipo) continue;
    } else if ((tipo && !platoTipo) || (!tipo && platoTipo)) {
      continue;
    }
    return p;
  }
  return null;
}

function findProteinCost(name, section) {
  if (section) {
    const sl = section.toLowerCase();
    for (const cat of CATEGORIES_NO_PROTEIN) if (sl.includes(cat)) return null;
  }
  const { proteina } = extractInfo(name);
  if (!proteina || proteina.length < 4) return null;
  if (["clasico", "veggie", "kosher", "style", "rojo", "blanca", "rosa", "verde"].includes(proteina)) return null;
  for (const ing of ingredientes) {
    const ingWords = normalize(ing.insumo).split(" ");
    if (ingWords.includes(proteina)) {
      return { matched: ing.insumo, precio: ing.precioNeto, costoEst: (ing.precioNeto * 30) / 1000 };
    }
  }
  return null;
}

// 3. Iterar todos los items del menu
const flat = [];
for (const page of menuData.pages || []) {
  for (const section of page.sections || []) {
    for (const item of section.items || []) {
      flat.push({
        name: item.name,
        section: section.title,
        page: page.title,
        displayName: buildName(section.title, item.name),
        price: item.price,
      });
    }
  }
}
console.log(`Total items en menu: ${flat.length}`);

const sinCosto = [];
const conPlato = [];
const conProteina = [];
const grouped = {}; // por (cost, displayName) para detectar duplicados

for (const it of flat) {
  const cm = findCostByName(it.displayName, it.section) || findCostByName(it.name, it.section);
  const pm = !cm ? findProteinCost(it.displayName, it.section) : null;
  const costoFinal = cm ? cm.costoTotal : (pm ? pm.costoEst + 200 : 0);
  const source = cm ? "PLATO" : (pm ? "PROTEINA" : "—");
  const matchedName = cm ? cm.plato : (pm ? pm.matched : "");

  if (cm) conPlato.push({ it, cm });
  else if (pm) conProteina.push({ it, pm });
  else sinCosto.push(it);

  // Agrupar por costo para detectar duplicados
  const key = `${Math.round(costoFinal)}`;
  if (!grouped[key]) grouped[key] = [];
  grouped[key].push(`${it.displayName} (${source}${matchedName ? ": " + matchedName : ""})`);
}

console.log(`\n✓ Match exacto en PLATOS Y PRECIOS: ${conPlato.length}`);
console.log(`≈ Estimado por proteína: ${conProteina.length}`);
console.log(`✗ Sin costo (pedirá manual): ${sinCosto.length}`);

console.log(`\n=== Items SIN COSTO (primeros 30) ===`);
for (const it of sinCosto.slice(0, 30)) {
  console.log(`  ${it.section.padEnd(20)} · ${it.displayName}  (precio menu $${it.price})`);
}

// Grupos sospechosos: muchos items con MISMO costo (probable falso match)
const duplicatedCosts = Object.entries(grouped).filter(([, items]) => items.length >= 3);
console.log(`\n=== Grupos con MISMO costo (>=3 items) — sospechoso ===`);
for (const [costo, items] of duplicatedCosts) {
  if (costo === "0") continue;
  console.log(`\nCosto $${costo}: ${items.length} items`);
  for (const i of items.slice(0, 10)) console.log(`  - ${i}`);
}
