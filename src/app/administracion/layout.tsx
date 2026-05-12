import { headers } from "next/headers";
import { requirePermission } from "@/lib/admin-permissions";

// Mapping de path → permiso requerido
const PATH_PERMS: Array<{ prefix: string; perm: string | "any" | "_users" | "logged_in" }> = [
  { prefix: "/administracion/pnl", perm: "pnl" },
  { prefix: "/administracion/egresos", perm: "egresos" },
  { prefix: "/administracion/proveedores", perm: "proveedores" },
  { prefix: "/administracion/caja", perm: "caja" },
  { prefix: "/administracion/descuentos", perm: "descuentos" },
  { prefix: "/administracion/alertas", perm: "alertas" },
  { prefix: "/administracion/facturas", perm: "facturas" },
  { prefix: "/administracion/usuarios", perm: "_users" },
  { prefix: "/administracion/deuda-locales", perm: "egresos" },
  { prefix: "/administracion/efectivo-y-mas", perm: "efectivo" },
  // /administracion landing — accesible para cualquier user activo logueado.
  // Las cards filtrarán client-side qué puede ver.
  { prefix: "/administracion", perm: "logged_in" },
];

function findPerm(pathname: string): string | "any" | "_users" | "logged_in" {
  for (const { prefix, perm } of PATH_PERMS) {
    if (pathname === prefix || pathname.startsWith(prefix + "/")) return perm;
  }
  return "logged_in";
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const h = await headers();
  const pathname = h.get("x-pathname") || "/administracion";
  const required = findPerm(pathname);
  await requirePermission(required);
  return <>{children}</>;
}
