/**
 * Lib para leer el archivo MASUNORI_COSTEO_DASHBOARD.xlsx desde Drive.
 * Lo descarga binario, lo parsea con sheetjs, y expone los costos
 * por plato (tab "PLATOS Y PRECIOS") + lista de insumos (tab "INGREDIENTES").
 *
 * Cache 10 min in-memory para no descargar el xlsx en cada request.
 */
import { google } from "googleapis";
import * as XLSX from "xlsx";

const COSTEO_FILE_ID = process.env.COSTEO_DASHBOARD_FILE_ID || "1JrWveHVt6Qj6LopEUXwLInngEyZxTsGu";

export interface PlatoCosteado {
  plato: string;            // col A
  proteina: string;         // col B
  cantidadKg: number;       // col C
  costoProteina: number;    // col D
  costoShari: number;       // col F
  detalleSalsas: string;    // col G
  costoSalsas: number;      // col H
  costoTotal: number;       // col I (ESTE es el costo real del plato)
  foodCostReal: number;     // col J
  precioMenu: number;       // col K
  precioSugerido: number;   // col N
  precioRedondeado: number; // col O
}

export interface Ingrediente {
  rubro: string;     // col A
  insumo: string;    // col B
  unidad: string;    // col C
  cantUnidad: number;// col D
  precioBruto: number; // col E
  mermaPct: number;  // col F
  precioNeto: number;// col G
  ultimaCompra: string; // col H
}

interface CosteoData {
  platos: PlatoCosteado[];
  ingredientes: Ingrediente[];
}

let _cache: { data: CosteoData; expiresAt: number } | null = null;
const CACHE_TTL = 10 * 60 * 1000;

function getDrive() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON not set");
  const credentials = JSON.parse(raw.replace(/\n/g, "\\n"));
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/drive"],
  });
  return google.drive({ version: "v3", auth });
}

function num(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const cleaned = v.replace(/[^\d.,\-]/g, "").replace(",", ".");
    const n = parseFloat(cleaned);
    return isNaN(n) ? 0 : n;
  }
  return 0;
}

function str(v: unknown): string {
  return (v === null || v === undefined) ? "" : String(v).trim();
}

export async function loadCosteo(force = false): Promise<CosteoData> {
  if (!force && _cache && _cache.expiresAt > Date.now()) return _cache.data;

  const drive = getDrive();
  const res = await drive.files.get(
    { fileId: COSTEO_FILE_ID, alt: "media" },
    { responseType: "arraybuffer" }
  );
  const buffer = Buffer.from(res.data as ArrayBuffer);
  const wb = XLSX.read(buffer, { type: "buffer" });

  // ─── PLATOS Y PRECIOS ───
  const platos: PlatoCosteado[] = [];
  const platosSheet = wb.Sheets["PLATOS Y PRECIOS"];
  if (platosSheet) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(platosSheet, { header: 1, defval: "" });
    // Headers están en row 3 (idx 2). Data desde row 4 (idx 3).
    for (let i = 3; i < rows.length; i++) {
      const row = rows[i] as unknown[];
      const plato = str(row[0]);
      // Skip rows que son separadores (empiezan con ═══ o están vacías)
      if (!plato || plato.includes("═") || plato.startsWith("  ▶")) continue;
      const costoTotal = num(row[8]);  // col I
      if (costoTotal <= 0) continue; // skip filas sin costo
      platos.push({
        plato,
        proteina: str(row[1]),
        cantidadKg: num(row[2]),
        costoProteina: num(row[3]),
        costoShari: num(row[5]),
        detalleSalsas: str(row[6]),
        costoSalsas: num(row[7]),
        costoTotal,
        foodCostReal: num(row[9]),
        precioMenu: num(row[10]),
        precioSugerido: num(row[13]),
        precioRedondeado: num(row[14]),
      });
    }
  }

  // ─── INGREDIENTES ───
  const ingredientes: Ingrediente[] = [];
  const ingSheet = wb.Sheets["INGREDIENTES"];
  if (ingSheet) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ingSheet, { header: 1, defval: "" });
    // Headers row 2 (idx 1). Data desde row 3 (idx 2).
    for (let i = 2; i < rows.length; i++) {
      const row = rows[i] as unknown[];
      const insumo = str(row[1]);
      if (!insumo) continue;
      ingredientes.push({
        rubro: str(row[0]),
        insumo,
        unidad: str(row[2]),
        cantUnidad: num(row[3]),
        precioBruto: num(row[4]),
        mermaPct: num(row[5]),
        precioNeto: num(row[6]),
        ultimaCompra: str(row[7]),
      });
    }
  }

  const data: CosteoData = { platos, ingredientes };
  _cache = { data, expiresAt: Date.now() + CACHE_TTL };
  return data;
}

export function invalidateCosteoCache() {
  _cache = null;
}

/**
 * Normaliza un nombre para matching: minúsculas + sin tildes + sin caracteres
 * especiales + colapsar espacios.
 */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Busca un plato en el costeo por nombre (case-insensitive, normalizado).
 * Devuelve el match o null si no hay.
 */
export function findPlatoByName(platos: PlatoCosteado[], name: string): PlatoCosteado | null {
  if (!name) return null;
  const norm = normalize(name);
  if (!norm) return null;

  // 1. Exact match
  for (const p of platos) {
    if (normalize(p.plato) === norm) return p;
  }
  // 2. Contains (plato contains menu name OR menu name contains plato)
  for (const p of platos) {
    const platoNorm = normalize(p.plato);
    if (platoNorm.includes(norm) || norm.includes(platoNorm)) return p;
  }
  // 3. Word overlap: necesita compartir >=2 palabras significativas (longitud > 3)
  const inputWords = norm.split(" ").filter((w) => w.length > 3);
  if (inputWords.length === 0) return null;
  let bestScore = 0;
  let bestMatch: PlatoCosteado | null = null;
  for (const p of platos) {
    const platoWords = normalize(p.plato).split(" ").filter((w) => w.length > 3);
    const common = inputWords.filter((w) => platoWords.includes(w)).length;
    if (common > bestScore && common >= 2) {
      bestScore = common;
      bestMatch = p;
    }
  }
  return bestMatch;
}
