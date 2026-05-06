import { NextRequest, NextResponse } from "next/server";
import { requirePermissionApi, userHasPermission } from "@/lib/admin-permissions";
import { listFacturas, EstadoFactura } from "@/lib/facturas-queue";

export const runtime = "nodejs";

/**
 * GET /api/erp/facturas?estado=pendiente|aprobada|rechazada&scope=mias|todas
 *
 * - scope=mias: solo facturas subidas por el user actual
 * - scope=todas: todas las facturas (requiere facturas_aprobar o *)
 *
 * Default: si tiene facturas_aprobar => todas, si no => mias.
 */
export async function GET(request: NextRequest) {
  const auth = await requirePermissionApi(request, "facturas");
  if (!auth.ok) return auth.response;
  const user = auth.user;

  try {
    const url = new URL(request.url);
    const estado = url.searchParams.get("estado") as EstadoFactura | null;
    const scopeParam = url.searchParams.get("scope");

    const isApprover = userHasPermission(user, "facturas_aprobar") || userHasPermission(user, "*");
    const scope = scopeParam || (isApprover ? "todas" : "mias");

    if (scope === "todas" && !isApprover) {
      return NextResponse.json({ error: "Sin permiso para ver todas las facturas" }, { status: 403 });
    }

    const filter: { estado?: EstadoFactura; submittedBy?: string } = {};
    if (estado) filter.estado = estado;
    if (scope === "mias") filter.submittedBy = user.email;

    const facturas = await listFacturas(filter);

    // Stats globales (sin filtro)
    const all = await listFacturas();
    const stats = {
      pendiente: all.filter((f) => f.estado === "pendiente").length,
      aprobada: all.filter((f) => f.estado === "aprobada").length,
      rechazada: all.filter((f) => f.estado === "rechazada").length,
      misPendientes: all.filter((f) => f.estado === "pendiente" && f.submittedBy.toLowerCase() === user.email.toLowerCase()).length,
    };

    return NextResponse.json({
      facturas,
      currentUser: user,
      isApprover,
      stats,
    });
  } catch (e) {
    console.error("facturas GET error:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}
