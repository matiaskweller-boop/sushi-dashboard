import { NextRequest, NextResponse } from "next/server";
import { requirePermissionApi } from "@/lib/admin-permissions";
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

interface EgresoRow {
  sucursal: string;
  fechaIngreso: string | null;
  fechaFC: string | null;
  fechaPago: string | null;
  fechaVto: string | null;
  mes: number | null;
  mesPago: number | null;
  mesVto: number | null;
  proveedor: string;
  tipoComprobante: string;
  nroComprobante: string;
  rubro: string;
  insumo: string;
  total: number;
  metodoPago: string;
  estadoPago: "pagado" | "pendiente";
  // Para pendientes: vencida si Vto <= hoy
  tipoDeuda: "ninguna" | "vencida" | "futura";
  diasVencido: number | null;
}

/**
 * Decide si una fila esta pagada. Una factura se considera pagada si tiene
 * Fecha de Pago Y el Metodo de Pago no es "Sin pagar" (case-insensitive).
 */
function isPagado(fechaPago: string | null, metodoPago: string): boolean {
  if (!fechaPago) return false;
  const m = metodoPago.trim().toLowerCase();
  if (!m) return false;
  if (m.includes("sin pagar")) return false;
  if (m === "pendiente" || m === "no pagado") return false;
  return true;
}

/**
 * Parse a sucursal's EGRESOS tab into structured rows.
 * Column structure varies slightly across sheets; we detect by header row.
 */
