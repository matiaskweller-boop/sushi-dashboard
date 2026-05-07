/**
 * Lógica compartida para detectar movimientos inter-sucursal en EGRESOS.
 * Se usa en:
 * - /api/erp/deuda-locales (página dedicada)
 * - /api/erp/proveedores (resumen integrado en el panel de proveedores)
 */
import { readSheetRaw, parseArs, parseDate } from "@/lib/google";

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

export const SUCURSALES = ["palermo", "belgrano", "madero"] as const;
export type Sucursal = typeof SUCURSALES[number];

export interface Movimiento {
  rownum: number;
  sucursalOrigen: Sucursal;
  sucursalContraparte: Sucursal | null;
  fecha: string;
  fechaPago: string | null;
  proveedor: string;
  rubro: string;
  insumo: string;
  total: number;
  metodoPago: string;
  estadoPago: "pagado" | "pendiente";
  tipo: "explicito" | "centralizado_match" | "envio_uber";
  notaDeteccion: string;
}

export interface RawRow {
  sucursal: Sucursal;
  rownum: number;
  fechaIng: string;
  fechaFC: string;
  fechaPago: string | null;
  proveedor: string;
  rubro: string;
  insumo: string;
  total: number;
  metodoPago: string;
}

export interface SaldoNeto {
  deudor: Sucursal;
  acreedor: Sucursal;
  monto: number;
}

export interface Centralizado {
  proveedor: string;
  fecha: string;
  total: number;
  sucursalesIncluidas: Sucursal[];
  rownums: Array<{ sucursal: Sucursal; rownum: number }>;
}

export interface DeudaLocalesAnalisis {
  movimientos: Movimiento[];
  matriz: Record<Sucursal, Record<Sucursal, number>>;
  saldosNetos: SaldoNeto[];
  totalSinDireccion: number;
  centralizados: Centralizado[];
  totalCentralizados: number;
  montoCentralizadosDuplicado: number;
  stats: Record<Sucursal, { totalMovimientos: number; totalMonto: number; pagados: number; pendientes: number }>;
}

const PATTERN_PAGO_POR = /PAGO\s+POR\s+GASTO\s+HECHO\s+POR\s+(MADERO|PALERMO|BELGRANO)/i;
const PATTERN_DEUDA_CON = /\bdeuda\s+con\s+(palermo|belgrano|madero)/i;
const PATTERN_ENVIO_DE_A = /\benvio\s+de\s+\w+(?:\s+\w+)*\s+(?:de\s+)?(palermo|belgrano|madero)\s+a\s+(palermo|belgrano|madero)/i;
const PATTERN_FLETE_QUE_PAGO = /\bflete\s+que\s+pago\s+(palermo|belgrano|madero)/i;
const PATTERN_ENTRE_LOCALES = /\b(uber|envio)\s+entre\s+locales\b/i;

function isPagado(fechaPago: string | null, metodo: string): boolean {
  if (!fechaPago) return false;
  const m = metodo.toLowerCase();
  if (!m || m.includes("sin pagar") || m === "pendiente") return false;
  return true;
}

export function detectContraparte(textCombined: string, currentSucursal: Sucursal): Sucursal | null {
  const lower = textCombined.toLowerCase();
  const others = SUCURSALES.filter((s) => s !== currentSucursal);
  for (const s of others) {
    if (lower.includes(s)) return s;
  }
  return null;
}

export function classifyRow(rubro: string, insumo: string, proveedor: string): { isInter: boolean; tipo: Movimiento["tipo"]; nota: string } {
  const text = `${rubro} ${insumo} ${proveedor}`;
  if (PATTERN_PAGO_POR.test(text)) return { isInter: true, tipo: "explicito", nota: "PAGO POR GASTO HECHO POR (otra sucursal)" };
  if (PATTERN_DEUDA_CON.test(text)) return { isInter: true, tipo: "explicito", nota: "DEUDA CON otra sucursal" };
  if (PATTERN_ENVIO_DE_A.test(text)) return { isInter: true, tipo: "explicito", nota: "envío de mercadería entre sucursales" };
  if (PATTERN_FLETE_QUE_PAGO.test(text)) return { isInter: true, tipo: "explicito", nota: "flete pagado por otra sucursal" };
  if (PATTERN_ENTRE_LOCALES.test(text)) return { isInter: true, tipo: "envio_uber", nota: "uber/envío entre locales" };
  return { isInter: false, tipo: "explicito", nota: "" };
}

