import { getSheets } from "@/lib/google";

/**
 * MASTER PROVEEDORES — vive en el sheet "DATOS" del Drive del equipo.
 *
 * Sheet ID: 1DuEAFK3MxUZalMPzIfpT9ofrIuThOgu8bSvfbDWRBXk
 * Tab: "DATOS PROVEEDORES"
 *
 * Schema (row 2 = headers, row 3+ = datos):
 *   A: PROVEEDOR (nombre comercial corto, usado como key)
 *   B: CUIT
 *   C: ALIAS (alias bancario)
 *   D: RAZON SOCIAL
 *   E: BANCO
 *   F: NRO CUENTA (cta tradicional, no CBU)
 *   G: CBU 1
 *   H: CBU 2
 *   I: NOMBRE DE FANTASIA (formal, larga)
 *   J: PRODUCTO (rubro)
 *   K: PLAZOS DE PAGO
 *
 * IMPORTANTE: no escribimos en columnas L+ para no pisar notas/mails sueltos
 * que el equipo ya cargó a mano. Solo manipulamos A-K.
 *
 * Datos del modelo MasterProveedor que NO existen en DATOS (contacto, mail,
 * formaPago, corroborado, notas, etc) se mantienen como strings vacíos
 * en runtime para preservar compat con la UI, pero NO se persisten.
 */
const DATOS_SHEET = process.env.SHEET_DATOS_PROVEEDORES || "1DuEAFK3MxUZalMPzIfpT9ofrIuThOgu8bSvfbDWRBXk";
const TAB = "DATOS PROVEEDORES";
const HEADER_ROW = 2; // row 1 está vacía, headers en row 2

export interface MasterProveedor {
  rowIdx: number;
  id: string;                    // generado desde nombreFantasia (no existe en sheet)
  nombreSociedad: string;        // D RAZON SOCIAL
  nombreFantasia: string;        // A PROVEEDOR (key principal)
  nombreFantasiaFormal: string;  // I NOMBRE DE FANTASIA (formal)
  cuit: string;                  // B CUIT
  aliasCbu: string;              // C ALIAS
  banco: string;                 // E BANCO
  nroCuentaTradicional: string;  // F NRO CUENTA
  cbu: string;                   // G CBU 1
  cbu2: string;                  // H CBU 2
  rubro: string;                 // J PRODUCTO
  plazoPago: string;             // K PLAZOS DE PAGO

  // Campos NO persistidos en DATOS (compat con código viejo, siempre vacíos al leer):
  contacto: string;
  formaPago: string;
  titularCuenta: string;
  mail: string;
  corroborado: boolean;
  notas: string;
  centralizado: boolean;
  notaCentralizado: string;
  actualizadoEn: string;
  actualizadoPor: string;

  // Alias para retrocompatibilidad con código que esperaba nroCuenta:
  nroCuenta: string;             // mismo valor que cbu
}

const COLS = {
  PROVEEDOR: 0,        // A
  CUIT: 1,             // B
  ALIAS: 2,            // C
  RAZON_SOCIAL: 3,     // D
  BANCO: 4,            // E
  NRO_CUENTA_TRAD: 5,  // F
  CBU_1: 6,            // G
  CBU_2: 7,            // H
  NOMBRE_FANTASIA: 8,  // I
  PRODUCTO: 9,         // J
  PLAZOS_PAGO: 10,     // K
};

function generateId(nombreFantasia: string): string {
  return "PROV-" + nombreFantasia.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/-+$/g, "").slice(0, 40);
}

function rowToProveedor(row: string[], rowIdx: number): MasterProveedor {
  const nombreFant = (row[COLS.PROVEEDOR] || "").trim();
  const cbu = (row[COLS.CBU_1] || "").trim();
  return {
    rowIdx,
    id: generateId(nombreFant),
    nombreSociedad: (row[COLS.RAZON_SOCIAL] || "").trim(),
    nombreFantasia: nombreFant,
    nombreFantasiaFormal: (row[COLS.NOMBRE_FANTASIA] || "").trim(),
    cuit: (row[COLS.CUIT] || "").trim(),
    aliasCbu: (row[COLS.ALIAS] || "").trim(),
    banco: (row[COLS.BANCO] || "").trim(),
    nroCuentaTradicional: (row[COLS.NRO_CUENTA_TRAD] || "").trim(),
    cbu,
    cbu2: (row[COLS.CBU_2] || "").trim(),
    rubro: (row[COLS.PRODUCTO] || "").trim(),
    plazoPago: (row[COLS.PLAZOS_PAGO] || "").trim(),
    // No persistidos (siempre vacíos):
    contacto: "",
    formaPago: "",
    titularCuenta: "",
    mail: "",
    corroborado: false,
    notas: "",
    centralizado: false,
    notaCentralizado: "",
    actualizadoEn: "",
    actualizadoPor: "",
    // Alias retrocompat:
    nroCuenta: cbu,
  };
}

// Cache 5 min in-memory
let _cache: { data: MasterProveedor[]; expiresAt: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000;

export async function getAllMasterProveedores(force = false): Promise<MasterProveedor[]> {
  if (!force && _cache && _cache.expiresAt > Date.now()) return _cache.data;

  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: DATOS_SHEET,
    range: `'${TAB}'!A${HEADER_ROW + 1}:K`,
  });
  const rows = (res.data.values || []) as string[][];
  const result = rows
    .map((row, idx) => rowToProveedor(row, idx + HEADER_ROW + 1))
    .filter((p) => p.nombreFantasia.length > 0);

  _cache = { data: result, expiresAt: Date.now() + CACHE_TTL };
  return result;
}

