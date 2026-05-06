import { headers } from "next/headers";
import { requirePermission } from "@/lib/admin-permissions";

// Mapping de path → permiso requerido
const PATH_PERMS: Array<{ prefix: string; perm: string | "any" | "_users" }> = [
  { prefix: "/administracion/pnl", perm: "pnl" },
  { prefix: "/administracion/egresos", perm: "egresos" },
  { prefix: "/administracion/proveedores", perm: "proveedores" },
  { prefix: "/administracion/caja", perm: "caja" },
  { prefix: "/administracion/descuentos", perm: "descuentos" },
  { prefix: "/administracion/alertas", perm: "alertas" },
  { prefix: "/administracion/facturas", perm: "facturas" },
  { prefix: "/administracion/usuarios", perm: "_users" },
  { prefix: "/administracion", perm: "any" }, // index — cualquier permiso
];

function findPerm(pathname: string): string | "any" | "_users" {
  for (const { prefix, perm } of PATH_PERMS) {
    if (pathname === prefix || pathname.startsWith(prefix + "/")) return perm;
  }
  return "any";
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const h = await headers();
  const pathname = h.get("x-pathname") || "/administracion";
  const required = findPerm(pathname);
  await requirePermission(required);
  return <>{children}</>;
}
