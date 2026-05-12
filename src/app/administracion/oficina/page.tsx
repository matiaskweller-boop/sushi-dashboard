"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";

type Sucursal = "palermo" | "belgrano" | "madero";

interface Mov {
  sucursal: Sucursal;
  rownum: number;
  fecha: string;
  fechaISO: string | null;
  fechaPago: string | null;
  proveedor: string;
  rubro: string;
  insumo: string;
  total: number;
  metodoPago: string;
  estadoPago: "pagado" | "pendiente";
  matchedBy: string;
}

interface PorRubro {
  rubro: string;
  total: number;
  count: number;
  porSucursal: Record<Sucursal, number>;
}

interface PorProveedor {
  proveedor: string;
  total: number;
  count: number;
}

interface ApiResp {
  year: string;
  from: string | null;
  to: string | null;
  searchTerms: string[];
  total: number;
  totalMonto: number;
  porSucursal: Record<Sucursal, { total: number; pagado: number; pendiente: number; count: number }>;
  porRubro: PorRubro[];
  porProveedor: PorProveedor[];
  movimientos: Mov[];
  todosLosRubros: string[];
  todosLosProveedores: string[];
  sucursales: Sucursal[];
}

const SUC_NAMES: Record<Sucursal, string> = { palermo: "Palermo", belgrano: "Belgrano", madero: "Madero" };
const SUC_COLORS: Record<Sucursal, string> = { palermo: "#2E6DA4", belgrano: "#10B981", madero: "#8B5CF6" };

function fmt(n: number): string {
  return "$" + Math.round(n).toLocaleString("es-AR");
}
function fmtK(n: number): string {
  if (Math.abs(n) >= 1000000) return "$" + (n / 1000000).toFixed(2) + "M";
  if (Math.abs(n) >= 1000) return "$" + Math.round(n / 1000) + "k";
  return "$" + Math.round(n);
}

function defaultRange(): { from: string; to: string } {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const first = `${year}-${month}-01`;
  const lastDay = new Date(year, now.getMonth() + 1, 0).getDate();
  const last = `${year}-${month}-${String(lastDay).padStart(2, "0")}`;
  return { from: first, to: last };
}

