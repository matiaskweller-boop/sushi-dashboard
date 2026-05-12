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
  const [view, setView] = useState<"resumen" | "movimientos" | "apertura">("resumen");
  const [filterSuc, setFilterSuc] = useState<Sucursal | "">("");
  const [search, setSearch] = useState("");
  const [expandedFlow, setExpandedFlow] = useState<string | null>(null); // key "deudor->acreedor"
  const [expandedCell, setExpandedCell] = useState<string | null>(null); // key "origen->dst" (matriz)

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
          (PAGO POR GASTO HECHO POR…, deuda con…, envío de mercadería, flete entre locales).
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
            { id: "apertura", label: "🔍 Apertura por par" },
            { id: "movimientos", label: "📋 Movimientos" },
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
                    {data.saldosNetos.map((s, i) => {
                      const flowKey = `${s.deudor}->${s.acreedor}`;
                      const isExpanded = expandedFlow === flowKey;
                      // Movimientos del deudor hacia el acreedor (origen=deudor, contraparte=acreedor)
                      const movsAB = data.movimientos.filter(
                        (m) => m.sucursalOrigen === s.deudor && m.sucursalContraparte === s.acreedor
                      );
                      // Compensación inversa
                      const movsBA = data.movimientos.filter(
                        (m) => m.sucursalOrigen === s.acreedor && m.sucursalContraparte === s.deudor
                      );
                      const brutoAB = movsAB.reduce((acc, m) => acc + m.total, 0);
                      const brutoBA = movsBA.reduce((acc, m) => acc + m.total, 0);
                      return (
                        <div key={i}>
                          <button
                            onClick={() => setExpandedFlow(isExpanded ? null : flowKey)}
                            className="w-full flex items-center gap-3 bg-gray-50 hover:bg-gray-100 rounded-lg p-3 cursor-pointer transition text-left"
                          >
                            <span className="text-gray-400 text-xs">{isExpanded ? "▼" : "▶"}</span>
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
                            <div className="ml-auto text-right">
                              <div className="text-2xl font-bold font-mono text-red-700">{fmt(s.monto)}</div>
                              <div className="text-[10px] text-gray-400">
                                {movsAB.length} mov{movsAB.length !== 1 ? "s" : ""} · click para ver detalle
                              </div>
                            </div>
                          </button>

                          {isExpanded && (
                            <div className="mt-2 bg-white border border-gray-200 rounded-lg overflow-hidden">
                              <div className="bg-gray-50 px-3 py-2 border-b border-gray-100 flex items-center gap-3 text-xs">
                                <span className="text-gray-500">Cálculo neto:</span>
                                <span className="font-mono">
                                  {fmt(brutoAB)} <span className="text-gray-400">({SUC_NAMES[s.deudor]} → {SUC_NAMES[s.acreedor]})</span>
                                  {brutoBA > 0 && (
                                    <> − {fmt(brutoBA)} <span className="text-gray-400">({SUC_NAMES[s.acreedor]} → {SUC_NAMES[s.deudor]})</span></>
                                  )}
                                  <span className="text-gray-500"> = </span>
                                  <span className="font-bold text-red-700">{fmt(s.monto)}</span>
                                </span>
                              </div>

                              {movsAB.length > 0 && (
                                <div>
                                  <div className="bg-gray-50/50 px-3 py-1.5 text-[10px] uppercase text-gray-500 font-medium border-b border-gray-100">
                                    {SUC_NAMES[s.deudor]} → {SUC_NAMES[s.acreedor]} ({movsAB.length} mov · {fmt(brutoAB)})
                                  </div>
                                  <FlowMovsTable movs={movsAB} />
                                </div>
                              )}
                              {movsBA.length > 0 && (
                                <div>
                                  <div className="bg-emerald-50 px-3 py-1.5 text-[10px] uppercase text-emerald-700 font-medium border-b border-emerald-100">
                                    Compensación inversa: {SUC_NAMES[s.acreedor]} → {SUC_NAMES[s.deudor]} ({movsBA.length} mov · -{fmt(brutoBA)})
                                  </div>
                                  <FlowMovsTable movs={movsBA} />
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
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
                        <Fragment key={origen}>
                          <tr className="border-t border-gray-100">
                            <td className="px-3 py-2 font-medium" style={{ color: SUC_COLORS[origen] }}>{SUC_NAMES[origen]}</td>
                            {SUCURSALES.map((dst) => {
                              const v = data.matriz[origen][dst];
                              const isSelf = origen === dst;
                              const cellKey = `${origen}->${dst}`;
                              const isExpandedCell = expandedCell === cellKey;
                              if (isSelf) {
                                return <td key={dst} className="text-right px-3 py-2 font-mono text-gray-300">—</td>;
                              }
                              if (v === 0) {
                                return <td key={dst} className="text-right px-3 py-2 font-mono text-gray-300">$0</td>;
                              }
                              return (
                                <td key={dst} className="text-right px-3 py-2 font-mono">
                                  <button
                                    onClick={() => setExpandedCell(isExpandedCell ? null : cellKey)}
                                    className="text-red-600 hover:bg-red-50 px-1.5 py-0.5 rounded transition"
                                    title="Click para ver el detalle"
                                  >
                                    {fmt(v)} {isExpandedCell ? "▼" : "▶"}
                                  </button>
                                </td>
                              );
                            })}
                            <td className="text-right px-3 py-2 font-mono font-semibold text-navy bg-gray-50">{fmt(total)}</td>
                          </tr>
                          {/* Drill-down de celda expandida */}
                          {SUCURSALES.map((dst) => {
                            const cellKey = `${origen}->${dst}`;
                            if (expandedCell !== cellKey) return null;
                            const movs = data.movimientos.filter(
                              (m) => m.sucursalOrigen === origen && m.sucursalContraparte === dst
                            );
                            return (
                              <tr key={`${origen}-${dst}-drill`} className="bg-gray-50">
                                <td colSpan={SUCURSALES.length + 2} className="px-3 py-2">
                                  <div className="text-xs text-gray-600 mb-1.5">
                                    Detalle: <b>{SUC_NAMES[origen]} → {SUC_NAMES[dst]}</b> · {movs.length} mov · {fmt(movs.reduce((s, m) => s + m.total, 0))}
                                  </div>
                                  <FlowMovsTable movs={movs} />
                                </td>
                              </tr>
                            );
                          })}
                        </Fragment>
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

            </>
          )}

          {/* ═══════════════ APERTURA POR PAR ═══════════════ */}
          {view === "apertura" && (
            <>
              <div className="bg-white rounded-xl border border-gray-100 p-4 mb-3">
                <h2 className="text-sm font-semibold text-navy uppercase tracking-wide mb-1">
                  🔍 Apertura por par de sucursales
                </h2>
                <p className="text-xs text-gray-500">
                  Todos los movimientos brutos agrupados por dirección (origen → contraparte).
                  Útil para entender qué compone cada saldo neto sin tener que cruzar tablas.
                </p>
              </div>

              <div className="space-y-4">
                {SUCURSALES.map((origen) =>
                  SUCURSALES.filter((d) => d !== origen).map((dst) => {
                    const movs = data.movimientos.filter(
                      (m) => m.sucursalOrigen === origen && m.sucursalContraparte === dst
                    );
                    if (movs.length === 0) return null;
                    const totalAB = movs.reduce((s, m) => s + m.total, 0);
                    return (
                      <div key={`${origen}-${dst}`} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                        <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-3 flex-wrap">
                          <span className="text-xs text-gray-500">debe</span>
                          <span
                            className="text-sm font-bold px-2.5 py-1 rounded-md text-white"
                            style={{ backgroundColor: SUC_COLORS[origen] }}
                          >
                            {SUC_NAMES[origen]}
                          </span>
                          <span className="text-gray-400">→</span>
                          <span
                            className="text-sm font-bold px-2.5 py-1 rounded-md text-white"
                            style={{ backgroundColor: SUC_COLORS[dst] }}
                          >
                            {SUC_NAMES[dst]}
                          </span>
                          <span className="text-xs text-gray-400 ml-2">
                            {movs.length} movimiento{movs.length !== 1 ? "s" : ""}
                          </span>
                          <div className="ml-auto font-mono font-bold text-red-700 text-lg">
                            {fmt(totalAB)}
                          </div>
                        </div>
                        <FlowMovsTable movs={movs} />
                      </div>
                    );
                  })
                )}
                {data.movimientos.filter((m) => m.sucursalContraparte).length === 0 && (
                  <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-sm text-gray-400">
                    No hay movimientos con contraparte específica detectada.
                  </div>
                )}

                {/* Sin contraparte (uber/envios genéricos) */}
                {(() => {
                  const sinContraparte = data.movimientos.filter((m) => !m.sucursalContraparte);
                  if (sinContraparte.length === 0) return null;
                  return (
                    <div className="bg-amber-50 rounded-xl border border-amber-200 overflow-hidden">
                      <div className="px-4 py-3 border-b border-amber-100 flex items-center gap-3 flex-wrap">
                        <span className="text-base">⚠️</span>
                        <span className="text-sm font-semibold text-amber-900">Sin contraparte específica</span>
                        <span className="text-xs text-amber-700">
                          {sinContraparte.length} mov · uber entre locales, envío sin sucursal mencionada, etc.
                        </span>
                        <div className="ml-auto font-mono font-bold text-amber-700">
                          {fmt(sinContraparte.reduce((s, m) => s + m.total, 0))}
                        </div>
                      </div>
                      <FlowMovsTable movs={sinContraparte} showOrigen />
                    </div>
                  );
                })()}
              </div>
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

        </>
      )}
    </div>
  );
}

/**
 * Tabla compacta de movimientos para usar en drill-downs.
 * Cuando `showOrigen` es true muestra la columna Origen (útil cuando los movimientos
 * son de múltiples sucursales, ej "sin contraparte").
 */
function FlowMovsTable({ movs, showOrigen }: { movs: Movimiento[]; showOrigen?: boolean }) {
  if (movs.length === 0) {
    return <div className="px-3 py-4 text-center text-xs text-gray-400">Sin movimientos</div>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="bg-gray-50 border-b border-gray-100">
          <tr>
            {showOrigen && <th className="text-left px-2 py-1.5 text-[10px] font-semibold text-gray-500 uppercase">Origen</th>}
            <th className="text-left px-2 py-1.5 text-[10px] font-semibold text-gray-500 uppercase">Fecha</th>
            <th className="text-left px-2 py-1.5 text-[10px] font-semibold text-gray-500 uppercase">Proveedor</th>
            <th className="text-left px-2 py-1.5 text-[10px] font-semibold text-gray-500 uppercase">Rubro</th>
            <th className="text-left px-2 py-1.5 text-[10px] font-semibold text-gray-500 uppercase">Insumo</th>
            <th className="text-right px-2 py-1.5 text-[10px] font-semibold text-gray-500 uppercase">Total</th>
            <th className="text-left px-2 py-1.5 text-[10px] font-semibold text-gray-500 uppercase">Estado</th>
            <th className="text-left px-2 py-1.5 text-[10px] font-semibold text-gray-500 uppercase">Detección</th>
          </tr>
        </thead>
        <tbody>
          {movs.map((m, i) => (
            <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
              {showOrigen && (
                <td className="px-2 py-1.5">
                  <span
                    className="inline-block px-1.5 py-0.5 rounded text-[9px] font-medium text-white"
                    style={{ background: SUC_COLORS[m.sucursalOrigen] }}
                  >
                    {SUC_NAMES[m.sucursalOrigen]}
                  </span>
                </td>
              )}
              <td className="px-2 py-1.5 text-gray-600 whitespace-nowrap">{m.fecha}</td>
              <td className="px-2 py-1.5 text-navy font-medium">{m.proveedor || "—"}</td>
              <td className="px-2 py-1.5 text-gray-500 max-w-[180px] truncate" title={m.rubro}>{m.rubro || "—"}</td>
              <td className="px-2 py-1.5 text-gray-500 max-w-[200px] truncate" title={m.insumo}>{m.insumo || "—"}</td>
              <td className="px-2 py-1.5 text-right font-mono font-semibold text-navy whitespace-nowrap">{fmt(m.total)}</td>
              <td className="px-2 py-1.5">
                {m.estadoPago === "pagado" ? (
                  <span className="text-[10px] bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded-md">✓ pagado</span>
                ) : (
                  <span className="text-[10px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded-md">⏳ pendiente</span>
                )}
              </td>
              <td className="px-2 py-1.5 text-[10px] text-gray-400 italic max-w-[160px] truncate" title={m.notaDeteccion}>
                {m.notaDeteccion}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
