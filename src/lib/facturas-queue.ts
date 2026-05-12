/**
 * Lib para gestión de cola de facturas pendientes de aprobación.
 * Las facturas se cargan acá como "pendiente" cuando un user las sube.
 * Un aprobador (con perm "facturas_aprobar" o "*") las revisa y aprueba,
 * lo cual las exporta a la tab EGRESOS de la sucursal correspondiente.
 */
import { getSheets, readSheetRaw, appendToSheet } from "@/lib/google";

const ERP_CONFIG_SHEET = process.env.ERP_CONFIG_SHEET_ID || "1YMIE_t1O5RBfXGwFQf7xzh-TeuPUV6SfIl4Smj2mk1g";
const TAB = "Facturas";

export const FACTURA_HEADERS = [
  "ID",
  "SubmittedAt",
  "SubmittedBy",
  "Sucursal",
  "Año",
  "TipoComprobante",
  "NroComprobante",
  "Proveedor",
  "RazonSocial",
  "CUIT",
  "FechaIngreso",
  "FechaFC",
  "FechaVto",
  "FechaPago",
  "Rubro",
  "Insumo",
  "Subtotal",
  "IVA",
  "OtrosImpuestos",
  "Total",
  "MetodoPago",
  "FotoURL",
  "Confianza",
  "NotasOCR",
  "Estado",         // pendiente | aprobada | rechazada
  "ReviewedBy",
  "ReviewedAt",
  "NotasReview",
  "ItemsJSON",
  "ImpuestosJSON",  // [{tipo, monto, alicuota?}, ...]
  "Moneda",         // "ARS" | "USD"
  "TipoCambio",     // numero, ej 1050.50 (1 USD = X ARS). Default 1 para ARS.
  "RazonSocialReceptor", // col AG — razón social NUESTRA (Tobet/Pro Vegan/Icono) para validar coincidencia con sucursal
];

/**
 * Mapeo sucursal → razón social NUESTRA (las sociedades del grupo Masunori).
 * Usado para validar que la sucursal seleccionada coincida con la razón social
 * que figura en la factura como "cliente / receptor".
 */
export const SUCURSAL_TO_SOCIEDAD: Record<string, string> = {
  palermo: "Tobet",
  belgrano: "Pro Vegan",
  madero: "Icono",
};

/**
 * Para detección por texto: lista de aliases que indican una razón social NUESTRA
 * y a qué sucursal corresponde.
 */
export const SOCIEDAD_PATTERNS: Array<{ patterns: RegExp; sucursal: string; nombre: string }> = [
  { patterns: /\btobet\b/i, sucursal: "palermo", nombre: "Tobet" },
  { patterns: /\bpro\s*vegan\b/i, sucursal: "belgrano", nombre: "Pro Vegan" },
  { patterns: /\bicono\b/i, sucursal: "madero", nombre: "Icono" },
];

export function detectSucursalFromRazonSocial(razonSocial: string): { sucursal: string | null; nombre: string | null } {
  if (!razonSocial) return { sucursal: null, nombre: null };
  for (const p of SOCIEDAD_PATTERNS) {
    if (p.patterns.test(razonSocial)) return { sucursal: p.sucursal, nombre: p.nombre };
  }
  return { sucursal: null, nombre: null };
}

export type EstadoFactura = "pendiente" | "aprobada" | "rechazada";

