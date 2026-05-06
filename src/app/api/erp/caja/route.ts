import { NextRequest, NextResponse } from "next/server";
import { requirePermissionApi } from "@/lib/admin-permissions";
import { readSheetRaw, parseArs, parseDate } from "@/lib/google";
import { getSales } from "@/lib/fudo-client";
import { getSucursal } from "@/lib/sucursales";
import { ParsedSale } from "@/types";
import { format } from "date-fns";

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
const SUC_ERP_TO_FUDO: Record<string, string> = {
  palermo: "palermo",
  belgrano: "belgrano",
  madero: "puerto",
};

type Bucket = "efectivo" | "tarjeta" | "mp" | "transferencia" | "cuentaCte" | "otro";

/**
 * Clasificar metodo de pago de Fudo en un bucket de caja.
 */
function classifyMetodoFudo(methodName: string): Bucket {
  const m = methodName.toLowerCase();
  if (m.includes("efectivo") || m.includes("cash")) return "efectivo";
  if (m.includes("mercado") || m.includes("mp")) return "mp";
  if (m.includes("tarjeta") || m.includes("debito") || m.includes("crédito") || m.includes("credito") || m.includes("posnet")) return "tarjeta";
  if (m.includes("transfer") || m.includes("cvu")) return "transferencia";
  if (m.includes("cuenta corriente") || m.includes("cta") || m.includes("cuenta")) return "cuentaCte";
  return "otro";
}

/**
 * Clasificar metodo de pago del EGRESOS tab en un bucket de caja.
 * Valores comunes: "Efectivo Local", "Bco ST PALERMO", "Mercado Pago", "Tarjeta", "Sin pagar"
 */
function classifyMetodoEgreso(metodo: string): Bucket {
  const m = metodo.toLowerCase().trim();
  if (m.includes("efectivo") || m.includes("retiro")) return "efectivo";
  if (m.includes("mercado") || m.includes("mp")) return "mp";
  if (m.includes("tarjeta") || m.includes("posnet")) return "tarjeta";
  if (m.includes("bco") || m.includes("banco") || m.includes("santander") || m.includes("bbva") ||
      m.includes("galicia") || m.includes("transfer") || m.includes("e-cheq") || m.includes("eche")) return "transferencia";
  return "otro";
}

interface DayCash {
  date: string; // YYYY-MM-DD
  ingresos: Record<Bucket, number>;
  ingresosTotal: number;
  ordenes: number;
  egresos: Record<Bucket, number>;
  egresosTotal: number;
  neto: number;
}

function emptyBuckets(): Record<Bucket, number> {
  return { efectivo: 0, tarjeta: 0, mp: 0, transferencia: 0, cuentaCte: 0, otro: 0 };
}

/**
 * Parse EGRESOS rows que fueron PAGADAS en el mes objetivo.
 */
function parsePaidEgresos(rows: string[][], yearMonth: string): Array<{ date: string; total: number; bucket: Bucket; proveedor: string; rubro: string; metodoPago: string }> {
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

  const colFechaPago = findCol("Fecha Pago");
  const colProveedor = findCol("PROVEEDOR", "Proveedor");
  const colRubro = findCol("Rubro");
  const colTotal = findCol("Total");
  const colMetodoPago = findCol("Metodo de Pago", "Método de Pago");

  const result: Array<{ date: string; total: number; bucket: Bucket; proveedor: string; rubro: string; metodoPago: string }> = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;
    const total = colTotal >= 0 ? parseArs(row[colTotal] || "") : 0;
    if (total === 0) continue;
    const fechaPago = colFechaPago >= 0 ? parseDate(row[colFechaPago] || "") : null;
    if (!fechaPago) continue;
    if (!fechaPago.startsWith(yearMonth)) continue;

    const metodoPago = colMetodoPago >= 0 ? (row[colMetodoPago] || "").trim() : "";
    if (!metodoPago || metodoPago.toLowerCase().includes("sin pagar")) continue;

    result.push({
      date: fechaPago,
      total,
      bucket: classifyMetodoEgreso(metodoPago),
      proveedor: colProveedor >= 0 ? (row[colProveedor] || "").trim() : "",
      rubro: colRubro >= 0 ? (row[colRubro] || "").trim().replace(/\s+/g, " ") : "",
      metodoPago,
    });
  }
  return result;
}

/**
 * Sumarizar ventas Fudo por dia + bucket.
 */
