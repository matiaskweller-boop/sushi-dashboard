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

interface AlertItem {
  tipo: "vencido" | "porVencer" | "altoMonto" | "sinDatos";
  prioridad: "alta" | "media" | "baja";
  sucursal: string;
  proveedor: string;
  rubro: string;
  total: number;
  fechaFC: string | null;
  fechaVto: string | null;
  diasVencido: number | null;
  diasParaVencer: number | null;
  metodoPago: string;
  nroComprobante: string;
}

function diff(a: string, b: string): number {
  return Math.floor((new Date(a).getTime() - new Date(b).getTime()) / (1000 * 60 * 60 * 24));
}

function isPagado(fechaPago: string | null, metodo: string): boolean {
  if (!fechaPago) return false;
  const m = metodo.toLowerCase();
  if (!m || m.includes("sin pagar") || m === "pendiente") return false;
  return true;
}

function parseEgresosForAlerts(sucursal: string, rows: string[][], hoy: string): AlertItem[] {
  if (rows.length < 2) return [];
  let headerIdx = 0;
  for (let i = 0; i < Math.min(5, rows.length); i++) {
    const r = rows[i].map((c) => (c || "").toString().toUpperCase());
    if (r.some((c) => c.includes("PROVEEDOR"))) { headerIdx = i; break; }
  }
  const headers = rows[headerIdx].map((c) => (c || "").toString().trim());
  const findCol = (...names: string[]): number => {
    for (const n of names) {
      const idx = headers.findIndex((h) => h.toUpperCase().includes(n.toUpperCase()));
      if (idx !== -1) return idx;
    }
    return -1;
  };
  const colFechaFC = findCol("Fecha FC");
  const colFechaPago = findCol("Fecha Pago");
  const colProveedor = findCol("PROVEEDOR", "Proveedor");
  const colRubro = findCol("Rubro");
  const colTotal = findCol("Total");
  const colMetodo = findCol("Metodo de Pago");
  const colNro = findCol("N COMPROBANTE", "Nro");
  const colVto = findCol("Vto.", "Vencimiento");

  const alerts: AlertItem[] = [];

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;
    const total = colTotal >= 0 ? parseArs(row[colTotal] || "") : 0;
    if (total === 0) continue;
    const proveedor = colProveedor >= 0 ? (row[colProveedor] || "").trim() : "";
    if (!proveedor) continue;

    const fechaFC = colFechaFC >= 0 ? parseDate(row[colFechaFC] || "") : null;
    const fechaPago = colFechaPago >= 0 ? parseDate(row[colFechaPago] || "") : null;
    const fechaVto = colVto >= 0 ? parseDate(row[colVto] || "") : null;
    const metodo = colMetodo >= 0 ? (row[colMetodo] || "").trim() : "";

    if (isPagado(fechaPago, metodo)) continue; // ya pagado, sin alerta

    const ref = fechaVto || fechaFC;
    if (!ref) continue;

    const days = diff(ref, hoy); // negativo si vencido, positivo si futuro

    const item: AlertItem = {
      tipo: "vencido",
      prioridad: "media",
      sucursal,
      proveedor,
      rubro: colRubro >= 0 ? (row[colRubro] || "").trim().replace(/\s+/g, " ") : "",
      total,
      fechaFC,
      fechaVto,
      diasVencido: null,
      diasParaVencer: null,
      metodoPago: metodo,
      nroComprobante: colNro >= 0 ? (row[colNro] || "").trim() : "",
    };

    if (days < 0) {
      item.tipo = "vencido";
      item.diasVencido = -days;
      item.prioridad = -days > 30 ? "alta" : -days > 15 ? "media" : "baja";
      alerts.push(item);
    } else if (days <= 7) {
      item.tipo = "porVencer";
      item.diasParaVencer = days;
      item.prioridad = days <= 2 ? "alta" : days <= 5 ? "media" : "baja";
      alerts.push(item);
    }
    // Else: vencimiento muy lejano, no es alerta
  }

  return alerts;
}

export async function GET(request: NextRequest) {
  const auth = await requirePermissionApi(request, "alertas");
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(request.url);
    const year = url.searchParams.get("year") || "2026";
    const sheets = SHEET_IDS[year];
    if (!sheets) return NextResponse.json({ error: `Año ${year} no configurado` }, { status: 400 });

    const hoy = new Date().toISOString().substring(0, 10);
    const sucursales = ["palermo", "belgrano", "madero"];

    const allAlerts: AlertItem[] = [];
    await Promise.all(
      sucursales.map(async (suc) => {
        if (!sheets[suc]) return;
        try {
          const rows = await readSheetRaw(sheets[suc], "EGRESOS!A1:Z5000");
          const items = parseEgresosForAlerts(suc, rows, hoy);
          allAlerts.push(...items);
        } catch (e) {
          console.error(`Alertas ${suc}:`, e);
        }
      })
    );

    // Ordenar: vencidas primero (mas dias = mas urgente), luego porVencer (menos dias = mas urgente)
    allAlerts.sort((a, b) => {
      if (a.tipo === "vencido" && b.tipo !== "vencido") return -1;
      if (a.tipo !== "vencido" && b.tipo === "vencido") return 1;
      if (a.tipo === "vencido") return (b.diasVencido || 0) - (a.diasVencido || 0);
      return (a.diasParaVencer || 0) - (b.diasParaVencer || 0);
    });

    const vencidas = allAlerts.filter((a) => a.tipo === "vencido");
    const porVencer = allAlerts.filter((a) => a.tipo === "porVencer");
    const totalVencido = vencidas.reduce((s, a) => s + a.total, 0);
    const totalPorVencer = porVencer.reduce((s, a) => s + a.total, 0);

    // Por sucursal stats
    const porSucursal: Record<string, { vencidas: number; porVencer: number; totalVencido: number; totalPorVencer: number }> = {};
    for (const suc of sucursales) {
      porSucursal[suc] = {
        vencidas: vencidas.filter((a) => a.sucursal === suc).length,
        porVencer: porVencer.filter((a) => a.sucursal === suc).length,
        totalVencido: vencidas.filter((a) => a.sucursal === suc).reduce((s, a) => s + a.total, 0),
        totalPorVencer: porVencer.filter((a) => a.sucursal === suc).reduce((s, a) => s + a.total, 0),
      };
    }

    return NextResponse.json({
      year,
      alertas: allAlerts,
      vencidas,
      porVencer,
      totalVencido,
      totalPorVencer,
      porSucursal,
    });
  } catch (e) {
    console.error("ERP alertas error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error interno" },
      { status: 500 }
    );
  }
}
