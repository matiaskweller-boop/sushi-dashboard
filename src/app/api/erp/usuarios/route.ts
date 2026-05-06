import { NextRequest, NextResponse } from "next/server";
import {
  requirePermissionApi,
  getAllUsers,
  upsertUser,
  deleteUser,
  ALL_PERMISSIONS,
} from "@/lib/admin-permissions";

export const runtime = "nodejs";

/**
 * GET — Lista todos los usuarios. Solo el owner puede leer la lista.
 */
export async function GET(request: NextRequest) {
  const auth = await requirePermissionApi(request, "_users");
  if (!auth.ok) return auth.response;

  try {
    const users = await getAllUsers();
    return NextResponse.json({ users, currentUser: auth.user, allPermissions: ALL_PERMISSIONS });
  } catch (e) {
    console.error("usuarios GET error:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}

/**
 * POST — Crear o actualizar un usuario. Solo el owner.
 * Body: { email, name, perms: string[] (o ["*"]), active: boolean }
 */
export async function POST(request: NextRequest) {
  const auth = await requirePermissionApi(request, "_users");
  if (!auth.ok) return auth.response;

  try {
    const body = (await request.json()) as {
      email: string;
      name: string;
      perms: string[];
      active: boolean;
    };

    const email = String(body.email || "").trim().toLowerCase();
    if (!email) return NextResponse.json({ error: "Email requerido" }, { status: 400 });
    if (!email.includes("@")) return NextResponse.json({ error: "Email inválido" }, { status: 400 });

    const validPerms = body.perms.includes("*")
      ? ["*"]
      : body.perms.filter((p) => (ALL_PERMISSIONS as readonly string[]).includes(p));

    await upsertUser({
      email,
      name: String(body.name || "").trim(),
      perms: validPerms,
      active: !!body.active,
    });

    const users = await getAllUsers();
    return NextResponse.json({ ok: true, users });
  } catch (e) {
    console.error("usuarios POST error:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}

/**
 * DELETE — Eliminar un usuario. Solo el owner. No permite eliminar al owner.
 */
export async function DELETE(request: NextRequest) {
  const auth = await requirePermissionApi(request, "_users");
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(request.url);
    const email = url.searchParams.get("email");
    if (!email) return NextResponse.json({ error: "Falta email" }, { status: 400 });

    await deleteUser(email);
    const users = await getAllUsers();
    return NextResponse.json({ ok: true, users });
  } catch (e) {
    console.error("usuarios DELETE error:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}
