import { NextRequest, NextResponse } from "next/server";
import { requirePermissionApi } from "@/lib/admin-permissions";
import { readSheetRaw, parseArs, parseDate } from "@/lib/google";
import { getLiveMonthlySummaries } from "@/lib/dashboard-data";
import fs from "fs";
import path from "path";

const ERP_CONFIG_SHEET = process.env.ERP_CONFIG_SHEET_ID || "1YMIE_t1O5RBfXGwFQf7xzh-TeuPUV6SfIl4Smj2mk1g";

/**
 * Lee overrides de RubroCategorias de manera tolerante (si la tab no existe, devuelve {}).
 */
async function readRubroOverrides(): Promise<Record<string, string>> {
  try {
    const rows = await readSheetRaw(ERP_CONFIG_SHEET, "RubroCategorias!A2:B1000");
    const result: Record<string, string> = {};
    for (const row of rows) {
      const rubro = (row[0] || "").toString().trim();
      const categoria = (row[1] || "").toString().trim().toLowerCase();
      if (rubro && categoria) result[rubro] = categoria;
    }
    return result;
  } catch {
    return {};
  }
}

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

// Map ERP sucursal id -> Fudo sucursal id
const SUC_ERP_TO_FUDO: Record<string, string> = {
  palermo: "palermo",
  belgrano: "belgrano",
  madero: "puerto",
};

type Categoria =
  | "insumos"
  | "sueldos"
  | "alquilerServicios"
  | "operativos"
  | "financieros"
  | "impuestos"
  | "retiros"      // Ganancia distribuida a socios — NO es gasto
  | "otros";

/**
 * Clasificar un rubro en una categoria de P&L.
 * Usamos matching case-insensitive por palabras clave.
 */
function classifyRubro(rubro: string): Categoria {
  const r = rubro.trim().toLowerCase();
  if (!r) return "otros";

  // Retiros / Ganancia (NO es gasto, es distribución a socios)
  if (r.includes("retiro") || r.includes("socio") || r.includes("dividendo")) return "retiros";

  // Insumos / CMV
  const insumosKeys = [
    "almacen", "bebida", "postre", "café", "cafe", "carnic", "descart",
    "oriental", "pescader", "verduler", "envios", "envíos", "polleria", "pollería",
    "frut", "lácte", "lacte", "panad", "queso", "fiambr",
  ];
  if (insumosKeys.some((k) => r.includes(k))) return "insumos";

  // Sueldos / RRHH
  const sueldosKeys = [
    "rrhh", "sueldo", "comida personal", "reemplazo", "extra evento",
    "sindicato", "aguinaldo", "prevision", "previsión", "carga social",
    "liquidacion", "liquidación", "despido", "horas extra", "viáti", "viati",
    "art ", "monotrib", "obra social", "personal",
  ];
  if (sueldosKeys.some((k) => r.includes(k))) return "sueldos";

  // Alquiler + Servicios (luz, gas, internet, agua, ABL, expensas)
  const alqServKeys = [
    "alquiler", "servicios", "expensas", "exp.", "abl ", "abl",
    "luz", "gas butano", "gas ", "agua ", "aysa", "edenor", "edesur",
    "internet", "wifi", "telef", "telecom", "metrogas",
  ];
  if (alqServKeys.some((k) => r.includes(k))) return "alquilerServicios";

  // Financieros / Bancarios
  if (r.includes("bancari") || r.includes("comision") || r.includes("comisión") ||
      r.includes("interes") || r.includes("interés") || r.includes("financi") ||
      r.includes("cambio a dolar") || r.includes("posnet")) return "financieros";

  // Impuestos / Acuerdos
  if (r.includes("iva") || r.includes("iibb") || r.includes("impuesto") ||
      r.includes("retenc") || r.includes("afip") || r.includes("acuerdo") ||
      r.includes("imp.") || r.includes("interno") || r.includes("ingresos brut")) return "impuestos";

  // Operativos varios (lo demas que no caiga en otros)
  const operativosKeys = [
    "bazar", "equipamiento", "farmacia", "honorario", "abono", "inversion",
    "inversión", "libreria", "librería", "limpieza", "mantenim", "redes",
    "varios", "hielo", "gerenciamiento", "gasto operativo", "gas operativo",
    "marketing", "publicidad", "uniforme", "delivery",
  ];
  if (operativosKeys.some((k) => r.includes(k))) return "operativos";

  return "otros";
}

