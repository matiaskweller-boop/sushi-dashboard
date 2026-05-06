import { NextRequest, NextResponse } from "next/server";
import { requirePermissionApi, userHasPermission } from "@/lib/admin-permissions";
import { getFactura, updateFactura, FacturaQueue } from "@/lib/facturas-queue";

export const runtime = "nodejs";

/**
 * PATCH /api/erp/facturas/update
 * Body: { id, ...edits }
 *
 * Cualquier user con `facturas` puede editar SUS PROPIAS facturas mientras
 * estén pendientes. Aprobadores pueden editar cualquier factura pendiente.
 * No se permite editar facturas ya aprobadas.
 */
export async function PATCH(request: NextRequest) {
  const auth = await requirePermissionApi(request, "facturas");
  if (!auth.ok) return auth.response;
  const user = auth.user;

  try {
    const body = await request.json() as Partial<FacturaQueue> & { id: string };
    if (!body.id) return NextResponse.json({ error: "Falta id" }, { status: 400 });

    const factura = await getFactura(body.id);
    if (!factura) return NextResponse.json({ error: "Factura no encontrada" }, { status: 404 });

    if (factura.estado === "aprobada") {
      return NextResponse.json({ error: "No se puede editar una factura ya aprobada" }, { status: 400 });
    }

    const isApprover = userHasPermission(user, "facturas_aprobar") || userHasPermission(user, "*");
    const isOwner = factura.submittedBy.toLowerCase() === user.email.toLowerCase();

    if (!isApprover && !isOwner) {
      return NextResponse.json({ error: "Sin permiso para editar esta factura" }, { status: 403 });
    }

    // No permitir cambiar id, submittedAt, submittedBy, estado (eso lo cambia approve/reject)
    const allowedEdits: Partial<FacturaQueue> = {};
    const editableFields: Array<keyof FacturaQueue> = [
      "sucursal", "year", "tipoComprobante", "nroComprobante",
      "proveedor", "razonSocial", "cuit",
      "fechaIngreso", "fechaFC", "fechaVto", "fechaPago",
      "rubro", "insumo",
      "subtotal", "iva", "otrosImpuestos", "total",
      "metodoPago", "items",
    ];
    for (const field of editableFields) {
      if (body[field] !== undefined) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (allowedEdits as any)[field] = body[field];
      }
    }

    const updated = await updateFactura(body.id, allowedEdits);
    return NextResponse.json({ ok: true, factura: updated });
  } catch (e) {
    console.error("update factura error:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}
