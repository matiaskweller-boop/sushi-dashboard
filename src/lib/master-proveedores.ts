import { getSheets } from "@/lib/google";

const ERP_CONFIG = process.env.ERP_CONFIG_SHEET_ID || "1YMIE_t1O5RBfXGwFQf7xzh-TeuPUV6SfIl4Smj2mk1g";
const TAB = "MASTER PROVEEDORES";

export interface MasterProveedor {
  rowIdx: number;          // 1-indexed sheet row (header = 1, first data = 2)
  id: string;
  nombreSociedad: string;
  nombreFantasia: string;
  contacto: string;
  cuit: string;
  formaPago: string;
  aliasCbu: string;
  titularCuenta: string;
  banco: string;
  nroCuenta: string;
  rubro: string;
  plazoPago: string;
  mail: string;
  corroborado: boolean;
  notas: string;
  actualizadoEn: string;
  actualizadoPor: string;
  centralizado: boolean;          // factura una sola vez pero se loguea en multiples sucursales
  notaCentralizado: string;       // ej "100% Palermo paga", "compartido entre las 3"
}

const COLS = {
  ID: 0,
  NOMBRE_SOCIEDAD: 1,
  NOMBRE_FANTASIA: 2,
  CONTACTO: 3,
  CUIT: 4,
  FORMA_PAGO: 5,
  ALIAS_CBU: 6,
  TITULAR_CUENTA: 7,
  BANCO: 8,
  NRO_CUENTA: 9,
  RUBRO: 10,
  PLAZO_PAGO: 11,
  MAIL: 12,
  CORROBORADO: 13,
  NOTAS: 14,
  ACTUALIZADO_EN: 15,
  ACTUALIZADO_POR: 16,
  CENTRALIZADO: 17,
  NOTA_CENTRALIZADO: 18,
};

function parseBool(v: string): boolean {
  const s = (v || "").toString().trim().toLowerCase();
  return s === "true" || s === "verdadero" || s === "si" || s === "sí" || s === "1" || s === "✓";
}

function rowToProveedor(row: string[], rowIdx: number): MasterProveedor {
  return {
    rowIdx,
    id: (row[COLS.ID] || "").trim(),
    nombreSociedad: (row[COLS.NOMBRE_SOCIEDAD] || "").trim(),
    nombreFantasia: (row[COLS.NOMBRE_FANTASIA] || "").trim(),
    contacto: (row[COLS.CONTACTO] || "").trim(),
    cuit: (row[COLS.CUIT] || "").trim(),
    formaPago: (row[COLS.FORMA_PAGO] || "").trim(),
    aliasCbu: (row[COLS.ALIAS_CBU] || "").trim(),
    titularCuenta: (row[COLS.TITULAR_CUENTA] || "").trim(),
    banco: (row[COLS.BANCO] || "").trim(),
    nroCuenta: (row[COLS.NRO_CUENTA] || "").trim(),
    rubro: (row[COLS.RUBRO] || "").trim(),
    plazoPago: (row[COLS.PLAZO_PAGO] || "").trim(),
    mail: (row[COLS.MAIL] || "").trim(),
    corroborado: parseBool(row[COLS.CORROBORADO] || ""),
    notas: (row[COLS.NOTAS] || "").trim(),
    actualizadoEn: (row[COLS.ACTUALIZADO_EN] || "").trim(),
    actualizadoPor: (row[COLS.ACTUALIZADO_POR] || "").trim(),
    centralizado: parseBool(row[COLS.CENTRALIZADO] || ""),
    notaCentralizado: (row[COLS.NOTA_CENTRALIZADO] || "").trim(),
  };
}

// In-memory cache (5 min)
let _cache: { data: MasterProveedor[]; expiresAt: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000;

export async function getAllMasterProveedores(force = false): Promise<MasterProveedor[]> {
  if (!force && _cache && _cache.expiresAt > Date.now()) return _cache.data;

  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: ERP_CONFIG,
    range: `'${TAB}'!A2:Q`,
  });
  const rows = (res.data.values || []) as string[][];
  const result = rows
    .map((row, idx) => rowToProveedor(row, idx + 2))
    .filter((p) => p.nombreFantasia.length > 0);

  _cache = { data: result, expiresAt: Date.now() + CACHE_TTL };
  return result;
}

export function invalidateMasterCache() {
  _cache = null;
}

function generateId(nombreFantasia: string): string {
  return "PROV-" + nombreFantasia.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/-+$/g, "").slice(0, 40);
}

