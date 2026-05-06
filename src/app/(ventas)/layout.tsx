import { requirePermission } from "@/lib/admin-permissions";

/**
 * Layout para la sección "Ventas" (Dashboard, KPIs, Histórico).
 * Requiere permiso "ventas". Si no, redirige al landing /administracion
 * (que es accesible para cualquier user logueado).
 */
export default async function VentasLayout({ children }: { children: React.ReactNode }) {
  await requirePermission("ventas");
  return <>{children}</>;
}
