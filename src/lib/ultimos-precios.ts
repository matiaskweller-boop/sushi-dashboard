/**
 * Lib para leer EGRESOS de las 3 sucursales (Palermo / Belgrano / Madero)
 * y devolver el último precio unitario pagado a cada proveedor por cada insumo.
 *
 * Sirve como cross-check de los precios en COSTEO_DASHBOARD (INGREDIENTES tab)
 * y referencia para presupuestos.
 *
 * Cache 15 min in-memory (el cálculo es pesado: 3 sheets × ~3000 filas).
 */
import { getSheets } from "@/lib/google";

const SHEET_IDS: Record<string, Record<string, string>> = {
  "2025": {
    palermo: process.env.SHEET_PALERMO_2025 || "",
    belgrano: process.env.SHEET_BELGRANO_2025 || "",
    madero: process.env.SHEET_MADERO_2025 || "",
  },
  "2026": {
    palermo: process.env.SHEET_PALERMO_2026 || "",
    belgrano: process.env.SHEET_BELGRANO_2026 || "",
    madero: process.env.SHEET_MADERO_2026 || "",
  },
};

export interface UltimaCompra {
  insumo: string;          // descripción del insumo (col I) normalizada
  insumoOriginal: string;  // como aparece en EGRESOS
  proveedor: string;
  sucursal: string;        // palermo / belgrano / madero
  fechaISO: string | null; // YYYY-MM-DD si parseable
  fechaSheet: string;      // fecha tal cual del sheet
  precioUnit: number;      // total / cantidad
  total: number;
  cantidad: number;
  rownum: number;
}

function parseFecha(s: string): string | null {
  if (!s) return null;
  const m = s.trim().match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (!m) return null;
  const dd = m[1].padStart(2, "0");
  const mm = m[2].padStart(2, "0");
  let yyyy = m[3];
  if (yyyy.length === 2) yyyy = "20" + yyyy;
  return `${yyyy}-${mm}-${dd}`;
}

function parseArs(s: string): number {
  if (!s) return 0;
  const cleaned = s.replace(/[^\d,\-.]/g, "").replace(/\./g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

function parseQty(s: string): number {
  if (!s) return 0;
  const cleaned = s.replace(/[^\d,\-.]/g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

/**
 * Normaliza un nombre de insumo para matching cross-source.
 */
export function normalizeInsumo(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Resuelve el tab "EGRESOS" o "Egresos" case-insensitive en cada sucursal.
 */
async function resolveEgresosTabName(spreadsheetId: string): Promise<string> {
  const sheets = getSheets();
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets(properties(title))",
  });
  const tab = meta.data.sheets?.find((s) => (s.properties?.title || "").toLowerCase() === "egresos");
  return tab?.properties?.title || "EGRESOS";
}

async function loadSucursal(sucursal: string, year: string): Promise<UltimaCompra[]> {
  const sheetId = SHEET_IDS[year]?.[sucursal];
  if (!sheetId) return [];

  const sheets = getSheets();
  const tabName = await resolveEgresosTabName(sheetId);

  // Leer cols A-L (12) cubre lo que necesitamos
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `'${tabName}'!A2:L6000`,
  });
  const rows = (res.data.values || []) as string[][];

  const result: UltimaCompra[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;
    // Cols (0-indexed): A=0, B=1 Fecha ingreso, C=2 Fecha FC, D=3 Fecha Pago,
    //                   E=4 PROVEEDOR, F=5 Tipo, G=6 Nro, H=7 Rubro,
    //                   I=8 INSUMOS, J=9 Total, K=10 cantidad, L=11 Precio Un
    const proveedor = (row[4] || "").trim();
    const insumo = (row[8] || "").trim();
    const total = parseArs(row[9] || "");
    const cantidad = parseQty(row[10] || "");
    const fechaSheet = (row[1] || row[2] || "").trim(); // ingreso o FC

    if (!proveedor || !insumo) continue;
    if (total <= 0 || cantidad <= 0) continue;

    const precioUnit = total / cantidad;
    if (precioUnit <= 0) continue;

    const fechaISO = parseFecha(fechaSheet);
    result.push({
      insumo: normalizeInsumo(insumo),
      insumoOriginal: insumo,
      proveedor,
      sucursal,
      fechaISO,
      fechaSheet,
      precioUnit,
      total,
      cantidad,
      rownum: i + 2,
    });
  }
  return result;
}

export interface UltimosPreciosMap {
  // key = insumo normalizado
  [insumoKey: string]: UltimaCompra;
}

let _cache: { data: UltimosPreciosMap; year: string; expiresAt: number } | null = null;
const CACHE_TTL = 15 * 60 * 1000;

/**
 * Carga los EGRESOS de las 3 sucursales del año dado, y devuelve un mapa
 * insumo → última compra (la fila con fechaISO más reciente).
 */
export async function getUltimosPrecios(year = "2026", force = false): Promise<UltimosPreciosMap> {
  if (!force && _cache && _cache.year === year && _cache.expiresAt > Date.now()) return _cache.data;

  const [pal, bel, mad] = await Promise.all([
    loadSucursal("palermo", year).catch(() => []),
    loadSucursal("belgrano", year).catch(() => []),
    loadSucursal("madero", year).catch(() => []),
  ]);
  const all = [...pal, ...bel, ...mad];

  // Para cada insumo, quedarnos con la compra más reciente
  const map: UltimosPreciosMap = {};
  for (const compra of all) {
    const existing = map[compra.insumo];
    if (!existing) {
      map[compra.insumo] = compra;
      continue;
    }
    // Comparar fechas ISO (string compare funciona si formato YYYY-MM-DD)
    const newDate = compra.fechaISO || "";
    const exDate = existing.fechaISO || "";
    if (newDate > exDate) {
      map[compra.insumo] = compra;
    }
  }

  _cache = { data: map, year, expiresAt: Date.now() + CACHE_TTL };
  return map;
}

export function invalidateUltimosPreciosCache() {
  _cache = null;
}

/**
 * Busca el último precio para un insumo por nombre.
 * Hace match: exacto → contains → word overlap.
 */
export function findUltimoPrecio(
  map: UltimosPreciosMap,
  insumoQuery: string
): UltimaCompra | null {
  const norm = normalizeInsumo(insumoQuery);
  if (!norm) return null;
  // Exact
  if (map[norm]) return map[norm];
  // Contains: alguna key contiene la query o viceversa
  for (const [key, value] of Object.entries(map)) {
    if (key.includes(norm) || norm.includes(key)) return value;
  }
  // Word overlap: comparten ≥2 palabras > 3 chars
  const inputWords = norm.split(" ").filter((w) => w.length > 3);
  if (inputWords.length === 0) return null;
  let best: UltimaCompra | null = null;
  let bestScore = 0;
  for (const [key, value] of Object.entries(map)) {
    const keyWords = key.split(" ").filter((w) => w.length > 3);
    const common = inputWords.filter((w) => keyWords.includes(w)).length;
    if (common > bestScore && common >= 2) {
      bestScore = common;
      best = value;
    }
  }
  return best;
}