function toRow(p: Partial<MasterProveedor>, actualizadoPor: string): (string | boolean)[] {
  const now = new Date().toISOString();
  return [
    p.id || generateId(p.nombreFantasia || ""),
    p.nombreSociedad || "",
    p.nombreFantasia || "",
    p.contacto || "",
    p.cuit || "",
    p.formaPago || "",
    p.aliasCbu || "",
    p.titularCuenta || "",
    p.banco || "",
    p.nroCuenta || "",
    p.rubro || "",
    p.plazoPago || "",
    p.mail || "",
    p.corroborado ? "TRUE" : "FALSE",
    p.notas || "",
    now,
    actualizadoPor || "",
    p.centralizado ? "TRUE" : "FALSE",
    p.notaCentralizado || "",
  ];
}

export async function upsertMasterProveedor(
  data: Partial<MasterProveedor> & { nombreFantasia: string },
  actualizadoPor: string
): Promise<{ created: boolean; proveedor: MasterProveedor }> {
  if (!data.nombreFantasia || data.nombreFantasia.trim().length < 2) {
    throw new Error("Nombre fantasia es requerido");
  }

  const all = await getAllMasterProveedores(true);
  const nameKey = data.nombreFantasia.trim().toUpperCase();

  // Match by ID if provided, else by nombreFantasia
  const existing = data.id
    ? all.find((p) => p.id === data.id)
    : all.find((p) => p.nombreFantasia.toUpperCase() === nameKey);

  const sheets = getSheets();

  if (existing) {
    // PATCH-style merge: keep existing values, override only provided fields
    const merged: MasterProveedor = {
      ...existing,
      ...data,
      id: existing.id, // never change ID
      nombreFantasia: data.nombreFantasia.trim(),
      rowIdx: existing.rowIdx,
    };
    await sheets.spreadsheets.values.update({
      spreadsheetId: ERP_CONFIG,
      range: `'${TAB}'!A${existing.rowIdx}:Q${existing.rowIdx}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [toRow(merged, actualizadoPor)] },
    });
    invalidateMasterCache();
    return { created: false, proveedor: merged };
  } else {
    // INSERT new
    const newProv: MasterProveedor = {
      rowIdx: -1, // sheet will assign
      id: data.id || generateId(data.nombreFantasia),
      nombreSociedad: data.nombreSociedad || "",
      nombreFantasia: data.nombreFantasia.trim(),
      contacto: data.contacto || "",
      cuit: data.cuit || "",
      formaPago: data.formaPago || "",
      aliasCbu: data.aliasCbu || "",
      titularCuenta: data.titularCuenta || "",
      banco: data.banco || "",
      nroCuenta: data.nroCuenta || "",
      rubro: data.rubro || "",
      plazoPago: data.plazoPago || "",
      mail: data.mail || "",
      corroborado: data.corroborado || false,
      notas: data.notas || "",
      actualizadoEn: new Date().toISOString(),
      actualizadoPor,
      centralizado: data.centralizado || false,
      notaCentralizado: data.notaCentralizado || "",
    };
    const res = await sheets.spreadsheets.values.append({
      spreadsheetId: ERP_CONFIG,
      range: `'${TAB}'!A:Q`,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: [toRow(newProv, actualizadoPor)] },
    });
    // Extract row from updatedRange like "MASTER PROVEEDORES!A89:Q89"
    const updatedRange = res.data.updates?.updatedRange || "";
    const m = updatedRange.match(/!A(\d+):/);
    if (m) newProv.rowIdx = parseInt(m[1]);
    invalidateMasterCache();
    return { created: true, proveedor: newProv };
  }
}

export async function deleteMasterProveedor(id: string): Promise<boolean> {
  const all = await getAllMasterProveedores(true);
  const existing = all.find((p) => p.id === id);
  if (!existing) return false;

  // Clear the row (don't delete to preserve row indices; sheet UI ignores empty rows)
  const sheets = getSheets();
  await sheets.spreadsheets.values.update({
    spreadsheetId: ERP_CONFIG,
    range: `'${TAB}'!A${existing.rowIdx}:Q${existing.rowIdx}`,
    valueInputOption: "RAW",
    requestBody: { values: [Array(17).fill("")] },
  });
  invalidateMasterCache();
  return true;
}

/**
 * Build lookup map: nombreFantasia (uppercased + normalized) → master proveedor.
 * Used to enrich /api/erp/proveedores responses with master fields.
 */
export function buildLookupByName(all: MasterProveedor[]): Map<string, MasterProveedor> {
  const m = new Map<string, MasterProveedor>();
  for (const p of all) {
    if (p.nombreFantasia) m.set(p.nombreFantasia.toUpperCase().trim(), p);
    if (p.nombreSociedad) m.set(p.nombreSociedad.toUpperCase().trim(), p);
  }
  return m;
}