export default function OficinaPage() {
  const def = defaultRange();
  const [from, setFrom] = useState(def.from);
  const [to, setTo] = useState(def.to);
  const [year, setYear] = useState<"2025" | "2026">("2026");
  const [search, setSearch] = useState("");           // input visible
  const [activeSearch, setActiveSearch] = useState(""); // se manda al API
  const [includeDefaults, setIncludeDefaults] = useState(true);
  const [data, setData] = useState<ApiResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterSuc, setFilterSuc] = useState<Sucursal | "">("");
  const [view, setView] = useState<"resumen" | "movimientos" | "rubros" | "proveedores">("resumen");

  const load = () => {
    setLoading(true);
    setError(null);
    const q = new URLSearchParams();
    if (from) q.set("from", from);
    if (to) q.set("to", to);
    q.set("year", year);
    if (activeSearch) q.set("search", activeSearch);
    q.set("includeDefaults", includeDefaults ? "true" : "false");
    fetch(`/api/erp/oficina?${q.toString()}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setData(d);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, activeSearch, includeDefaults]);

  const filteredMovs = useMemo(() => {
    if (!data) return [];
    if (!filterSuc) return data.movimientos;
    return data.movimientos.filter((m) => m.sucursal === filterSuc);
  }, [data, filterSuc]);

  const applyFilters = () => {
    setActiveSearch(search.trim());
    setTimeout(load, 0);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="mb-4">
        <Link href="/administracion" className="text-sm text-gray-400 hover:text-blue-accent">
          ← Volver a Administración
        </Link>
        <h1 className="text-2xl font-bold text-navy mt-2">Oficina · Gastos overhead</h1>
        <p className="text-xs text-gray-400 mt-1">
          Gastos de oficina y overhead de cada sucursal — busca por keywords default (oficina, overhead, gastos de oficina) + lo que agregues.
        </p>
      </div>

      {/* Filtros */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4 space-y-3">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-[11px] text-gray-500 uppercase tracking-wide block mb-1">Año</label>
            <div className="flex gap-1 bg-gray-50 border border-gray-200 rounded-lg p-1">
              {(["2026", "2025"] as const).map((y) => (
                <button
                  key={y}
                  onClick={() => setYear(y)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                    year === y ? "bg-navy text-white shadow" : "text-gray-600 hover:text-navy"
                  }`}
                >
                  {y}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-[11px] text-gray-500 uppercase tracking-wide block mb-1">Desde</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-blue-accent"
            />
          </div>
          <div>
            <label className="text-[11px] text-gray-500 uppercase tracking-wide block mb-1">Hasta</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-blue-accent"
            />
          </div>
          <button
            onClick={() => { load(); }}
            className="bg-navy text-white px-4 py-1.5 rounded-lg text-sm hover:bg-navy/90 transition"
          >
            Aplicar
          </button>
          <button
            onClick={() => { const d = defaultRange(); setFrom(d.from); setTo(d.to); }}
            className="text-xs text-gray-500 hover:text-navy underline"
          >
            mes actual
          </button>
          <button
            onClick={() => {
              const now = new Date();
              const start = new Date(now.getFullYear(), 0, 1);
              setFrom(start.toISOString().slice(0, 10));
              setTo(now.toISOString().slice(0, 10));
            }}
            className="text-xs text-gray-500 hover:text-navy underline"
          >
            año actual
          </button>
          <button
            onClick={() => { setFrom(""); setTo(""); }}
            className="text-xs text-gray-500 hover:text-navy underline"
          >
            todos
          </button>
        </div>

        <div className="flex flex-wrap gap-3 items-end pt-2 border-t border-gray-100">
          <div className="flex-1 min-w-[280px]">
            <label className="text-[11px] text-gray-500 uppercase tracking-wide block mb-1">
              Buscar (extra) — agregá otras palabras separadas por coma
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") applyFilters(); }}
                placeholder="ej: papeleria, computadora, internet, telefono..."
                className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-blue-accent"
              />
              <button
                onClick={applyFilters}
                className="bg-blue-accent text-white px-3 py-1.5 rounded-lg text-sm hover:bg-blue-accent/90 transition"
              >
                Buscar
              </button>
              {activeSearch && (
                <button
                  onClick={() => { setSearch(""); setActiveSearch(""); }}
                  className="text-xs text-red-500 hover:underline"
                >
                  ✕ limpiar
                </button>
              )}
            </div>
          </div>
          <label className="flex items-center gap-1.5 text-xs text-gray-700 bg-blue-50 border border-blue-100 rounded-lg px-2.5 py-2 cursor-pointer">
            <input
              type="checkbox"
              checked={includeDefaults}
              onChange={(e) => setIncludeDefaults(e.target.checked)}
              className="cursor-pointer"
            />
            <span>incluir defaults (oficina, overhead)</span>
          </label>
        </div>

        {data && (
          <div className="flex flex-wrap gap-1.5 items-center pt-1 text-[11px] text-gray-500">
            <span className="uppercase tracking-wide">Términos activos:</span>
            {data.searchTerms.map((t, i) => (
              <span key={i} className="bg-blue-50 text-blue-accent px-2 py-0.5 rounded-md text-[10px] font-medium">
                {t}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* View tabs */}
      <div className="flex gap-1 bg-white border border-gray-200 rounded-lg p-1 mb-4 inline-flex">
        {([
          { id: "resumen", label: "📊 Resumen por sucursal" },
          { id: "rubros", label: "🏷️ Por rubro" },
          { id: "proveedores", label: "🏢 Por proveedor" },
          { id: "movimientos", label: "📋 Movimientos" },
        ] as const).map((v) => (
          <button
            key={v.id}
            onClick={() => setView(v.id as typeof view)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
              view === v.id ? "bg-blue-50 text-blue-accent" : "text-gray-600 hover:bg-gray-50"
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      {loading && <p className="text-gray-400">Cargando...</p>}
      {error && <p className="bg-red-50 text-red-700 rounded-lg p-3 text-sm">⚠️ {error}</p>}

      {data && !loading && (
        <>
          {/* Stats globales */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <StatCard label="Movimientos" value={data.total.toString()} sub={fmt(data.totalMonto)} />
            {(["palermo", "belgrano", "madero"] as const).map((s) => (
              <div key={s} className="bg-white rounded-xl border p-3" style={{ borderColor: SUC_COLORS[s] + "44" }}>
                <div className="text-[11px] uppercase tracking-wide mb-0.5 font-medium" style={{ color: SUC_COLORS[s] }}>
                  {SUC_NAMES[s]}
                </div>
                <div className="text-xl font-bold text-navy">{fmtK(data.porSucursal[s].total)}</div>
                <div className="text-[11px] text-gray-400 mt-0.5">
                  {data.porSucursal[s].count} mov
                  {data.porSucursal[s].pendiente > 0 && (
                    <span className="text-amber-600 ml-1">· {fmtK(data.porSucursal[s].pendiente)} pendiente</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* ═══════════════ RESUMEN ═══════════════ */}
          {view === "resumen" && (
            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <h2 className="text-sm font-semibold text-navy uppercase tracking-wide mb-4">Total gastado por sucursal</h2>
              <div className="space-y-3">
                {(["palermo", "belgrano", "madero"] as const).map((s) => {
                  const v = data.porSucursal[s];
                  const max = Math.max(
                    data.porSucursal.palermo.total,
                    data.porSucursal.belgrano.total,
                    data.porSucursal.madero.total,
                    1
                  );
                  const pct = (v.total / max) * 100;
                  return (
                    <div key={s}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-sm font-medium" style={{ color: SUC_COLORS[s] }}>{SUC_NAMES[s]}</span>
                        <div className="flex items-center gap-3 text-xs">
                          <span className="text-gray-400">{v.count} movs</span>
                          {v.pagado > 0 && <span className="text-emerald-600">{fmt(v.pagado)} pagado</span>}
                          {v.pendiente > 0 && <span className="text-amber-600">{fmt(v.pendiente)} pendiente</span>}
                          <span className="font-bold text-navy text-base">{fmt(v.total)}</span>
                        </div>
                      </div>
                      <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${pct}%`, backgroundColor: SUC_COLORS[s] }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {data.totalMonto === 0 && (
                <div className="text-center py-8 text-gray-400 text-sm">
                  No hay gastos que coincidan con los términos de búsqueda en este rango de fechas.
                </div>
              )}
            </div>
          )}

          {/* ═══════════════ POR RUBRO ═══════════════ */}
          {view === "rubros" && (
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-600 uppercase">Rubro</th>
                    <th className="text-right px-3 py-2.5 text-xs font-semibold uppercase" style={{ color: SUC_COLORS.palermo }}>Palermo</th>
                    <th className="text-right px-3 py-2.5 text-xs font-semibold uppercase" style={{ color: SUC_COLORS.belgrano }}>Belgrano</th>
                    <th className="text-right px-3 py-2.5 text-xs font-semibold uppercase" style={{ color: SUC_COLORS.madero }}>Madero</th>
                    <th className="text-right px-3 py-2.5 text-xs font-semibold text-navy uppercase">Total</th>
                    <th className="text-right px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase">Movs</th>
                  </tr>
                </thead>
                <tbody>
                  {data.porRubro.map((r, i) => (
                    <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-3 py-2 font-medium text-navy">{r.rubro}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs">{r.porSucursal.palermo > 0 ? fmt(r.porSucursal.palermo) : <span className="text-gray-300">—</span>}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs">{r.porSucursal.belgrano > 0 ? fmt(r.porSucursal.belgrano) : <span className="text-gray-300">—</span>}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs">{r.porSucursal.madero > 0 ? fmt(r.porSucursal.madero) : <span className="text-gray-300">—</span>}</td>
                      <td className="px-3 py-2 text-right font-mono font-semibold text-navy">{fmt(r.total)}</td>
                      <td className="px-3 py-2 text-right text-xs text-gray-400">{r.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.porRubro.length === 0 && (
                <div className="text-center py-8 text-gray-400 text-sm">Sin resultados.</div>
              )}
            </div>
          )}

          {/* ═══════════════ POR PROVEEDOR ═══════════════ */}
          {view === "proveedores" && (
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-600 uppercase">Proveedor</th>
                    <th className="text-right px-3 py-2.5 text-xs font-semibold text-navy uppercase">Total</th>
                    <th className="text-right px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase">Movs</th>
                  </tr>
                </thead>
                <tbody>
                  {data.porProveedor.map((p, i) => (
                    <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-3 py-2 font-medium text-navy">{p.proveedor}</td>
                      <td className="px-3 py-2 text-right font-mono font-semibold text-navy">{fmt(p.total)}</td>
                      <td className="px-3 py-2 text-right text-xs text-gray-400">{p.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.porProveedor.length === 0 && (
                <div className="text-center py-8 text-gray-400 text-sm">Sin resultados.</div>
              )}
            </div>
          )}

          {/* ═══════════════ MOVIMIENTOS ═══════════════ */}
          {view === "movimientos" && (
            <>
              <div className="bg-white rounded-xl border border-gray-100 p-3 mb-3 flex flex-wrap gap-2 items-center">
                <div className="flex gap-1 bg-gray-50 border border-gray-200 rounded-lg p-1">
                  <button
                    onClick={() => setFilterSuc("")}
                    className={`px-3 py-1 rounded-md text-xs font-medium ${!filterSuc ? "bg-white shadow text-navy" : "text-gray-600"}`}
                  >
                    Todas
                  </button>
                  {(["palermo", "belgrano", "madero"] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => setFilterSuc(s)}
                      className={`px-3 py-1 rounded-md text-xs font-medium ${filterSuc === s ? "text-white shadow" : "text-gray-600"}`}
                      style={filterSuc === s ? { backgroundColor: SUC_COLORS[s] } : {}}
                    >
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
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600 uppercase">Sucursal</th>
                        <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600 uppercase">Fecha</th>
                        <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600 uppercase">Proveedor</th>
                        <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600 uppercase">Rubro</th>
                        <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600 uppercase">Insumo</th>
                        <th className="text-right px-3 py-2 text-xs font-semibold text-gray-600 uppercase">Total</th>
                        <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600 uppercase">Match</th>
                        <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600 uppercase">Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredMovs.slice(0, 500).map((m, i) => (
                        <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                          <td className="px-3 py-2">
                            <span
                              className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium text-white"
                              style={{ background: SUC_COLORS[m.sucursal] }}
                            >
                              {SUC_NAMES[m.sucursal]}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-500 whitespace-nowrap">{m.fecha}</td>
                          <td className="px-3 py-2 text-sm text-navy font-medium">{m.proveedor || "—"}</td>
                          <td className="px-3 py-2 text-xs text-gray-500 max-w-[180px] truncate" title={m.rubro}>{m.rubro || "—"}</td>
                          <td className="px-3 py-2 text-xs text-gray-500 max-w-[200px] truncate" title={m.insumo}>{m.insumo || "—"}</td>
                          <td className="px-3 py-2 text-right font-mono font-semibold text-navy">{fmt(m.total)}</td>
                          <td className="px-3 py-2">
                            <span className="text-[10px] bg-blue-50 text-blue-accent px-1.5 py-0.5 rounded-md">{m.matchedBy}</span>
                          </td>
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
                {filteredMovs.length > 500 && (
                  <div className="px-4 py-2 text-xs text-gray-400 bg-gray-50">
                    Mostrando primeros 500 de {filteredMovs.length}. Refinar búsqueda o filtros.
                  </div>
                )}
                {filteredMovs.length === 0 && (
                  <div className="text-center py-8 text-gray-400 text-sm">Sin movimientos.</div>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3">
      <div className="text-[11px] text-gray-500 uppercase tracking-wide">{label}</div>
      <div className="text-xl font-bold text-navy mt-0.5">{value}</div>
      {sub && <div className="text-[11px] text-gray-400 mt-0.5">{sub}</div>}
    </div>
  );
}