export function invalidateMasterCache() {
  _cache = null;
}

/**
 * Convierte un MasterProveedor parcial a fila de 11 columnas (A-K).
 * Las columnas L+ del sheet se preservan automáticamente porque sólo
 * escribimos un rango A:K explícito.
 */
function toRow(p: Partial<MasterProveedor>): (string | number)[] {
  return [
    p.nombreFantasia || "",                // A
    p.cuit || "",                          // B
    p.aliasCbu || "",                      // C
    p.nombreSociedad || "",                // D
    p.banco || "",                         // E
    p.nroCuentaTradicional || "",          // F
    p.cbu || p.nroCuenta || "",            // G (acepta alias nroCuenta)
    p.cbu2 || "",                          // H
    p.nombreFantasiaFormal || p.nombreFantasia || "", // I (default = mismo que A)
    p.rubro || "",                         // J
    p.plazoPago || "",                     // K
  ];
}

export async function upsertMasterProveedor(
  data: Partial<MasterProveedor> & { nombreFantasia: string },
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _actualizadoPor: string
): Promise<{ created: boolean; proveedor: MasterProveedor }> {
  if (!data.nombreFantasia || data.nombreFantasia.trim().length < 2) {
    throw new Error("Nombre fantasia es requerido");
  }

  const all = await getAllMasterProveedores(true);
  const nameKey = data.nombreFantasia.trim().toUpperCase();

  // Match por nombreFantasia (case-insensitive) — el id viejo se ignora
  const existing = all.find((p) => p.nombreFantasia.toUpperCase() === nameKey);

  const sheets = getSheets();

  if (existing) {
    // PATCH: mergear con valores existentes
    const merged: MasterProveedor = {
      ...existing,
      ...data,
      rowIdx: existing.rowIdx,
      nombreFantasia: data.nombreFantasia.trim(),
      id: existing.id,
    };
    // Sólo escribimos cols A-K, dejamos L+ intactas
    await sheets.spreadsheets.values.update({
      spreadsheetId: DATOS_SHEET,
      range: `'${TAB}'!A${existing.rowIdx}:K${existing.rowIdx}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [toRow(merged)] },
    });
    invalidateMasterCache();
    return { created: false, proveedor: merged };
  } else {
    // INSERT: append al final de A:K
    const res = await sheets.spreadsheets.values.append({
      spreadsheetId: DATOS_SHEET,
      range: `'${TAB}'!A:K`,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: [toRow(data)] },
    });
    const updatedRange = res.data.updates?.updatedRange || "";
    const m = updatedRange.match(/!A(\d+):/);
    const rowIdx = m ? parseInt(m[1]) : -1;
    const newProv: MasterProveedor = {
      rowIdx,
      id: generateId(data.nombreFantasia),
      nombreSociedad: data.nombreSociedad || "",
      nombreFantasia: data.nombreFantasia.trim(),
      nombreFantasiaFormal: data.nombreFantasiaFormal || data.nombreFantasia.trim(),
      cuit: data.cuit || "",
      aliasCbu: data.aliasCbu || "",
      banco: data.banco || "",
      nroCuentaTradicional: data.nroCuentaTradicional || "",
      cbu: data.cbu || data.nroCuenta || "",
      cbu2: data.cbu2 || "",
      rubro: data.rubro || "",
      plazoPago: data.plazoPago || "",
      contacto: "",
      formaPago: "",
      titularCuenta: "",
      mail: "",
      corroborado: false,
      notas: "",
      centralizado: false,
      notaCentralizado: "",
      actualizadoEn: "",
      actualizadoPor: "",
      nroCuenta: data.cbu || data.nroCuenta || "",
    };
    invalidateMasterCache();
    return { created: true, proveedor: newProv };
  }
}

/**
 * "Borra" (limpia las celdas A-K) la fila del proveedor.
 * No elimina la fila físicamente para preservar los row indices.
 */
export async function deleteMasterProveedor(id: string): Promise<boolean> {
  const all = await getAllMasterProveedores(true);
  const existing = all.find((p) => p.id === id);
  if (!existing) return false;
  const sheets = getSheets();
  await sheets.spreadsheets.values.update({
    spreadsheetId: DATOS_SHEET,
    range: `'${TAB}'!A${existing.rowIdx}:K${existing.rowIdx}`,
    valueInputOption: "RAW",
    requestBody: { values: [Array(11).fill("")] },
  });
  invalidateMasterCache();
  return true;
}

/**
 * Build lookup map: nombreFantasia (uppercased + normalized) → master proveedor.
 * Usado en /api/erp/proveedores para enriquecer la response.
 */
export function buildLookupByName(all: MasterProveedor[]): Map<string, MasterProveedor> {
  const m = new Map<string, MasterProveedor>();
  for (const p of all) {
    if (p.nombreFantasia) m.set(p.nombreFantasia.toUpperCase().trim(), p);
    if (p.nombreFantasiaFormal) m.set(p.nombreFantasiaFormal.toUpperCase().trim(), p);
    if (p.nombreSociedad) m.set(p.nombreSociedad.toUpperCase().trim(), p);
  }
  return m;
}

export const DATOS_SHEET_ID = DATOS_SHEET;
export const DATOS_SHEET_LINK = `https://docs.google.com/spreadsheets/d/${DATOS_SHEET}/edit`;
