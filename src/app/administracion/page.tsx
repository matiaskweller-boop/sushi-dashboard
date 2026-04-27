"use client";

import Link from "next/link";

const MODULES = [
  {
    icon: "💰",
    title: "Egresos",
    desc: "Facturas y gastos por sucursal con filtros por rubro, proveedor y fecha",
    href: "/administracion/egresos",
    status: "activo",
  },
  {
    icon: "📊",
    title: "P&L por sucursal",
    desc: "Estado de resultados de cada sucursal (Palermo, Belgrano, Madero)",
    href: "/administracion/pnl",
    status: "activo",
  },
  {
    icon: "🏢",
    title: "Proveedores",
    desc: "Master de proveedores con deuda al día, CBUs y plazos de pago",
    href: "/administracion/proveedores",
    status: "activo",
  },
  {
    icon: "💵",
    title: "Caja diaria",
    desc: "Ingresos y egresos diarios por método de pago",
    href: "/administracion/caja",
    status: "activo",
  },
  {
    icon: "📸",
    title: "Carga de facturas",
    desc: "Subís foto, Gemini lee los datos y se cargan automáticamente",
    href: "/administracion/facturas",
    status: "pronto",
  },
  {
    icon: "🔔",
    title: "Alertas",
    desc: "Vencimientos, facturas sin pagar, deudas vencidas",
    href: "/administracion/alertas",
    status: "pronto",
  },
];

export default function AdministracionPage() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-navy mb-2">Administración</h1>
        <p className="text-gray-500">
          ERP interno de Masunori · Lectura de planillas Google Sheets + carga de datos nuevos
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {MODULES.map((m) => {
          const isActive = m.status === "activo";
          const content = (
            <div
              className={`bg-white border rounded-xl p-6 transition-all h-full ${
                isActive
                  ? "border-gray-200 hover:border-blue-accent hover:shadow-md cursor-pointer"
                  : "border-gray-100 opacity-60"
              }`}
            >
              <div className="text-3xl mb-3">{m.icon}</div>
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
}
