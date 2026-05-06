import { NextRequest, NextResponse } from "next/server";
import { requirePermissionApi, userHasPermission } from "@/lib/admin-permissions";
import { getFactura, updateFactura, FacturaQueue } from "@/lib/facturas-queue";
import { appendToSheet } from "@/lib/google";

export const runtime = "nodejs";

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

function toSheetDate(iso: string): string {
  if (!iso) return "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function exportToEgresos(f: FacturaQueue): Promise<void> {
  const sheetId = SHEET_IDS[f.year]?.[f.sucursal];
  if (!sheetId) {
    throw new Error(`Sheet no configurado para ${f.sucursal} ${f.year}`);
  }
  // Estructura de la tab EGRESOS:
  // [num] | Fecha ingreso | Fecha FC | Fecha Pago | PROVEEDOR | Tipo | Nro | Rubro | INSUMOS | Total | unidad | Precio Un | Metodo Pago | Verif | Vto.
  const totalStr = "$ " + f.total.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const row = [
    "",                                  // A: nro fila (auto)
    toSheetDate(f.fechaIngreso),         // B: Fecha ingreso
    toSheetDate(f.fechaFC),              // C: Fecha FC
    toSheetDate(f.fechaPago),            // D: Fecha Pago
    f.proveedor,                         // E: PROVEEDOR
    f.tipoComprobante,                   // F: Tipo comprobante
    f.nroComprobante,                    // G: Nro
    f.rubro,                             // H: Rubro
    f.insumo,                            // I: INSUMOS
    totalStr,                            // J: Total
    "1,00",                              // K: unidad de medida
    totalStr,                            // L: Precio Un
    f.metodoPago || "Sin pagar",         // M: Metodo de Pago
    "ok",                                // N: Verif
    toSheetDate(f.fechaVto),             // O: Vto.
  ];
  return appendToSheet(sheetId, "EGRESOS!A:O", [row]);
}

/**
 * POST /api/erp/facturas/approve
 * Body: { id, edits?: Partial<FacturaQueue>, notas?: string }
 *
 * - Aplica edits opcionales (revisión final del approver)
 * - Marca estado = aprobada
 * - Exporta a EGRESOS de la sucursal correspondiente
 */
export async function POST(request: NextRequest) {
  const auth = await requirePermissionApi(request, "facturas");
  if (!auth.ok) return auth.response;
  const user = auth.user;

  // Solo aprobadores
  if (!userHasPermission(user, "facturas_aprobar") && !userHasPermission(user, "*")) {
    return NextResponse.json({ error: "Sin permiso para aprobar facturas" }, { status: 403 });
  }

  try {
    const body = await request.json() as { id: string; edits?: Partial<FacturaQueue>; notas?: string };
    if (!body.id) return NextResponse.json({ error: "Falta id" }, { status: 400 });

    const factura = await getFactura(body.id);
    if (!factura) return NextResponse.json({ error: "Factura no encontrada" }, { status: 404 });
    if (factura.estado === "aprobada") {
      return NextResponse.json({ error: "Factura ya aprobada" }, { status: 400 });
    }

    // Aplicar edits del aprobador
    const merged: FacturaQueue = {
      ...factura,
      ...(body.edits || {}),
    };

    // Validar lo crítico
    if (!merged.proveedor) return NextResponse.json({ error: "Proveedor requerido" }, { status: 400 });
    if (!merged.total || merged.total <= 0) return NextResponse.json({ error: "Total debe ser > 0" }, { status: 400 });
    if (!merged.sucursal) return NextResponse.json({ error: "Sucursal requerida" }, { status: 400 });
    if (!merged.year) return NextResponse.json({ error: "Año requerido" }, { status: 400 });

    // Exportar a EGRESOS
    await exportToEgresos(merged);

    // Marcar como aprobada en cola
    const updated = await updateFactura(body.id, {
      ...body.edits,
      estado: "aprobada",
      reviewedBy: user.email,
      reviewedAt: new Date().toISOString(),
      notasReview: body.notas || "",
    });

    return NextResponse.json({
      ok: true,
      message: `Factura aprobada y cargada en EGRESOS de ${merged.sucursal} ${merged.year}`,
      factura: updated,
    });
  } catch (e) {
    console.error("approve factura error:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}