export interface FacturaQueue {
  id: string;
  submittedAt: string;
  submittedBy: string;
  sucursal: string;
  year: string;
  tipoComprobante: string;
  nroComprobante: string;
  proveedor: string;
  razonSocial: string;
  cuit: string;
  fechaIngreso: string;
  fechaFC: string;
  fechaVto: string;
  fechaPago: string;
  rubro: string;
  insumo: string;
  subtotal: number;
  iva: number;
  otrosImpuestos: number;
  total: number;
  metodoPago: string;
  fotoUrl: string;
  confianza: number;
  notasOCR: string;
  estado: EstadoFactura;
  reviewedBy: string;
  reviewedAt: string;
  notasReview: string;
  items: Array<{
    descripcion: string;
    cantidad: number;
    unidad: string; // kg, lt, unidad, g, ml, m, etc.
    precioUnitario: number;
    subtotal: number; // sin IVA
    alicuotaIva?: number;
    montoIva?: number;
  }>;
  impuestos: Array<{
    tipo: string; // "IVA 21%", "IVA 10.5%", "IIBB", "Percep IVA", "Percep IIBB", "IMP. INTERNOS", "Otros"
    monto: number;
    alicuota?: number;
  }>;
  moneda: "ARS" | "USD"; // si es USD, los montos están en dólares y deben convertirse al exportar
  tipoCambio: number;    // si moneda="USD", monto * tipoCambio = monto en ARS. Default 1.
  razonSocialReceptor: string; // razón social NUESTRA detectada en la factura (Tobet/Pro Vegan/Icono)
}

/**
 * Asegurar que la tab Facturas existe con headers.
 */
export async function ensureFacturasTab() {
  const sheets = getSheets();
  const meta = await sheets.spreadsheets.get({
    spreadsheetId: ERP_CONFIG_SHEET,
    fields: "sheets(properties(title,sheetId,gridProperties))",
  });
  const existingTab = meta.data.sheets?.find((s) => s.properties?.title === TAB);
  if (!existingTab) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: ERP_CONFIG_SHEET,
      requestBody: { requests: [{ addSheet: { properties: { title: TAB } } }] },
    });
  } else {
    // Expandir grid si la tab tiene menos columnas que las que pide el schema
    const currentCols = existingTab.properties?.gridProperties?.columnCount || 0;
    if (currentCols < FACTURA_HEADERS.length) {
      const toAdd = FACTURA_HEADERS.length - currentCols;
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: ERP_CONFIG_SHEET,
        requestBody: {
          requests: [{
            appendDimension: {
              sheetId: existingTab.properties!.sheetId!,
              dimension: "COLUMNS",
              length: toAdd,
            },
          }],
        },
      });
    }
  }
  // Setear/actualizar headers
  await sheets.spreadsheets.values.update({
    spreadsheetId: ERP_CONFIG_SHEET,
    range: `${TAB}!A1:${columnLetter(FACTURA_HEADERS.length)}1`,
    valueInputOption: "RAW",
    requestBody: { values: [FACTURA_HEADERS] },
  });
}

