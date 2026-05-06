import { NextRequest, NextResponse } from "next/server";
import { verifySession, getSessionFromRequest } from "@/lib/auth";
import { getSales } from "@/lib/fudo-client";
import { getSucursal } from "@/lib/sucursales";
import { ParsedSale, SucursalId } from "@/types";
import { format } from "date-fns";

const SUC_ERP_TO_FUDO: Record<string, SucursalId> = {
  palermo: "palermo",
  belgrano: "belgrano",
  madero: "puerto",
};

interface DescuentoRow {
  saleId: string;
  fecha: string; // ISO date
  cliente: string;
  bruto: number;
  neto: number;
  descuento: number;
  pct: number;
  itemsCount: number;
  itemsDetail: Array<{ name: string; price: number; quantity: number; subtotal: number }>;
  metodoPago: string;
  saleType: string;
}

function getProductName(): string {
  // Para futuro: si tenemos nombres mapeados
  return "Producto";
}

export async function GET(request: NextRequest) {
  const token = getSessionFromRequest(request);
  if (!token) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const session = await verifySession(token);
  if (!session) return NextResponse.json({ error: "Sesion expirada" }, { status: 401 });

  try {
    const url = new URL(request.url);
    const sucursalErp = url.searchParams.get("sucursal") || "palermo";
    const fudoId = SUC_ERP_TO_FUDO[sucursalErp];
    const sucConf = getSucursal(fudoId);
    if (!sucConf) return NextResponse.json({ error: "Sucursal inválida" }, { status: 400 });

    // Período: por defecto últimos 90 días (ajustable con from/to)
    const today = new Date();
    const defaultFrom = new Date();
    defaultFrom.setDate(today.getDate() - 90);
    const fromStr = url.searchParams.get("from") || format(defaultFrom, "yyyy-MM-dd");
    const toStr = url.searchParams.get("to") || format(today, "yyyy-MM-dd");

    const sales: ParsedSale[] = await getSales(sucConf, fromStr, toStr);

    // Filtrar solo sales con descuento (gross > net)
    const conDescuento: DescuentoRow[] = [];
    for (const sale of sales) {
      if (sale.saleState === "CANCELED") continue;
      const items = (sale.items || []).filter((it) => !it.canceled);
      const gross = items.reduce((s, it) => s + (it.price || 0) * (it.quantity || 0), 0);
      const net = sale.total || 0;
      const descuento = gross - net;
      // Solo facturas con descuento real (> 0.5 para evitar redondeos)
      if (descuento <= 0.5) continue;
      if (gross === 0) continue;

      const pct = (descuento / gross) * 100;
      const fecha = sale.closedAt || sale.createdAt;

      const metodoPago = sale.payments
        .filter((p) => !p.canceled)
        .map((p) => p.methodName)
        .join(", ");

      conDescuento.push({
        saleId: sale.id,
        fecha,
        cliente: "", // Fudo no expone customer name en attributes parseados, podríamos mejorar
        bruto: gross,
        neto: net,
        descuento,
        pct,
        itemsCount: items.length,
        itemsDetail: items.slice(0, 30).map((it) => ({
          name: getProductName(),
          price: it.price || 0,
          quantity: it.quantity || 0,
          subtotal: (it.price || 0) * (it.quantity || 0),
        })),
        metodoPago,
        saleType: sale.saleType || "",
      });
    }

    conDescuento.sort((a, b) => b.descuento - a.descuento);

    // Aggregates
    const totalDescuentos = conDescuento.reduce((s, r) => s + r.descuento, 0);
    const totalBruto = conDescuento.reduce((s, r) => s + r.bruto, 0);
    const totalNeto = conDescuento.reduce((s, r) => s + r.neto, 0);

    // Por mes
    const byMonth: Record<string, { count: number; total: number }> = {};
    for (const r of conDescuento) {
      const monthKey = r.fecha.substring(0, 7); // YYYY-MM
      if (!byMonth[monthKey]) byMonth[monthKey] = { count: 0, total: 0 };
      byMonth[monthKey].count += 1;
      byMonth[monthKey].total += r.descuento;
    }

    // Buckets por rango de %
    const byPctBucket = {
      "0-10%": { count: 0, total: 0 },
      "10-20%": { count: 0, total: 0 },
      "20-30%": { count: 0, total: 0 },
      "30-50%": { count: 0, total: 0 },
      "50%+": { count: 0, total: 0 },
    };
    for (const r of conDescuento) {
      const bucket = r.pct < 10 ? "0-10%" :
                     r.pct < 20 ? "10-20%" :
                     r.pct < 30 ? "20-30%" :
                     r.pct < 50 ? "30-50%" : "50%+";
      byPctBucket[bucket].count += 1;
      byPctBucket[bucket].total += r.descuento;
    }

    // Por método de pago (cuál tiene más descuentos)
    const byMetodo: Record<string, { count: number; total: number }> = {};
    for (const r of conDescuento) {
      const m = r.metodoPago || "(sin método)";
      if (!byMetodo[m]) byMetodo[m] = { count: 0, total: 0 };
      byMetodo[m].count += 1;
      byMetodo[m].total += r.descuento;
    }
    const topMetodos = Object.entries(byMetodo)
      .sort(([, a], [, b]) => b.total - a.total)
      .map(([metodo, d]) => ({ metodo, ...d }));

    return NextResponse.json({
      sucursal: sucursalErp,
      from: fromStr,
      to: toStr,
      ventas: conDescuento,
      total: conDescuento.length,
      totalDescuentos,
      totalBruto,
      totalNeto,
      pctPromedio: totalBruto > 0 ? (totalDescuentos / totalBruto) * 100 : 0,
      ventasTotal: sales.length,
      pctConDescuento: sales.length > 0 ? (conDescuento.length / sales.length) * 100 : 0,
      byMonth,
      byPctBucket,
      topMetodos,
    });
  } catch (e) {
    console.error("ERP descuentos error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error interno" },
      { status: 500 }
    );
  }
}
