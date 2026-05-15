import { NextRequest, NextResponse } from "next/server";
import { requirePermissionApi } from "@/lib/admin-permissions";
import { loadCosteo } from "@/lib/costeo";

export const runtime = "nodejs";

/**
 * GET /api/erp/presupuesto/costos
 *
 * Devuelve la lista de platos costeados desde MASUNORI_COSTEO_DASHBOARD.xlsx
 * (tab PLATOS Y PRECIOS). Cache 10 min in-memory.
 *
 * Esto se usa en la página de presupuesto para hacer match por nombre con
 * los items del menú y pre-llenar el costo automaticamente.
 */
export async function GET(request: NextRequest) {
  const auth = await requirePermissionApi(request, "presupuesto");
  if (!auth.ok) return auth.response;

  try {
    const data = await loadCosteo();
    return NextResponse.json({
      platos: data.platos,
      totalPlatos: data.platos.length,
      ingredientes: data.ingredientes,
      totalIngredientes: data.ingredientes.length,
    });
  } catch (e) {
    console.error("costeo error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error interno" },
      { status: 500 }
    );
  }
}