export async function loadSucursalRows(sucursal: Sucursal, year: string): Promise<RawRow[]> {
  const sheetId = SHEET_IDS[year]?.[sucursal];
  if (!sheetId) return [];
  try {
    const rows = await readSheetRaw(sheetId, "EGRESOS!A1:U6000");
    if (rows.length < 2) return [];

    let headerIdx = 0;
    for (let i = 0; i < Math.min(5, rows.length); i++) {
      const row = rows[i].map((c) => (c || "").toString().toUpperCase());
      if (row.some((c) => c.includes("PROVEEDOR"))) { headerIdx = i; break; }
    }
    const headers = rows[headerIdx].map((c) => (c || "").toString().trim());
    const findCol = (...names: string[]): number => {
      for (const n of names) {
        const idx = headers.findIndex((h) => h.toUpperCase().includes(n.toUpperCase()));
        if (idx !== -1) return idx;
      }
      return -1;
    };
    const colFechaIng = findCol("Fecha ingreso", "Fecha ing");
    const colFechaFC = findCol("Fecha FC");
    const colFechaPago = findCol("Fecha Pago");
    const colProveedor = findCol("PROVEEDOR", "Proveedor");
    const colRubro = findCol("Rubro");
    const colInsumo = findCol("INSUMOS", "Insumos");
    const colTotal = findCol("Total");
    const colMetodoPago = findCol("Metodo de Pago", "Método de Pago");

    const result: RawRow[] = [];
    for (let i = headerIdx + 1; i < rows.length; i++) {
      const row = rows[i] || [];
      const total = colTotal >= 0 ? parseArs(row[colTotal] || "") : 0;
      if (total === 0) continue;
      const fechaIng = colFechaIng >= 0 ? (row[colFechaIng] || "").toString().trim() : "";
      const fechaFC = colFechaFC >= 0 ? (row[colFechaFC] || "").toString().trim() : "";
      if (!fechaIng && !fechaFC) continue;
      const fechaPagoRaw = colFechaPago >= 0 ? (row[colFechaPago] || "").toString().trim() : "";
      result.push({
        sucursal,
        rownum: i + 1,
        fechaIng,
        fechaFC,
        fechaPago: parseDate(fechaPagoRaw),
        proveedor: colProveedor >= 0 ? (row[colProveedor] || "").toString().trim() : "",
        rubro: colRubro >= 0 ? (row[colRubro] || "").toString().trim() : "",
        insumo: colInsumo >= 0 ? (row[colInsumo] || "").toString().trim() : "",
        total,
        metodoPago: colMetodoPago >= 0 ? (row[colMetodoPago] || "").toString().trim() : "",
      });
    }
    return result;
  } catch (e) {
    console.error("loadSucursalRows", sucursal, e);
    return [];
  }
}

const normDate = (s: string): string => {
  const m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (!m) return s;
  const day = m[1].padStart(2, "0");
  const month = m[2].padStart(2, "0");
  let yr = m[3];
  if (yr.length === 2) yr = "20" + yr;
  return `${yr}-${month}-${day}`;
};

