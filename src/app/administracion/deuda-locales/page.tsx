"use client";

import { useState, useEffect, useMemo, Fragment } from "react";
import Link from "next/link";

type Sucursal = "palermo" | "belgrano" | "madero";

interface Movimiento {
  rownum: number;
  sucursalOrigen: Sucursal;
  sucursalContraparte: Sucursal | null;
  fecha: string;
  fechaPago: string | null;
  proveedor: string;
  rubro: string;
  insumo: string;
  total: number;
  metodoPago: string;
  estadoPago: "pagado" | "pendiente";
  tipo: "explicito" | "centralizado_match" | "envio_uber";
  notaDeteccion: string;
}

interface Centralizado {
  proveedor: string;
  fecha: string;
  total: number;
  sucursalesIncluidas: Sucursal[];
  rownums: Array<{ sucursal: Sucursal; rownum: number }>;
}

interface ApiResponse {
  year: string;
  movimientos: Movimiento[];
  matriz: Record<Sucursal, Record<Sucursal, number>>;
  saldosNetos: Array<{ deudor: Sucursal; acreedor: Sucursal; monto: number }>;
  totalSinDireccion: number;
  centralizados: Centralizado[];
  totalCentralizados: number;
  montoCentralizadosDuplicado: number;
  stats: Record<Sucursal, { totalMovimientos: number; totalMonto: number; pagados: number; pendientes: number }>;
}

const SUC_NAMES: Record<Sucursal, string> = { palermo: "Palermo", belgrano: "Belgrano", madero: "Madero" };
const SUC_COLORS: Record<Sucursal, string> = { palermo: "#2E6DA4", belgrano: "#10B981", madero: "#8B5CF6" };
const SUCURSALES: Sucursal[] = ["palermo", "belgrano", "madero"];

function fmt(n: number): string { return "$" + Math.round(n).toLocaleString("es-AR"); }
function fmtK(n: number): string {
  if (Math.abs(n) >= 1000000) return "$" + (n / 1000000).toFixed(2) + "M";
  if (Math.abs(n) >= 1000) return "$" + Math.round(n / 1000) + "k";
  return "$" + Math.round(n);
}