function columnLetter(n: number): string {
  let s = "";
  let num = n;
  while (num > 0) {
    const m = (num - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    num = Math.floor((num - 1) / 26);
  }
  return s;
}

function rowToFactura(row: string[]): FacturaQueue {
  const num = (v: string | undefined) => parseFloat((v || "0").toString()) || 0;
  let items: FacturaQueue["items"] = [];
  try {
    const itemsRaw = row[28] || "[]";
    const parsed = JSON.parse(itemsRaw);
    if (Array.isArray(parsed)) items = parsed.map((it) => ({ ...it, unidad: it.unidad || "unidad" }));
  } catch {
    items = [];
  }
  let impuestos: FacturaQueue["impuestos"] = [];
  try {
    const impRaw = row[29] || "[]";
    const parsed = JSON.parse(impRaw);
    if (Array.isArray(parsed)) impuestos = parsed;
  } catch {
    impuestos = [];
  }
  const monedaStr = ((row[30] || "ARS") + "").toUpperCase().trim();
  const moneda: "ARS" | "USD" = monedaStr === "USD" ? "USD" : "ARS";
  const tipoCambio = num(row[31]) || 1;
  return {
    id: row[0] || "",
    submittedAt: row[1] || "",
    submittedBy: row[2] || "",
    sucursal: row[3] || "",
    year: row[4] || "",
    tipoComprobante: row[5] || "",
    nroComprobante: row[6] || "",
    proveedor: row[7] || "",
    razonSocial: row[8] || "",
    cuit: row[9] || "",
    fechaIngreso: row[10] || "",
    fechaFC: row[11] || "",
    fechaVto: row[12] || "",
    fechaPago: row[13] || "",
    rubro: row[14] || "",
    insumo: row[15] || "",
    subtotal: num(row[16]),
    iva: num(row[17]),
    otrosImpuestos: num(row[18]),
    total: num(row[19]),
    metodoPago: row[20] || "",
    fotoUrl: row[21] || "",
    confianza: num(row[22]),
    notasOCR: row[23] || "",
    estado: ((row[24] || "pendiente").toLowerCase() as EstadoFactura),
    reviewedBy: row[25] || "",
    reviewedAt: row[26] || "",
    notasReview: row[27] || "",
    items,
    impuestos,
    moneda,
    tipoCambio,
    razonSocialReceptor: row[32] || "", // col AG
  };
}

function facturaToRow(f: Partial<FacturaQueue> & { id: string }): string[] {
  return [
    f.id,
    f.submittedAt || new Date().toISOString(),
    f.submittedBy || "",
    f.sucursal || "",
    f.year || "",
    f.tipoComprobante || "",
    f.nroComprobante || "",
    f.proveedor || "",
    f.razonSocial || "",
    f.cuit || "",
    f.fechaIngreso || "",
    f.fechaFC || "",
    f.fechaVto || "",
    f.fechaPago || "",
    f.rubro || "",
    f.insumo || "",
    String(f.subtotal ?? 0),
    String(f.iva ?? 0),
    String(f.otrosImpuestos ?? 0),
    String(f.total ?? 0),
    f.metodoPago || "",
    f.fotoUrl || "",
    String(f.confianza ?? 0),
    f.notasOCR || "",
    f.estado || "pendiente",
    f.reviewedBy || "",
    f.reviewedAt || "",
    f.notasReview || "",
    JSON.stringify(f.items || []),
    JSON.stringify(f.impuestos || []),
    f.moneda || "ARS",
    String(f.tipoCambio ?? 1),
    f.razonSocialReceptor || "", // col AG
  ];
}

export function generateId(): string {
  return Date.now().toString(36) + "-" + Math.random().toString(36).substring(2, 8);
}

export async function listFacturas(filter?: { estado?: EstadoFactura; submittedBy?: string }): Promise<FacturaQueue[]> {
  await ensureFacturasTab();
  const rows = await readSheetRaw(ERP_CONFIG_SHEET, `${TAB}!A2:AG10000`);
  const facturas = rows.map(rowToFactura).filter((f) => f.id);
  if (filter?.estado) {
    return facturas.filter((f) => f.estado === filter.estado);
  }
  if (filter?.submittedBy) {
    return facturas.filter((f) => f.submittedBy.toLowerCase() === filter.submittedBy!.toLowerCase());
  }
  return facturas.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
}

export async function getFactura(id: string): Promise<FacturaQueue | null> {
  await ensureFacturasTab();
  const rows = await readSheetRaw(ERP_CONFIG_SHEET, `${TAB}!A2:AG10000`);
  const found = rows.find((r) => (r[0] || "") === id);
  return found ? rowToFactura(found) : null;
}

export async function appendFactura(f: Partial<FacturaQueue> & { id: string }): Promise<void> {
  await ensureFacturasTab();
  await appendToSheet(ERP_CONFIG_SHEET, `${TAB}!A:AG`, [facturaToRow(f)]);
}

export async function updateFactura(id: string, updates: Partial<FacturaQueue>): Promise<FacturaQueue | null> {
  await ensureFacturasTab();
  const sheets = getSheets();
  const rows = await readSheetRaw(ERP_CONFIG_SHEET, `${TAB}!A2:AG10000`);
  const idx = rows.findIndex((r) => (r[0] || "") === id);
  if (idx < 0) return null;

  const current = rowToFactura(rows[idx]);
  const merged: FacturaQueue = { ...current, ...updates, id };
  const newRow = facturaToRow(merged);
  const sheetRow = idx + 2;
  await sheets.spreadsheets.values.update({
    spreadsheetId: ERP_CONFIG_SHEET,
    range: `${TAB}!A${sheetRow}:AG${sheetRow}`,
    valueInputOption: "RAW",
    requestBody: { values: [newRow] },
  });
  return merged;
}
