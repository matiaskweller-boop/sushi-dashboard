"use client";

import Link from "next/link";

interface ModuleCard {
  icon: string;
  title: string;
  desc: string;
  href: string;
  status: "activo" | "pronto";
  group: "ERP" | "Productos" | "Carta";
}

const MODULES: ModuleCard[] = [
  // ERP — gestión administrativa
  {
    icon: "💰",
    title: "Egresos",
    desc: "Facturas y gastos por sucursal con filtros por rubro, proveedor y fecha",
    href: "/administracion/egresos",
    status: "activo",
    group: "ERP",
  },
  {
    icon: "🏢",
    title: "Proveedores",
    desc: "Master de proveedores con deuda al día, CBUs y plazos de pago",
    href: "/administracion/proveedores",
    status: "activo",
    group: "ERP",
  },
  {
    icon: "💵",
    title: "Caja diaria",
    desc: "Ingresos y egresos diarios por método de pago",
    href: "/administracion/caja",
    status: "activo",
    group: "ERP",
  },
  {
    icon: "💸",
    title: "Descuentos",
    desc: "Detalle de cada venta con descuento (socios, promos, ajustes manuales)",
    href: "/administracion/descuentos",
    status: "activo",
    group: "ERP",
  },
  {
    icon: "🔁",
    title: "Deuda entre locales",
    desc: "Movimientos y deudas netas entre Palermo, Belgrano y Madero",
    href: "/administracion/deuda-locales",
    status: "activo",
    group: "ERP",
  },
  {
    icon: "🔔",
    title: "Alertas",
    desc: "Vencimientos, facturas sin pagar, deudas vencidas",
    href: "/administracion/alertas",
    status: "activo",
    group: "ERP",
  },
  {
    icon: "📸",
    title: "Carga de facturas",
    desc: "Subís foto, Gemini lee los datos y se cargan automáticamente",
    href: "/administracion/facturas",
    status: "activo",
    group: "ERP",
  },
  // Productos — operaciones de producto/stock
  {
    icon: "📊",
    title: "Consumo",
    desc: "Consumo mensual por producto y categoría",
    href: "/consumo",
    status: "activo",
    group: "Productos",
  },
  {
    icon: "📦",
    title: "Stock",
    desc: "Visualización del stock activo por sucursal (read-only)",
    href: "/stock",
    status: "activo",
    group: "Productos",
  },
  // ERP — gestión de usuarios (solo owner ve la card en realidad, pero la mostramos siempre y el layout protege)
  {
    icon: "👥",
    title: "Usuarios y permisos",
    desc: "Gestionar quién accede a cada sección (solo owner)",
    href: "/administracion/usuarios",
    status: "activo",
    group: "ERP",
  },
  // Carta — diseño y referencias
  {
    icon: "🍣",
    title: "Menú",
    desc: "Carta interna de Masunori con precios y descripciones",
    href: "/menu",
    status: "activo",
    group: "Carta",
  },
  {
    icon: "🏯",
    title: "Competencia",
    desc: "Cartas y precios de restaurantes competidores",
    href: "/competencia",
    status: "activo",
    group: "Carta",
  },
];

const GROUPS: Array<{ id: "ERP" | "Productos" | "Carta"; title: string; desc: string }> = [
  { id: "ERP", title: "ERP", desc: "Gestión administrativa, finanzas y proveedores" },
  { id: "Productos", title: "Productos", desc: "Stock y consumo (lectura desde Fudo)" },
  { id: "Carta", title: "Carta", desc: "Menú interno y análisis de competencia" },
];

export default function AdministracionPage() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-navy mb-2">Administración</h1>
        <p className="text-gray-500">
          ERP + Productos + Carta · Lectura de planillas y carga de datos nuevos
        </p>
        <p className="text-xs text-gray-400 mt-1">
          P&amp;L se accede directamente desde la barra superior
        </p>
      </div>

      {GROUPS.map((group) => {
        const items = MODULES.filter((m) => m.group === group.id);
        if (items.length === 0) return null;
        return (
          <div key={group.id} className="mb-8">
            <div className="mb-3">
              <h2 className="text-sm font-semibold text-navy uppercase tracking-wide">{group.title}</h2>
              <p className="text-xs text-gray-400">{group.desc}</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {items.map((m) => {
                const isActive = m.status === "activo";
                const content = (
                  <div
                    className={`bg-white border rounded-xl p-5 transition-all h-full ${
                      isActive
                        ? "border-gray-200 hover:border-blue-accent hover:shadow-md cursor-pointer"
                        : "border-gray-100 opacity-60"
                    }`}
                  >
                    <div className="text-2xl mb-2">{m.icon}</div>
                    <h3 className="font-semibold text-navy mb-1">{m.title}</h3>
                    <p className="text-sm text-gray-500 mb-3">{m.desc}</p>
                    {isActive ? (
                      <div className="inline-block px-2 py-0.5 bg-emerald-50 text-emerald-600 text-xs rounded-full font-medium">
                        Activo
                      </div>
                    ) : (
                      <div className="inline-block px-2 py-0.5 bg-amber-50 text-amber-600 text-xs rounded-full font-medium">
                        Próximamente
                      </div>
                    )}
                  </div>
                );
                return isActive ? (
                  <Link key={m.title} href={m.href}>
                    {content}
                  </Link>
                ) : (
                  <div key={m.title}>{content}</div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
