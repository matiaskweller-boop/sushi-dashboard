import { NextRequest, NextResponse } from "next/server";
import { requirePermissionApi } from "@/lib/admin-permissions";
import { getAllMasterRubros, createRubroIfMissing } from "@/lib/master-rubros";

export const runtime = "nodejs";

/**
 * GET /api/erp/rubros
 *
 * Lista todos los rubros del MASTER RUBROS (cache 5 min).
 * Disponible para usuarios con permiso `facturas` o `egresos`.
 */
export async function GET(request: NextRequest) {
  const auth = await requirePermissionApi(request, "facturas");
  if (!auth.ok) {
    const alt = await requirePermissionApi(request, "egresos");
    if (!alt.ok) return alt.response;
  }
  try {
    const list = await getAllMasterRubros();
    return NextResponse.json({
      rubros: list,
      total: list.length,
      activos: list.filter((r) => r.activo).length,
    });
  } catch (e) {
    console.error("rubros GET error:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}

/**
 * POST /api/erp/rubros
 *
 * Crea un rubro nuevo si no existe. Match case-insensitive por nombre.
 * Body: { rubro: string, categoria?: string }
 */
export async function POST(request: NextRequest) {
  const auth = await requirePermissionApi(request, "facturas");
  if (!auth.ok) {
    const alt = await requirePermissionApi(request, "egresos");
    if (!alt.ok) return alt.response;
  }
  try {
    const body = await request.json();
    if (!body.rubro || typeof body.rubro !== "string" || body.rubro.trim().length < 2) {
      return NextResponse.json({ error: "rubro es requerido (string, min 2 caracteres)" }, { status: 400 });
    }
    const userEmail = auth.ok ? auth.user.email : "unknown";
    const result = await createRubroIfMissing(
      body.rubro.trim(),
      userEmail,
      body.categoria || "Otros"
    );
    return NextResponse.json(result);
  } catch (e) {
    console.error("rubros POST error:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}