function parseEgresos(sucursal: string, rows: string[][]): EgresoRow[] {
  if (rows.length < 2) return [];

  // Find header row (first row with "PROVEEDOR" or similar)
  let headerIdx = 0;
  for (let i = 0; i < Math.min(5, rows.length); i++) {
    const row = rows[i].map((c) => (c || "").toString().toUpperCase());
    if (row.some((c) => c.includes("PROVEEDOR"))) {
      headerIdx = i;
      break;
    }
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
  const colTipo = findCol("Tipo comprobante", "Tipo de Comprobante");
  const colNro = findCol("N COMPROBANTE", "Nro comprobante");
  const colRubro = findCol("Rubro");
  const colInsumo = findCol("INSUMOS", "Insumos");
  const colTotal = findCol("Total");
  const colMetodoPago = findCol("Metodo de Pago", "Método de Pago");
  const colVto = findCol("Vto.", "Vencimiento", "Vto");

  // Fecha de hoy en ISO (local time AR pero para comparar basta con la fecha calendar)
  const hoy = new Date().toISOString().substring(0, 10);

  const result: EgresoRow[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;
    const total = colTotal >= 0 ? parseArs(row[colTotal] || "") : 0;
    if (total === 0) continue;
    const proveedor = colProveedor >= 0 ? (row[colProveedor] || "").trim() : "";
    if (!proveedor) continue;

    const fechaFC = colFechaFC >= 0 ? parseDate(row[colFechaFC] || "") : null;
    const fechaIng = colFechaIng >= 0 ? parseDate(row[colFechaIng] || "") : null;
    const fechaPago = colFechaPago >= 0 ? parseDate(row[colFechaPago] || "") : null;
    const fechaVto = colVto >= 0 ? parseDate(row[colVto] || "") : null;
    const fecha = fechaFC || fechaIng;
    const mes = fecha ? parseInt(fecha.substring(5, 7)) : null;
    const mesPago = fechaPago ? parseInt(fechaPago.substring(5, 7)) : null;
    const mesVto = fechaVto ? parseInt(fechaVto.substring(5, 7)) : null;

    const metodoPago = colMetodoPago >= 0 ? (row[colMetodoPago] || "").trim() : "";
    const estadoPago: "pagado" | "pendiente" = isPagado(fechaPago, metodoPago) ? "pagado" : "pendiente";

    // Clasificar deuda
    let tipoDeuda: "ninguna" | "vencida" | "futura" = "ninguna";
    let diasVencido: number | null = null;
    if (estadoPago === "pendiente") {
      const ref = fechaVto || fechaFC; // Si no hay Vto., usar FC como fallback
      if (ref) {
        if (ref <= hoy) {
          tipoDeuda = "vencida";
          // Calcular dias vencidos
          const refD = new Date(ref).getTime();
          const hoyD = new Date(hoy).getTime();
          diasVencido = Math.floor((hoyD - refD) / (1000 * 60 * 60 * 24));
        } else {
          tipoDeuda = "futura";
        }
      } else {
        tipoDeuda = "vencida"; // Sin fecha = asumir vencida
      }
    }

    result.push({
      sucursal,
      fechaIngreso: fechaIng,
      fechaFC,
      fechaPago,
      fechaVto,
      mes,
      mesPago,
      mesVto,
      proveedor,
      tipoComprobante: colTipo >= 0 ? (row[colTipo] || "").trim() : "",
      nroComprobante: colNro >= 0 ? (row[colNro] || "").trim() : "",
      rubro: colRubro >= 0 ? (row[colRubro] || "").trim().replace(/\s+/g, " ") : "",
      insumo: colInsumo >= 0 ? (row[colInsumo] || "").trim() : "",
      total,
      metodoPago,
      estadoPago,
      tipoDeuda,
      diasVencido,
    });
  }
  return result;
}

export async function GET(request: NextRequest) {
  const auth = await requirePermissionApi(request, "egresos");
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(request.url);
    const sucursal = url.searchParams.get("sucursal") || "palermo";
    const year = url.searchParams.get("year") || "2026";

    const sheetId = SHEET_IDS[year]?.[sucursal];
    if (!sheetId) {
      return NextResponse.json({ error: `Sheet no configurado para ${sucursal} ${year}` }, { status: 400 });
    }

    const rows = await readSheetRaw(sheetId, "EGRESOS!A1:Z5000");
    const parsed = parseEgresos(sucursal, rows);

    // Aggregations — always on "pagados" only por defecto para reflejar cash real
    const pagados = parsed.filter((r) => r.estadoPago === "pagado");
    const pendientes = parsed.filter((r) => r.estadoPago === "pendiente");
    const vencidas = parsed.filter((r) => r.tipoDeuda === "vencida");
    const futuras = parsed.filter((r) => r.tipoDeuda === "futura");

    const totalPagado = pagados.reduce((s, r) => s + r.total, 0);
    const totalPendiente = pendientes.reduce((s, r) => s + r.total, 0);
    const totalVencido = vencidas.reduce((s, r) => s + r.total, 0);
    const totalFuturo = futuras.reduce((s, r) => s + r.total, 0);
    const totalGeneral = totalPagado + totalPendiente;

    // Proveedores con deuda: cuanto deben en vencida, cuanto en futura, cuanto pagado YTD
    const provMap: Record<string, {
      pagado: number;
      vencida: number;
      futura: number;
      totalFacturado: number;
      cntPagadas: number;
      cntVencidas: number;
      cntFuturas: number;
      maxDiasVencido: number;
    }> = {};
    for (const r of parsed) {
      if (!provMap[r.proveedor]) {
        provMap[r.proveedor] = {
          pagado: 0, vencida: 0, futura: 0, totalFacturado: 0,
          cntPagadas: 0, cntVencidas: 0, cntFuturas: 0, maxDiasVencido: 0,
        };
      }
      const p = provMap[r.proveedor];
      p.totalFacturado += r.total;
      if (r.estadoPago === "pagado") {
        p.pagado += r.total;
        p.cntPagadas += 1;
      } else if (r.tipoDeuda === "vencida") {
        p.vencida += r.total;
        p.cntVencidas += 1;
        if (r.diasVencido && r.diasVencido > p.maxDiasVencido) p.maxDiasVencido = r.diasVencido;
      } else if (r.tipoDeuda === "futura") {
        p.futura += r.total;
        p.cntFuturas += 1;
      }
    }
    const proveedoresDeuda = Object.entries(provMap)
      .map(([name, p]) => ({ name, ...p, deudaTotal: p.vencida + p.futura }))
      .sort((a, b) => b.deudaTotal - a.deudaTotal);

    // Aggregates split by pagados (usamos mesPago) y pendientes (usamos mes de FC)
    const buildAgg = (source: EgresoRow[], useMonthField: "mes" | "mesPago") => {
      const rubros: Record<string, number> = {};
      const proveedoresTop: Record<string, number> = {};
      const byMonth: Record<number, number> = {};
      const byMonthCount: Record<number, number> = {};
      for (const r of source) {
        if (r.rubro) rubros[r.rubro] = (rubros[r.rubro] || 0) + r.total;
        proveedoresTop[r.proveedor] = (proveedoresTop[r.proveedor] || 0) + r.total;
        const m = r[useMonthField];
        if (m) {
          byMonth[m] = (byMonth[m] || 0) + r.total;
          byMonthCount[m] = (byMonthCount[m] || 0) + 1;
        }
      }
      return {
        rubros,
        proveedoresTop: Object.entries(proveedoresTop)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 20)
          .map(([name, total]) => ({ name, total })),
        byMonth,
        byMonthCount,
      };
    };

    const aggPagado = buildAgg(pagados, "mesPago");
    const aggPendiente = buildAgg(pendientes, "mes");
    const aggTodos = buildAgg(parsed, "mes");

    return NextResponse.json({
      sucursal,
      year,
      rows: parsed,
      totalRows: parsed.length,
      totalPagadoRows: pagados.length,
      totalPendienteRows: pendientes.length,
      totalVencidoRows: vencidas.length,
      totalFuturoRows: futuras.length,
      total: totalGeneral,
      totalPagado,
      totalPendiente,
      totalVencido,
      totalFuturo,
      // Aggregates por estado — el frontend elige cual mostrar
      pagado: aggPagado,
      pendiente: aggPendiente,
      todos: aggTodos,
      // Proveedores con detalle de deuda (pagado, vencida, futura)
      proveedoresDeuda,
      // Backward compat (default = pagado, cash real)
      rubros: aggPagado.rubros,
      proveedoresTop: aggPagado.proveedoresTop,
      byMonth: aggPagado.byMonth,
      byMonthCount: aggPagado.byMonthCount,
    });
  } catch (e) {
    console.error("ERP egresos error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error interno" },
      { status: 500 }
    );
  }
}