export async function analyzeDeudaLocales(year: string): Promise<DeudaLocalesAnalisis> {
  const [palermo, belgrano, madero] = await Promise.all([
    loadSucursalRows("palermo", year),
    loadSucursalRows("belgrano", year),
    loadSucursalRows("madero", year),
  ]);
  const allRows: RawRow[] = [...palermo, ...belgrano, ...madero];

  const movimientos: Movimiento[] = [];
  for (const r of allRows) {
    const { isInter, tipo, nota } = classifyRow(r.rubro, r.insumo, r.proveedor);
    if (!isInter) continue;
    const text = `${r.rubro} ${r.insumo} ${r.proveedor}`;
    const contraparte = detectContraparte(text, r.sucursal);
    movimientos.push({
      rownum: r.rownum,
      sucursalOrigen: r.sucursal,
      sucursalContraparte: contraparte,
      fecha: r.fechaIng || r.fechaFC,
      fechaPago: r.fechaPago,
      proveedor: r.proveedor,
      rubro: r.rubro,
      insumo: r.insumo,
      total: r.total,
      metodoPago: r.metodoPago,
      estadoPago: isPagado(r.fechaPago, r.metodoPago) ? "pagado" : "pendiente",
      tipo,
      notaDeteccion: nota,
    });
  }

  const matriz: Record<Sucursal, Record<Sucursal, number>> = {
    palermo: { palermo: 0, belgrano: 0, madero: 0 },
    belgrano: { palermo: 0, belgrano: 0, madero: 0 },
    madero: { palermo: 0, belgrano: 0, madero: 0 },
  };
  let totalSinDireccion = 0;
  for (const m of movimientos) {
    if (m.sucursalContraparte) matriz[m.sucursalOrigen][m.sucursalContraparte] += m.total;
    else totalSinDireccion += m.total;
  }

  const saldosNetos: SaldoNeto[] = [];
  for (let i = 0; i < SUCURSALES.length; i++) {
    for (let j = i + 1; j < SUCURSALES.length; j++) {
      const a = SUCURSALES[i];
      const b = SUCURSALES[j];
      const aHaciaB = matriz[a][b];
      const bHaciaA = matriz[b][a];
      const neto = aHaciaB - bHaciaA;
      if (Math.abs(neto) < 1) continue;
      if (neto > 0) saldosNetos.push({ deudor: a, acreedor: b, monto: neto });
      else saldosNetos.push({ deudor: b, acreedor: a, monto: -neto });
    }
  }

  // Centralizados
  const centralizados: Centralizado[] = [];
  const byKey: Record<string, RawRow[]> = {};
  for (const r of allRows) {
    const fnorm = normDate(r.fechaIng || r.fechaFC);
    const key = `${r.proveedor}::${fnorm}::${Math.round(r.total * 100)}`;
    if (!byKey[key]) byKey[key] = [];
    byKey[key].push(r);
  }
  for (const key of Object.keys(byKey)) {
    const group = byKey[key];
    const sucursalesEnGrupo = Array.from(new Set(group.map((r) => r.sucursal))) as Sucursal[];
    if (sucursalesEnGrupo.length < 2) continue;
    const prov = group[0].proveedor.trim().toLowerCase();
    if (!prov || prov === "-" || prov.length < 3) continue;
    if (/^iva|^iibb|^perc|^impuesto|^sueldo|^carga|^sindicato|^envios|^retiro|^afip|^arca/.test(prov)) continue;
    centralizados.push({
      proveedor: group[0].proveedor,
      fecha: group[0].fechaIng || group[0].fechaFC,
      total: group[0].total,
      sucursalesIncluidas: sucursalesEnGrupo,
      rownums: group.map((r) => ({ sucursal: r.sucursal, rownum: r.rownum })),
    });
  }

  const stats: DeudaLocalesAnalisis["stats"] = {
    palermo: { totalMovimientos: 0, totalMonto: 0, pagados: 0, pendientes: 0 },
    belgrano: { totalMovimientos: 0, totalMonto: 0, pagados: 0, pendientes: 0 },
    madero: { totalMovimientos: 0, totalMonto: 0, pagados: 0, pendientes: 0 },
  };
  for (const m of movimientos) {
    const s = stats[m.sucursalOrigen];
    s.totalMovimientos += 1;
    s.totalMonto += m.total;
    if (m.estadoPago === "pagado") s.pagados += m.total;
    else s.pendientes += m.total;
  }

  return {
    movimientos: movimientos.sort((a, b) => b.total - a.total),
    matriz,
    saldosNetos: saldosNetos.sort((a, b) => b.monto - a.monto),
    totalSinDireccion,
    centralizados: centralizados.sort((a, b) => b.total - a.total),
    totalCentralizados: centralizados.length,
    montoCentralizadosDuplicado: centralizados.reduce((s, c) => s + c.total * (c.sucursalesIncluidas.length - 1), 0),
    stats,
  };
}
