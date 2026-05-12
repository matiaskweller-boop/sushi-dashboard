import { getSheets } from "@/lib/google";

const ERP_CONFIG = process.env.ERP_CONFIG_SHEET_ID || "1YMIE_t1O5RBfXGwFQf7xzh-TeuPUV6SfIl4Smj2mk1g";
const TAB = "MASTER RUBROS";

export interface MasterRubro {
  rowIdx: number;
  id: string;
  rubro: string;
  categoria: string;
  activo: boolean;
  creado: string;
  creadoPor: string;
}

function parseBool(v: string): boolean {
  const s = (v || "").toString().trim().toLowerCase();
  return s === "true" || s === "verdadero" || s === "si" || s === "sí" || s === "1" || s === "✓";
}

function rowToRubro(row: string[], rowIdx: number): MasterRubro {
  return {
    rowIdx,
    id: (row[0] || "").trim(),
    rubro: (row[1] || "").trim(),
    categoria: (row[2] || "").trim(),
    activo: parseBool(row[3] || "TRUE"),
    creado: (row[4] || "").trim(),
    creadoPor: (row[5] || "").trim(),
  };
}

// Cache 5 min in-memory
let _cache: { data: MasterRubro[]; expiresAt: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000;

export async function getAllMasterRubros(force = false): Promise<MasterRubro[]> {
  if (!force && _cache && _cache.expiresAt > Date.now()) return _cache.data;
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: ERP_CONFIG,
    range: `'${TAB}'!A2:F`,
  });
  const rows = (res.data.values || []) as string[][];
  const result = rows
    .map((r, idx) => rowToRubro(r, idx + 2))
    .filter((r) => r.rubro.length > 0);
  _cache = { data: result, expiresAt: Date.now() + CACHE_TTL };
  return result;
}

export function invalidateRubrosCache() {
  _cache = null;
}

function generateId(rubro: string): string {
  return "RUBRO-" + rubro.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/-+$/g, "").slice(0, 30);
}

/**
 * Crea o devuelve un rubro existente (match case-insensitive).
 * Si ya existe, devuelve created=false.
 */
export async function createRubroIfMissing(
  rubro: string,
  creadoPor: string,
  categoria = "Otros"
): Promise<{ created: boolean; rubro: MasterRubro }> {
  if (!rubro || rubro.trim().length < 2) {
    throw new Error("Rubro es requerido");
  }
  const name = rubro.trim();
  const all = await getAllMasterRubros(true);
  const existing = all.find((r) => r.rubro.toLowerCase() === name.toLowerCase());
  if (existing) return { created: false, rubro: existing };

  const sheets = getSheets();
  const id = generateId(name);
  const now = new Date().toISOString();
  const row = [id, name, categoria || "Otros", "TRUE", now, creadoPor || ""];
  const res = await sheets.spreadsheets.values.append({
    spreadsheetId: ERP_CONFIG,
    range: `'${TAB}'!A:F`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [row] },
  });
  const updatedRange = res.data.updates?.updatedRange || "";
  const m = updatedRange.match(/!A(\d+):/);
  const rowIdx = m ? parseInt(m[1]) : -1;
  invalidateRubrosCache();
  return {
    created: true,
    rubro: { rowIdx, id, rubro: name, categoria: categoria || "Otros", activo: true, creado: now, creadoPor: creadoPor || "" },
  };
}
