"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";

interface AlertItem {
  tipo: "vencido" | "porVencer" | "altoMonto" | "sinDatos";
  prioridad: "alta" | "media" | "baja";
  sucursal: string;
  proveedor: string;
  rubro: string;
  total: number;
  fechaFC: string | null;
  fechaVto: string | null;
  diasVencido: number | null;
  diasParaVencer: number | null;
  metodoPago: string;
  nroComprobante: string;
}

interface ApiResponse {
  year: string;
  alertas: AlertItem[];
  vencidas: AlertItem[];
  porVencer: AlertItem[];
  totalVencido: number;
  totalPorVencer: number;
  porSucursal: Record<string, { vencidas: number; porVencer: number; totalVencido: number; totalPorVencer: number }>;
}

const SUC_NAMES: Record<string, string> = {
  palermo: "Palermo",
  belgrano: "Belgrano",
  madero: "Madero",
};
const SUC_COLORS: Record<string, string> = {
  palermo: "#2E6DA4",
  belgrano: "#10B981",
  madero: "#8B5CF6",
};

function fmt(n: number): string {
  return "$" + Math.round(n).toLocaleString("es-AR");
}

export default function AlertasPage() {
  const [year] = useState<"2026">("2026");
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"vencidas" | "porVencer" | "todas">("vencidas");
  const [sucursalFilter, setSucursalFilter] = useState<string>("");

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/erp/alertas?year=${year}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setData(d);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [year]);

  const filtered = useMemo(() => {
    if (!data) return [];
    let items: AlertItem[] = tab === "vencidas" ? data.vencidas : tab === "porVencer" ? data.porVencer : data.alertas;
    if (sucursalFilter) items = items.filter((a) => a.sucursal === sucursalFilter);
    return items;
  }, [data, tab, sucursalFilter]);

  const filteredTotal = useMemo(() => filtered.reduce((s, a) => s + a.total, 0), [filtered]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="mb-4">
        <Link href="/administracion" className="text-sm text-gray-400 hover:text-blue-accent">
          ← Volver a Administración
        </Link>
        <h1 className="text-2xl font-bold text-navy mt-2">Alertas · {year}</h1>
        <p className="text-xs text-gray-400 mt-1">
          Facturas vencidas y por vencer (próximos 7 días) · todas las sucursales
        </p>
      </div>

      {loading && <div className="text-center py-20 text-gray-400">Cargando alertas...</div>}
      {error && <div className="bg-red-50 text-red-700 rounded-lg p-4 mb-4">Error: {error}</div>}

      {data && !loading && (
        <>
          {/* Totales globales */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <div className="bg-white rounded-xl border border-red-200 p-4">
              <div className="text-xs text-red-700 uppercase tracking-wide mb-1">⚠️ Vencidas</div>
              <div className="text-2xl font-bold text-red-700">{fmt(data.totalVencido)}</div>
              <div className="text-xs text-gray-500 mt-1">{data.vencidas.length} facturas</div>
            </div>
            <div className="bg-white rounded-xl border border-amber-200 p-4">
              <div className="text-xs text-amber-700 uppercase tracking-wide mb-1">⏳ Por vencer (7d)</div>
              <div className="text-2xl font-bold text-amber-700">{fmt(data.totalPorVencer)}</div>
              <div className="text-xs text-gray-500 mt-1">{data.porVencer.length} facturas</div>
            </div>
            {Object.entries(data.porSucursal).map(([suc, d]) => {
              const total = d.totalVencido + d.totalPorVencer;
              const cnt = d.vencidas + d.porVencer;
              return (
                <div key={suc} className="bg-white rounded-xl border border-gray-100 p-4">
                  <div className="text-xs uppercase tracking-wide mb-1" style={{ color: SUC_COLORS[suc] }}>{SUC_NAMES[suc]}</div>
                  <div className="text-xl font-bold text-navy">{fmt(total)}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    <span className="text-red-600">{d.vencidas}v</span>
                    {" · "}
                    <span className="text-amber-600">{d.porVencer}f</span>
                    {" "}({cnt})
                  </div>
                </div>
              );
            })}
          </div>

          {/* Tabs */}
          <div className="flex flex-wrap gap-2 mb-4 items-center">
            <div className="flex gap-1 bg-white border border-gray-200 rounded-lg p-1">
              {([
                { id: "vencidas", label: `⚠️ Vencidas (${data.vencidas.length})`, color: "bg-red-50 text-red-700" },
                { id: "porVencer", label: `⏳ Por vencer (${data.porVencer.length})`, color: "bg-amber-50 text-amber-700" },
                { id: "todas", label: `Todas (${data.alertas.length})`, color: "bg-gray-100 text-gray-700" },
              ] as const).map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                    tab === t.id ? t.color : "text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="flex gap-1 bg-white border border-gray-200 rounded-lg p-1">
              <button
                onClick={() => setSucursalFilter("")}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                  !sucursalFilter ? "bg-navy text-white" : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                Todas
              </button>
              {Object.entries(SUC_NAMES).map(([id, name]) => (
                <button
                  key={id}
                  onClick={() => setSucursalFilter(id)}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                    sucursalFilter === id ? "text-white shadow-sm" : "text-gray-600 hover:bg-gray-50"
                  }`}
                  style={sucursalFilter === id ? { backgroundColor: SUC_COLORS[id] } : {}}
                >
                  {name}
                </button>
              ))}
            </div>

            <span className="text-xs text-gray-400 ml-auto">
              {filtered.length} alertas · {fmt(filteredTotal)}
            </span>
          </div>

          {/* Tabla de alertas */}
          {filtered.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
              <div className="text-4xl mb-3">✓</div>
              <div className="text-sm text-gray-500">
                {tab === "vencidas" ? "No hay facturas vencidas" : tab === "porVencer" ? "No hay facturas por vencer próximamente" : "Sin alertas"}
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100 sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-600 uppercase">Estado</th>
                      <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-600 uppercase">Sucursal</th>
                      <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-600 uppercase">Proveedor</th>
                      <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-600 uppercase">Rubro</th>
                      <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-600 uppercase">Fecha FC</th>
                      <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-600 uppercase">Vencimiento</th>
                      <th className="text-right px-3 py-2.5 text-xs font-semibold text-gray-600 uppercase">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((a, i) => (
                      <tr key={i} className={`border-b border-gray-50 hover:bg-gray-50 ${
                        a.tipo === "vencido" ? "bg-red-50/30" : a.tipo === "porVencer" ? "bg-amber-50/20" : ""
                      }`}>
                        <td className="px-3 py-2.5">
                          {a.tipo === "vencido" ? (
                            <span className={`inline-block px-2 py-0.5 text-xs rounded-md font-medium ${
                              a.prioridad === "alta" ? "bg-red-100 text-red-700" :
                              a.prioridad === "media" ? "bg-orange-100 text-orange-700" :
                              "bg-yellow-100 text-yellow-700"
                            }`}>
                              ⚠️ +{a.diasVencido}d
                            </span>
                          ) : (
                            <span className={`inline-block px-2 py-0.5 text-xs rounded-md font-medium ${
                              a.prioridad === "alta" ? "bg-amber-100 text-amber-700" : "bg-yellow-50 text-yellow-700"
                            }`}>
                              ⏳ en {a.diasParaVencer}d
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="text-xs font-medium" style={{ color: SUC_COLORS[a.sucursal] }}>{SUC_NAMES[a.sucursal]}</span>
                        </td>
                        <td className="px-3 py-2.5 font-medium text-navy">{a.proveedor}</td>
                        <td className="px-3 py-2.5 text-gray-500 text-xs">{a.rubro || "—"}</td>
                        <td className="px-3 py-2.5 text-gray-500 text-xs whitespace-nowrap">{a.fechaFC || "—"}</td>
                        <td className="px-3 py-2.5 text-gray-700 text-xs whitespace-nowrap font-medium">{a.fechaVto || "—"}</td>
                        <td className="px-3 py-2.5 text-right font-mono font-semibold text-navy">{fmt(a.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="text-xs text-gray-400 mt-3">
            Las alertas se calculan en base a la columna Vto. de cada factura · si no hay Vto, se usa la fecha FC
          </div>
        </>
      )}
    </div>
  );
}