function aggregateSales(sales: ParsedSale[]): Record<string, { ingresos: Record<Bucket, number>; ordenes: number }> {
  const result: Record<string, { ingresos: Record<Bucket, number>; ordenes: number }> = {};
  for (const sale of sales) {
    const ts = sale.closedAt || sale.createdAt;
    if (!ts) continue;
    // Convertir a fecha local AR
    const d = new Date(ts);
    const dateStr = format(new Date(d.getTime() - 3 * 60 * 60 * 1000), "yyyy-MM-dd");

    if (!result[dateStr]) {
      result[dateStr] = { ingresos: emptyBuckets(), ordenes: 0 };
    }
    result[dateStr].ordenes += 1;
    if (sale.payments.length > 0) {
      for (const p of sale.payments) {
        if (p.canceled) continue;
        const bucket = classifyMetodoFudo(p.methodName);
        result[dateStr].ingresos[bucket] += p.amount;
      }
    } else {
      // Si no hay pagos categorizados, usar total como "otro"
      result[dateStr].ingresos.otro += sale.total;
    }
  }
  return result;
}

export async function GET(request: NextRequest) {
  const auth = await requirePermissionApi(request, "caja");
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(request.url);
    const sucursalErp = url.searchParams.get("sucursal") || "palermo";
    const year = url.searchParams.get("year") || "2026";
    const month = url.searchParams.get("month") || String(new Date().getMonth() + 1).padStart(2, "0");
    const monthStr = month.padStart(2, "0");

    const sheetId = SHEET_IDS[year]?.[sucursalErp];
    if (!sheetId) return NextResponse.json({ error: `Sheet no configurado para ${sucursalErp} ${year}` }, { status: 400 });

    const sucursalFudo = SUC_ERP_TO_FUDO[sucursalErp];
    const sucursalConfig = getSucursal(sucursalFudo as never);

    const yearMonth = `${year}-${monthStr}`;
    const daysInMonth = new Date(parseInt(year), parseInt(monthStr), 0).getDate();
    const fromDate = `${year}-${monthStr}-01`;
    const toDate = `${year}-${monthStr}-${String(daysInMonth).padStart(2, "0")}`;

    // Pull data en paralelo
    const [egresoRows, sales] = await Promise.all([
      readSheetRaw(sheetId, "EGRESOS!A1:Z5000"),
      sucursalConfig ? getSales(sucursalConfig, fromDate, toDate).catch((e) => {
        console.error("Caja: getSales error", e);
        return [] as ParsedSale[];
      }) : Promise.resolve([] as ParsedSale[]),
    ]);

    const paidEgresos = parsePaidEgresos(egresoRows, yearMonth);
    const salesByDay = aggregateSales(sales);

    // Construir array dia por dia
    const days: DayCash[] = [];
    const totalsAcc = {
      ingresos: emptyBuckets(),
      ingresosTotal: 0,
      ordenes: 0,
      egresos: emptyBuckets(),
      egresosTotal: 0,
      neto: 0,
    };

    for (let d = 1; d <= daysInMonth; d++) {
      const dStr = `${year}-${monthStr}-${String(d).padStart(2, "0")}`;
      const sd = salesByDay[dStr];
      const ingresos = sd ? { ...sd.ingresos } : emptyBuckets();
      const ingresosTotal = Object.values(ingresos).reduce((a, b) => a + b, 0);
      const ordenes = sd ? sd.ordenes : 0;

      const egresos = emptyBuckets();
      for (const e of paidEgresos) {
        if (e.date === dStr) egresos[e.bucket] += e.total;
      }
      const egresosTotal = Object.values(egresos).reduce((a, b) => a + b, 0);

      days.push({
        date: dStr,
        ingresos,
        ingresosTotal,
        ordenes,
        egresos,
        egresosTotal,
        neto: ingresosTotal - egresosTotal,
      });

      // Totals
      for (const b of Object.keys(ingresos) as Bucket[]) {
        totalsAcc.ingresos[b] += ingresos[b];
        totalsAcc.egresos[b] += egresos[b];
      }
      totalsAcc.ingresosTotal += ingresosTotal;
      totalsAcc.egresosTotal += egresosTotal;
      totalsAcc.ordenes += ordenes;
    }
    totalsAcc.neto = totalsAcc.ingresosTotal - totalsAcc.egresosTotal;

    // Top egresos del mes para drill-down
    const topEgresos = [...paidEgresos]
      .sort((a, b) => b.total - a.total)
      .slice(0, 50)
      .map((e) => ({ ...e }));

    return NextResponse.json({
      sucursal: sucursalErp,
      year,
      month: monthStr,
      days,
      totals: totalsAcc,
      topEgresos,
    });
  } catch (e) {
    console.error("ERP caja error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error interno" },
      { status: 500 }
    );
  }
}
