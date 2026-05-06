import { NextRequest, NextResponse } from "next/server";
import { requirePermissionApi, userHasPermission } from "@/lib/admin-permissions";
import { getFactura, updateFactura } from "@/lib/facturas-queue";

export const runtime = "nodejs";

/**
 * POST /api/erp/facturas/reject
 * Body: { id, motivo: string }
 */
export async function POST(request: NextRequest) {
  const auth = await requirePermissionApi(request, "facturas");
  if (!auth.ok) return auth.response;
  const user = auth.user;

  if (!userHasPermission(user, "facturas_aprobar") && !userHasPermission(user, "*")) {
    return NextResponse.json({ error: "Sin permiso para rechazar facturas" }, { status: 403 });
  }

  try {
    const body = await request.json() as { id: string; motivo?: string };
    if (!body.id) return NextResponse.json({ error: "Falta id" }, { status: 400 });

    const factura = await getFactura(body.id);
    if (!factura) return NextResponse.json({ error: "Factura no encontrada" }, { status: 404 });

    const updated = await updateFactura(body.id, {
      estado: "rechazada",
      reviewedBy: user.email,
      reviewedAt: new Date().toISOString(),
      notasReview: body.motivo || "",
    });

    return NextResponse.json({ ok: true, factura: updated });
  } catch (e) {
    console.error("reject factura error:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}
