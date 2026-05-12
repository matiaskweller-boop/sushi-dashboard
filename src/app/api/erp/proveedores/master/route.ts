import { NextRequest, NextResponse } from "next/server";
import { requirePermissionApi } from "@/lib/admin-permissions";
import {
  getAllMasterProveedores,
  upsertMasterProveedor,
  deleteMasterProveedor,
  MasterProveedor,
} from "@/lib/master-proveedores";

export const runtime = "nodejs";

/**
 * GET /api/erp/proveedores/master
 *
 * Devuelve TODOS los proveedores del MASTER PROVEEDORES (tab del
 * workbook MASUNORI_ERP_CONFIG). Schema completo con CUIT, mail,
 * contacto, banco, alias, etc.
 *
 * Usado por: picker en /administracion/facturas + panel proveedores.
 */
export async function GET(request: NextRequest) {
  // `facturas` permission cubre el caso del picker en facturas.
  // Si el user llega desde panel proveedores tambien lo deja pasar via proveedores.
  const auth = await requirePermissionApi(request, "facturas");
  if (!auth.ok) {
    const authAlt = await requirePermissionApi(request, "proveedores");
    if (!authAlt.ok) return authAlt.response;
  }

  try {
    const all = await getAllMasterProveedores();
    return NextResponse.json({ proveedores: all, total: all.length });
  } catch (e) {
    console.error("master proveedores GET:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}

/**
 * POST /api/erp/proveedores/master
 *
 * Crea o actualiza un proveedor en el MASTER.
 * Match por id (si se manda) o por nombreFantasia (case-insensitive).
 */
export async function POST(request: NextRequest) {
  const auth = await requirePermissionApi(request, "proveedores");
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    if (!body.nombreFantasia || body.nombreFantasia.trim().length < 2) {
      return NextResponse.json({ error: "nombreFantasia es requerido" }, { status: 400 });
    }
    const result = await upsertMasterProveedor(body as Partial<MasterProveedor> & { nombreFantasia: string }, auth.user.email);
    return NextResponse.json(result);
  } catch (e) {
    console.error("master proveedores POST:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}

/**
 * DELETE /api/erp/proveedores/master?id=PROV-XXX
 *
 * Borra (limpia la fila) del MASTER.
 */
export async function DELETE(request: NextRequest) {
  const auth = await requirePermissionApi(request, "proveedores");
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });
    const ok = await deleteMasterProveedor(id);
    if (!ok) return NextResponse.json({ error: `Proveedor ${id} no encontrado` }, { status: 404 });
    return NextResponse.json({ success: true, deleted: id });
  } catch (e) {
    console.error("master proveedores DELETE:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}