interface PnLMonth {
  year: number;
  month: number;
  ventas: number; // NETAS (lo que cobramos)
  ventasBrutas: number; // antes de descuentos
  descuentos: number; // brutas - netas
  ordenes: number;
  comensales: number;
  ticketPromedio: number;
  costos: {
    insumos: number;
    sueldos: number;
    alquilerServicios: number;
    operativos: number;
    financieros: number;
    impuestos: number;
    otros: number;
    total: number;
  };
  retiros: number; // ganancia distribuida — NO suma a costos
  margenBruto: number;
  cmvPct: number; // CMV vs ventas BRUTAS (más preciso, descuentos no son responsabilidad del CMV)
  cmvPctNetas: number; // CMV vs ventas netas (referencia)
  ebitda: number;
  ebitdaPct: number;
}

interface RubroBreakdown {
  rubro: string;
  categoria: Categoria;
  categoriaDefault: Categoria;
  isOverride: boolean;
  total: number;
  facturas: number;
  byMonth: Record<number, number>; // mes -> total
  proveedores: Array<{ name: string; total: number; facturas: number }>;
}

/**
 * Parse EGRESOS rows and compute monthly totals by category, PAGADOS ONLY.
 * Usa fechaPago como referencia de cash real.
 */
function parseCostsByMonth(
  rows: string[][],
  overrides: Record<string, string>
): { byMonth: Record<number, Record<Categoria, number>>; byRubro: RubroBreakdown[] } {
  const byMonth: Record<number, Record<Categoria, number>> = {};
  const byRubro: Record<string, {
    categoria: Categoria;
    categoriaDefault: Categoria;
    isOverride: boolean;
    total: number;
    facturas: number;
    byMonth: Record<number, number>;
    proveedores: Record<string, { total: number; facturas: number }>;
  }> = {};

  if (rows.length < 2) return { byMonth, byRubro: [] };

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

  const colFechaPago = findCol("Fecha Pago");
  const colProveedor = findCol("PROVEEDOR", "Proveedor");
  const colRubro = findCol("Rubro");
  const colTotal = findCol("Total");
  const colMetodoPago = findCol("Metodo de Pago", "Método de Pago");

  const validCategorias: Categoria[] = ["insumos", "sueldos", "alquilerServicios", "operativos", "financieros", "impuestos", "retiros", "otros"];

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;
    const total = colTotal >= 0 ? parseArs(row[colTotal] || "") : 0;
    if (total === 0) continue;
    const proveedor = colProveedor >= 0 ? (row[colProveedor] || "").trim() : "";
    if (!proveedor) continue;

    const fechaPago = colFechaPago >= 0 ? parseDate(row[colFechaPago] || "") : null;
    const metodoPago = colMetodoPago >= 0 ? (row[colMetodoPago] || "").trim().toLowerCase() : "";
    // Solo contar pagados
    if (!fechaPago) continue;
    if (!metodoPago || metodoPago.includes("sin pagar") || metodoPago === "pendiente") continue;

    const mes = parseInt(fechaPago.substring(5, 7));
    const rubro = colRubro >= 0 ? (row[colRubro] || "").trim().replace(/\s+/g, " ") : "";

    const catDefault = classifyRubro(rubro);
    const overrideRaw = overrides[rubro];
    const isOverride = !!(overrideRaw && validCategorias.includes(overrideRaw as Categoria) && overrideRaw !== catDefault);
    const cat = isOverride ? (overrideRaw as Categoria) : catDefault;

    if (!byMonth[mes]) {
      byMonth[mes] = { insumos: 0, sueldos: 0, alquilerServicios: 0, operativos: 0, financieros: 0, impuestos: 0, retiros: 0, otros: 0 };
    }
    byMonth[mes][cat] += total;

    if (!byRubro[rubro]) {
      byRubro[rubro] = {
        categoria: cat,
        categoriaDefault: catDefault,
        isOverride,
        total: 0,
        facturas: 0,
        byMonth: {},
        proveedores: {},
      };
    }
    byRubro[rubro].total += total;
    byRubro[rubro].facturas += 1;
    byRubro[rubro].byMonth[mes] = (byRubro[rubro].byMonth[mes] || 0) + total;

    // Track proveedor stats per rubro
    if (!byRubro[rubro].proveedores[proveedor]) {
      byRubro[rubro].proveedores[proveedor] = { total: 0, facturas: 0 };
    }
    byRubro[rubro].proveedores[proveedor].total += total;
    byRubro[rubro].proveedores[proveedor].facturas += 1;
  }

  const rubroBreakdown: RubroBreakdown[] = Object.entries(byRubro)
    .map(([rubro, r]) => ({
      rubro,
      categoria: r.categoria,
      categoriaDefault: r.categoriaDefault,
      isOverride: r.isOverride,
      total: r.total,
      facturas: r.facturas,
      byMonth: r.byMonth,
      proveedores: Object.entries(r.proveedores)
        .map(([name, p]) => ({ name, ...p }))
        .sort((a, b) => b.total - a.total),
    }))
    .sort((a, b) => b.total - a.total);

  return { byMonth, byRubro: rubroBreakdown };
}

