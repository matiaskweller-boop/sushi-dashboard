import { NextRequest, NextResponse } from "next/server";
import { requirePermissionApi } from "@/lib/admin-permissions";
import { appendFactura, generateId, FacturaQueue } from "@/lib/facturas-queue";

export const runtime = "nodejs";

/**
 * POST /api/erp/facturas/submit
 * Carga una factura a la cola como "pendiente" de aprobación.
 * Cualquier user con permiso "facturas" puede submitear.
 */
export async function POST(request: NextRequest) {
  const auth = await requirePermissionApi(request, "facturas");
  if (!auth.ok) return auth.response;
  const user = auth.user;

  try {
    const body = (await request.json()) as Partial<FacturaQueue>;

    if (!body.sucursal) return NextResponse.json({ error: "Sucursal requerida" }, { status: 400 });
    if (!body.year) return NextResponse.json({ error: "Año requerido" }, { status: 400 });
    if (!body.proveedor) return NextResponse.json({ error: "Proveedor requerido" }, { status: 400 });
    if (!body.total || body.total <= 0) return NextResponse.json({ error: "Total debe ser > 0" }, { status: 400 });

    const id = generateId();
    const now = new Date().toISOString();

    const factura: Partial<FacturaQueue> & { id: string } = {
      id,
      submittedAt: now,
      submittedBy: user.email,
      sucursal: body.sucursal,
      year: body.year,
      tipoComprobante: body.tipoComprobante || "",
      nroComprobante: body.nroComprobante || "",
      proveedor: body.proveedor,
      razonSocial: body.razonSocial || "",
      cuit: body.cuit || "",
      fechaIngreso: body.fechaIngreso || now.substring(0, 10),
      fechaFC: body.fechaFC || "",
      fechaVto: body.fechaVto || "",
      fechaPago: body.fechaPago || "",
      rubro: body.rubro || "",
      insumo: body.insumo || "",
      subtotal: body.subtotal || 0,
      iva: body.iva || 0,
      otrosImpuestos: body.otrosImpuestos || 0,
      total: body.total,
      metodoPago: body.metodoPago || "Sin pagar",
      fotoUrl: body.fotoUrl || "",
      confianza: body.confianza || 0,
      notasOCR: body.notasOCR || "",
      estado: "pendiente",
      reviewedBy: "",
      reviewedAt: "",
      notasReview: "",
      items: body.items || [],
    };

    await appendFactura(factura);

    return NextResponse.json({
      ok: true,
      message: `Factura cargada en cola pendiente. Un aprobador la revisará pronto.`,
      id,
    });
  } catch (e) {
    console.error("submit factura error:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}