export default function DeudaLocalesPage() {
  const [year, setYear] = useState<"2025" | "2026">("2026");
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"resumen" | "movimientos" | "duplicados">("resumen");
  const [filterSuc, setFilterSuc] = useState<Sucursal | "">("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    setLoading(true);
    fetch(`/api/erp/deuda-locales?year=${year}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setData(d);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [year]);

  const filteredMovs = useMemo(() => {
    if (!data) return [];
    return data.movimientos.filter((m) => {
      if (filterSuc && m.sucursalOrigen !== filterSuc) return false;
      if (search) {
        const q = search.toLowerCase();
        const hay = `${m.proveedor} ${m.rubro} ${m.insumo}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [data, filterSuc, search]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="mb-4">
        <Link href="/administracion" className="text-sm text-gray-400 hover:text-blue-accent">
          ← Volver a Administración
        </Link>
        <h1 className="text-2xl font-bold text-navy mt-2">Deuda entre locales · {year}</h1>
        <p className="text-xs text-gray-400 mt-1">
          Movimientos entre Palermo, Belgrano y Madero detectados en EGRESOS por patrones explícitos
          (PAGO POR GASTO HECHO POR…, deuda con…, envío de mercadería, flete) + duplicados centralizados.
        </p>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <div className="flex gap-1 bg-white border border-gray-200 rounded-lg p-1">
          {(["2026", "2025"] as const).map((y) => (
            <button key={y} onClick={() => setYear(y)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${year === y ? "bg-navy text-white shadow-sm" : "text-gray-600 hover:bg-gray-50"}`}>
              {y}
            </button>
          ))}
        </div>
        <div className="flex gap-1 bg-white border border-gray-200 rounded-lg p-1 ml-auto">
          {([
            { id: "resumen", label: "📊 Resumen" },
            { id: "movimientos", label: "📋 Movimientos" },
            { id: "duplicados", label: "⚠️ Duplicados" },
          ] as const).map((v) => (
            <button key={v.id} onClick={() => setView(v.id as typeof view)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${view === v.id ? "bg-blue-50 text-blue-accent" : "text-gray-600 hover:bg-gray-50"}`}>
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {loading && <div className="text-center py-12 text-gray-400">Analizando los 3 sheets...</div>}
      {error && <div className="bg-red-50 text-red-700 rounded-lg p-3 text-sm">⚠️ {error}</div>}

      {data && !loading && (
        <>
          {/* ═══════════════ RESUMEN ═══════════════ */}
          {view === "resumen" && (
            <>
              {/* Saldos netos destacados */}
              <div className="bg-white rounded-xl border border-gray-100 p-5 mb-4">
                <h2 className="text-sm font-semibold text-navy uppercase tracking-wide mb-3">
                  💰 Saldos netos entre sucursales
                </h2>
                {data.saldosNetos.length === 0 ? (
                  <div className="text-sm text-gray-400 italic">No hay saldos netos detectados (todos compensados o sin movimientos).</div>
                ) : (
                  <div className="space-y-3">
                    {data.saldosNetos.map((s, i) => (
                      <div key={i} className="flex items-center gap-3 bg-gray-50 rounded-lg p-3">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500">debe</span>
                          <span
                            className="text-base font-bold px-3 py-1 rounded-md text-white"
                            style={{ backgroundColor: SUC_COLORS[s.deudor] }}
                          >
                            {SUC_NAMES[s.deudor]}
                          </span>
                          <span className="text-gray-500">→</span>
                          <span className="text-base font-bold px-3 py-1 rounded-md text-white"
                            style={{ backgroundColor: SUC_COLORS[s.acreedor] }}>
                            {SUC_NAMES[s.acreedor]}
                          </span>
                        </div>
                        <div className="ml-auto text-2xl font-bold font-mono text-red-700">
                          {fmt(s.monto)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {data.totalSinDireccion > 0 && (
                  <div className="mt-3 text-xs text-gray-500 bg-amber-50 rounded p-2">
                    + {fmt(data.totalSinDireccion)} en movimientos inter-sucursales sin contraparte específica detectada
                    (ej "uber entre locales", "envío de mercadería" sin nombre de sucursal).
                  </div>
                )}
              </div>

              {/* Matriz */}
              <div className="bg-white rounded-xl border border-gray-100 p-5 mb-4">
                <h2 className="text-sm font-semibold text-navy uppercase tracking-wide mb-3">
                  Matriz de movimientos brutos (de A → B)
                </h2>
                <p className="text-xs text-gray-500 mb-3">
                  Cada celda: lo que la sucursal de la fila registró como deuda con la sucursal de la columna.
                </p>
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Origen ↓ / Acreedor →</th>
                      {SUCURSALES.map((s) => (
                        <th key={s} className="text-right px-3 py-2 text-xs font-semibold uppercase" style={{ color: SUC_COLORS[s] }}>
                          {SUC_NAMES[s]}
                        </th>
                      ))}
                      <th className="text-right px-3 py-2 text-xs font-semibold text-gray-700 uppercase bg-gray-50">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {SUCURSALES.map((origen) => {
                      const total = SUCURSALES.reduce((s, dst) => s + (data.matriz[origen][dst] || 0), 0);
                      return (
                        <tr key={origen} className="border-t border-gray-100">
                          <td className="px-3 py-2 font-medium" style={{ color: SUC_COLORS[origen] }}>{SUC_NAMES[origen]}</td>
                          {SUCURSALES.map((dst) => {
                            const v = data.matriz[origen][dst];
                            const isSelf = origen === dst;
                            return (
                              <td key={dst} className={`text-right px-3 py-2 font-mono ${isSelf ? "text-gray-300" : v > 0 ? "text-red-600" : "text-gray-300"}`}>
                                {isSelf ? "—" : v > 0 ? fmt(v) : "$0"}
                              </td>
                            );
                          })}
                          <td className="text-right px-3 py-2 font-mono font-semibold text-navy bg-gray-50">{fmt(total)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Stats por sucursal */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
                {SUCURSALES.map((s) => {
                  const st = data.stats[s];
                  return (
                    <div key={s} className="bg-white rounded-xl border p-4" style={{ borderColor: SUC_COLORS[s] + "44" }}>
                      <div className="text-xs uppercase tracking-wide mb-1 font-medium" style={{ color: SUC_COLORS[s] }}>
                        {SUC_NAMES[s]}
                      </div>
                      <div className="text-xl font-bold text-navy">{fmt(st.totalMonto)}</div>
                      <div className="text-xs text-gray-400 mt-1">
                        {st.totalMovimientos} movimientos
                      </div>
                      <div className="text-xs mt-2 flex gap-3">
                        <span className="text-emerald-600">✓ {fmt(st.pagados)}</span>
                        <span className="text-amber-600">⏳ {fmt(st.pendientes)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Alerta de duplicados */}
              {data.totalCentralizados > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <div className="flex items-start gap-3">
                    <div className="text-2xl">⚠️</div>
                    <div className="flex-1">
                      <h3 className="text-sm font-semibold text-amber-900 mb-1">
                        Posibles gastos centralizados duplicados
                      </h3>
                      <p className="text-xs text-amber-800 mb-2">
                        Detecté <b>{data.totalCentralizados}</b> grupos de filas con mismo proveedor + fecha + monto en más de una sucursal.
                        Suelen ser servicios pagados centralmente y replicados (WOKI, FUDO, ALLIANZ, etc.) — cada copia en una sucursal extra
                        suma <b>{fmt(data.montoCentralizadosDuplicado)}</b> de gasto duplicado en el P&L consolidado.
                      </p>
                      <button onClick={() => setView("duplicados")} className="text-xs text-amber-900 font-semibold hover:underline">
                        Ver detalle →
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ═══════════════ MOVIMIENTOS ═══════════════ */}
          {view === "movimientos" && (
            <>
              <div className="bg-white rounded-xl border border-gray-100 p-3 mb-3 flex flex-wrap gap-2 items-center">
                <input type="text" placeholder="Buscar proveedor / rubro / insumo..." value={search} onChange={(e) => setSearch(e.target.value)}
                  className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm flex-1 min-w-[200px]" />
                <div className="flex gap-1 bg-gray-50 border border-gray-200 rounded-lg p-1">
                  <button onClick={() => setFilterSuc("")}
                    className={`px-3 py-1 rounded-md text-xs font-medium ${!filterSuc ? "bg-white shadow text-navy" : "text-gray-600"}`}>
                    Todas
                  </button>
                  {SUCURSALES.map((s) => (
                    <button key={s} onClick={() => setFilterSuc(s)}
                      className={`px-3 py-1 rounded-md text-xs font-medium ${filterSuc === s ? "text-white shadow" : "text-gray-600"}`}
                      style={filterSuc === s ? { backgroundColor: SUC_COLORS[s] } : {}}>
                      {SUC_NAMES[s]}
                    </button>
                  ))}
                </div>
                <span className="text-xs text-gray-400 ml-auto">
                  {filteredMovs.length} movimientos · {fmt(filteredMovs.reduce((s, m) => s + m.total, 0))}
                </span>
              </div>

              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-100 sticky top-0">
                      <tr>
                        <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600 uppercase">Origen</th>
                        <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600 uppercase">→ Contraparte</th>
                        <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600 uppercase">Fecha</th>
                        <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600 uppercase">Proveedor</th>
                        <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600 uppercase">Rubro</th>
                        <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600 uppercase">Insumo</th>
                        <th className="text-right px-3 py-2 text-xs font-semibold text-gray-600 uppercase">Total</th>
                        <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600 uppercase">Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredMovs.slice(0, 500).map((m, i) => (
                        <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                          <td className="px-3 py-2">
                            <span className="text-xs font-semibold px-2 py-0.5 rounded-md text-white" style={{ backgroundColor: SUC_COLORS[m.sucursalOrigen] }}>
                              {SUC_NAMES[m.sucursalOrigen]}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            {m.sucursalContraparte ? (
                              <span className="text-xs font-semibold px-2 py-0.5 rounded-md text-white" style={{ backgroundColor: SUC_COLORS[m.sucursalContraparte] }}>
                                → {SUC_NAMES[m.sucursalContraparte]}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-400">— sin asignar</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-500 whitespace-nowrap">{m.fecha}</td>
                          <td className="px-3 py-2 text-sm text-navy font-medium">{m.proveedor}</td>
                          <td className="px-3 py-2 text-xs text-gray-500 max-w-[200px] truncate" title={m.rubro}>{m.rubro}</td>
                          <td className="px-3 py-2 text-xs text-gray-500 max-w-[160px] truncate" title={m.insumo}>{m.insumo}</td>
                          <td className="px-3 py-2 text-right font-mono font-semibold text-navy">{fmt(m.total)}</td>
                          <td className="px-3 py-2">
                            {m.estadoPago === "pagado" ? (
                              <span className="text-xs bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded-md">✓ pagado</span>
                            ) : (
                              <span className="text-xs bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded-md">⏳ pendiente</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* ═══════════════ DUPLICADOS CENTRALIZADOS ═══════════════ */}
          {view === "duplicados" && (
            <>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
                <h2 className="text-sm font-semibold text-amber-900 mb-1">⚠️ Gastos centralizados (mismo monto + fecha + proveedor en más de una sucursal)</h2>
                <p className="text-xs text-amber-800">
                  Estos suelen ser servicios centralizados (WOKI, FUDO, ALLIANZ, etc.) cargados en varias sucursales para repartir el costo.
                  Cada copia EXTRA suma al P&L consolidado: total duplicado = <b>{fmt(data.montoCentralizadosDuplicado)}</b>.
                </p>
              </div>

              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600 uppercase">Fecha</th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600 uppercase">Proveedor</th>
                      <th className="text-right px-3 py-2 text-xs font-semibold text-gray-600 uppercase">Monto</th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600 uppercase">Sucursales</th>
                      <th className="text-right px-3 py-2 text-xs font-semibold text-gray-600 uppercase">Duplicado extra</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.centralizados.map((c, i) => (
                      <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="px-3 py-2 text-xs text-gray-500 whitespace-nowrap">{c.fecha}</td>
                        <td className="px-3 py-2 text-sm text-navy font-medium">{c.proveedor}</td>
                        <td className="px-3 py-2 text-right font-mono text-navy">{fmt(c.total)}</td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-1">
                            {c.sucursalesIncluidas.map((s) => (
                              <span key={s} className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md text-white"
                                style={{ backgroundColor: SUC_COLORS[s] }}>
                                {SUC_NAMES[s]}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-amber-700">
                          + {fmt(c.total * (c.sucursalesIncluidas.length - 1))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