interface VentasMes {
  ventas: number; // netas
  ventasBrutas: number;
  descuentos: number;
  ordenes: number;
  comensales: number;
}

/**
 * Cargar datos historicos de ventas del JSON + live Fudo (merge).
 */
async function loadMonthlyVentas(sucursalFudo: string, year: number): Promise<Record<number, VentasMes>> {
  const result: Record<number, VentasMes> = {};

  // Live de Fudo (oct 2025 -> hoy) — ya trae gross/discounts
  try {
    const live = await getLiveMonthlySummaries();
    const sucursalData = live[sucursalFudo] || {};
    for (const key of Object.keys(sucursalData)) {
      const [y, m] = key.split("-").map(Number);
      if (y !== year) continue;
      const s = sucursalData[key] as {
        totalSales?: number;
        totalGrossSales?: number;
        totalDiscounts?: number;
        totalOrders?: number;
        totalPeople?: number;
      };
      const ventas = s.totalSales || 0;
      const gross = s.totalGrossSales || ventas; // fallback a netas si no hay gross
      const desc = s.totalDiscounts || 0;
      result[m] = {
        ventas,
        ventasBrutas: gross,
        descuentos: desc,
        ordenes: s.totalOrders || 0,
        comensales: s.totalPeople || 0,
      };
    }
  } catch (e) {
    console.error("loadMonthlyVentas live error:", e);
  }

  // JSON historico (pre-oct 2025) — el JSON viejo NO tiene gross/discounts
  try {
    const p = path.join(process.cwd(), "data/historico/resumen-mensual.json");
    if (fs.existsSync(p)) {
      const raw = fs.readFileSync(p, "utf-8");
      const data = JSON.parse(raw) as Record<string, Record<string, { totalSales?: number; totalGrossSales?: number; totalDiscounts?: number; totalOrders?: number; totalPeople?: number }>>;
      const sucursalData = data[sucursalFudo] || {};
      for (const key of Object.keys(sucursalData)) {
        const [y, m] = key.split("-").map(Number);
        if (y !== year) continue;
        if (result[m]) continue;
        const s = sucursalData[key];
        const ventas = s.totalSales || 0;
        result[m] = {
          ventas,
          ventasBrutas: s.totalGrossSales || ventas, // fallback a netas
          descuentos: s.totalDiscounts || 0,
          ordenes: s.totalOrders || 0,
          comensales: s.totalPeople || 0,
        };
      }
    }
  } catch (e) {
    console.error("loadMonthlyVentas historico error:", e);
  }

  return result;
}

