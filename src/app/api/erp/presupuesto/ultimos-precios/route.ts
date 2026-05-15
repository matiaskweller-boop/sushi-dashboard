import { NextRequest, NextResponse } from "next/server";
import { requirePermissionApi } from "@/lib/admin-permissions";
import { getUltimosPrecios } from "@/lib/ultimos-precios";

export const runtime = "nodejs";

/**
 * GET /api/erp/presupuesto/ultimos-precios?year=2026
 *
 * Devuelve un mapa de insumo (normalizado) → última compra de las 3 sucursales.
 * Útil para mostrar en el panel de presupuesto el último precio pagado
 * a un proveedor por un insumo determinado, como referencia para validar
 * los costos del COSTEO_DASHBOARD.
 *
 * Cache 15 min in-memory.
 */
export async function GET(request: NextRequest) {
  const auth = await requirePermissionApi(request, "presupuesto");
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(request.url);
    const year = url.searchParams.get("year") || "2026";
    const map = await getUltimosPrecios(year);
    const list = Object.values(map).sort((a, b) => (b.fechaISO || "").localeCompare(a.fechaISO || ""));
    return NextResponse.json({
      year,
      total: list.length,
      ultimosPrecios: list,
    });
  } catch (e) {
    console.error("ultimos-precios error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 500 }
    );
  }
}