export async function GET(request: NextRequest) {
  const auth = await requirePermissionApi(request, "pnl");
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(request.url);
    const sucursalErp = url.searchParams.get("sucursal") || "palermo";
    const year = url.searchParams.get("year") || "2026";
    const yearNum = parseInt(year);

    const sheetId = SHEET_IDS[year]?.[sucursalErp];
    if (!sheetId) {
      return NextResponse.json({ error: `Sheet no configurado para ${sucursalErp} ${year}` }, { status: 400 });
    }
    const sucursalFudo = SUC_ERP_TO_FUDO[sucursalErp];

    const [rows, ventas, overrides] = await Promise.all([
      readSheetRaw(sheetId, "EGRESOS!A1:Z5000"),
      loadMonthlyVentas(sucursalFudo, yearNum),
      readRubroOverrides(),
    ]);

    const { byMonth, byRubro } = parseCostsByMonth(rows, overrides);

    // Armar P&L por mes
    const months: PnLMonth[] = [];
    for (let m = 1; m <= 12; m++) {
      const v = ventas[m] || { ventas: 0, ventasBrutas: 0, descuentos: 0, ordenes: 0, comensales: 0 };
      const c = byMonth[m] || { insumos: 0, sueldos: 0, alquilerServicios: 0, operativos: 0, financieros: 0, impuestos: 0, retiros: 0, otros: 0 };
      const totalCostos = c.insumos + c.sueldos + c.alquilerServicios + c.operativos + c.financieros + c.impuestos + c.otros;
      const margenBruto = v.ventas - c.insumos;
      // CMV vs ventas BRUTAS (más operativo, los descuentos no afectan el costo de los insumos)
      const cmvPct = v.ventasBrutas > 0 ? (c.insumos / v.ventasBrutas) * 100 : 0;
      const cmvPctNetas = v.ventas > 0 ? (c.insumos / v.ventas) * 100 : 0;
      const ebitda = v.ventas - totalCostos;
      const ebitdaPct = v.ventas > 0 ? (ebitda / v.ventas) * 100 : 0;

      months.push({
        year: yearNum,
        month: m,
        ventas: v.ventas,
        ventasBrutas: v.ventasBrutas,
        descuentos: v.descuentos,
        ordenes: v.ordenes,
        comensales: v.comensales,
        ticketPromedio: v.ordenes > 0 ? v.ventas / v.ordenes : 0,
        costos: {
          insumos: c.insumos,
          sueldos: c.sueldos,
          alquilerServicios: c.alquilerServicios,
          operativos: c.operativos,
          financieros: c.financieros,
          impuestos: c.impuestos,
          otros: c.otros,
          total: totalCostos,
        },
        retiros: c.retiros,
        margenBruto,
        cmvPct,
        cmvPctNetas,
        ebitda,
        ebitdaPct,
      });
    }

    // Acumulado YTD
    const ytd = months.reduce((acc, m) => {
      acc.ventas += m.ventas;
      acc.ventasBrutas += m.ventasBrutas;
      acc.descuentos += m.descuentos;
      acc.ordenes += m.ordenes;
      acc.comensales += m.comensales;
      acc.costosInsumos += m.costos.insumos;
      acc.costosSueldos += m.costos.sueldos;
      acc.costosAlquilerServicios += m.costos.alquilerServicios;
      acc.costosOperativos += m.costos.operativos;
      acc.costosFinancieros += m.costos.financieros;
      acc.costosImpuestos += m.costos.impuestos;
      acc.costosOtros += m.costos.otros;
      acc.costosTotal += m.costos.total;
      acc.retiros += m.retiros;
      acc.ebitda += m.ebitda;
      return acc;
    }, {
      ventas: 0, ventasBrutas: 0, descuentos: 0, ordenes: 0, comensales: 0,
      costosInsumos: 0, costosSueldos: 0, costosAlquilerServicios: 0,
      costosOperativos: 0, costosFinancieros: 0, costosImpuestos: 0, costosOtros: 0,
      costosTotal: 0, retiros: 0, ebitda: 0,
    });
    const cmvPctYtd = ytd.ventasBrutas > 0 ? (ytd.costosInsumos / ytd.ventasBrutas) * 100 : 0;
    const cmvPctNetasYtd = ytd.ventas > 0 ? (ytd.costosInsumos / ytd.ventas) * 100 : 0;
    const descuentosPctYtd = ytd.ventasBrutas > 0 ? (ytd.descuentos / ytd.ventasBrutas) * 100 : 0;
    const ebitdaPctYtd = ytd.ventas > 0 ? (ytd.ebitda / ytd.ventas) * 100 : 0;

    return NextResponse.json({
      sucursal: sucursalErp,
      year,
      months,
      ytd: { ...ytd, cmvPct: cmvPctYtd, cmvPctNetas: cmvPctNetasYtd, descuentosPct: descuentosPctYtd, ebitdaPct: ebitdaPctYtd },
      byRubro,
    });
  } catch (e) {
    console.error("ERP pnl error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error interno" },
      { status: 500 }
    );
  }
}
