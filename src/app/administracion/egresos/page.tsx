"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";

interface EgresoRow {
  sucursal: string;
  fechaIngreso: string | null;
  fechaFC: string | null;
  fechaPago: string | null;
  fechaVto: string | null;
  mes: number | null;
  mesPago: number | null;
  mesVto: number | null;
  proveedor: string;
  tipoComprobante: string;
  nroComprobante: string;
  rubro: string;
  insumo: string;
  total: number;
  metodoPago: string;
  estadoPago: "pagado" | "pendiente";
  tipoDeuda: "ninguna" | "vencida" | "futura";
  diasVencido: number | null;
}

interface ProveedorDeuda {
  name: string;
  pagado: number;
  vencida: number;
  futura: number;
  totalFacturado: number;
  cntPagadas: number;
  cntVencidas: number;
  cntFuturas: number;
  maxDiasVencido: number;
  deudaTotal: number;
}

interface Aggregate {
  rubros: Record<string, number>;
  proveedoresTop: Array<{ name: string; total: number }>;
  byMonth: Record<number, number>;
  byMonthCount: Record<number, number>;
}

interface ApiResponse {
  sucursal: string;
  year: string;
  rows: EgresoRow[];
  totalRows: number;
  totalPagadoRows: number;
  totalPendienteRows: number;
  totalVencidoRows: number;
  totalFuturoRows: number;
  total: number;
  totalPagado: number;
  totalPendiente: number;
  totalVencido: number;
  totalFuturo: number;
  pagado: Aggregate;
  pendiente: Aggregate;
  todos: Aggregate;
  proveedoresDeuda: ProveedorDeuda[];
}

type Estado = "pagado" | "pendiente" | "todos";

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
const MONTH_NAMES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const CHART_COLORS = ["#2E6DA4", "#10B981", "#8B5CF6", "#F59E0B", "#EF4444", "#EC4899", "#06B6D4", "#84CC16", "#F97316", "#6366F1", "#14B8A6", "#A855F7"];

function fmt(n: number): string {
  return "$" + Math.round(n).toLocaleString("es-AR");
}
function fmtK(n: number): string {
  if (n >= 1000000) return "$" + (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return "$" + Math.round(n / 1000) + "k";
  return "$" + Math.round(n);
}

export default function EgresosPage() {
  const [year, setYear] = useState<"2025" | "2026">("2026");
  const [sucursal, setSucursal] = useState<string>("palermo");
  const [estado, setEstado] = useState<Estado>("pagado");
  const [data, setData] = useState<ApiResponse | null>(null);
  const [prevYearData, setPrevYearData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [rubroFilter, setRubroFilter] = useState("");
  const [proveedorFilter, setProveedorFilter] = useState("");
  const [monthFilter, setMonthFilter] = useState<number | null>(null);
  const [view, setView] = useState<"summary" | "rubros" | "proveedores" | "detalle">("summary");

  useEffect(() => {
    setLoading(true);
    setError(null);
    const prevYear = year === "2026" ? "2025" : "2024";
    Promise.all([
      fetch(`/api/erp/egresos?sucursal=${sucursal}&year=${year}`).then((r) => r.json()),
      fetch(`/api/erp/egresos?sucursal=${sucursal}&year=${prevYear}`).then((r) => r.json()).catch(() => null),
    ])
      .then(([current, prev]) => {
        if (current.error) throw new Error(current.error);
        setData(current);
        setPrevYearData(prev?.error ? null : prev);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [sucursal, year]);

  // Escoger el aggregate segun estado
  const agg: Aggregate | null = useMemo(() => {
    if (!data) return null;
    return estado === "pagado" ? data.pagado : estado === "pendiente" ? data.pendiente : data.todos;
  }, [data, estado]);
  const aggPrev: Aggregate | null = useMemo(() => {
    if (!prevYearData) return null;
    return estado === "pagado" ? prevYearData.pagado : estado === "pendiente" ? prevYearData.pendiente : prevYearData.todos;
  }, [prevYearData, estado]);
  const totalEstado = useMemo(() => {
    if (!data) return 0;
    return estado === "pagado" ? data.totalPagado : estado === "pendiente" ? data.totalPendiente : data.total;
  }, [data, estado]);
  const totalEstadoPrev = useMemo(() => {
    if (!prevYearData) return 0;
    return estado === "pagado" ? prevYearData.totalPagado : estado === "pendiente" ? prevYearData.totalPendiente : prevYearData.total;
  }, [prevYearData, estado]);
  const countEstado = useMemo(() => {
    if (!data) return 0;
    return estado === "pagado" ? data.totalPagadoRows : estado === "pendiente" ? data.totalPendienteRows : data.totalRows;
  }, [data, estado]);

  // Filtered rows segun estado + filtros
  const filteredByEstado = useMemo(() => {
    if (!data) return [];
    if (estado === "todos") return data.rows;
    return data.rows.filter((r) => r.estadoPago === estado);
  }, [data, estado]);

  const filtered = useMemo(() => {
    return filteredByEstado.filter((r) => {
      if (search && !`${r.proveedor} ${r.insumo} ${r.rubro} ${r.nroComprobante} ${r.metodoPago}`.toLowerCase().includes(search.toLowerCase())) return false;
      if (rubroFilter && r.rubro !== rubroFilter) return false;
      if (proveedorFilter && r.proveedor !== proveedorFilter) return false;
      if (monthFilter !== null) {
        const m = estado === "pagado" ? r.mesPago : r.mes;
        if (m !== monthFilter) return false;
      }
      return true;
    });
  }, [filteredByEstado, search, rubroFilter, proveedorFilter, monthFilter, estado]);

  const filteredTotal = useMemo(() => filtered.reduce((s, r) => s + r.total, 0), [filtered]);

  // Month chart data
  const monthChartData = useMemo(() => {
    if (!agg) return [];
    return MONTH_NAMES.map((name, i) => {
      const month = i + 1;
      return {
        month: name,
        actual: agg.byMonth[month] || 0,
        anterior: aggPrev?.byMonth[month] || 0,
      };
    });
  }, [agg, aggPrev]);

  // Top rubros for pie
  const topRubrosChart = useMemo(() => {
    if (!agg) return [];
    return Object.entries(agg.rubros)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([name, value]) => ({ name, value }));
  }, [agg]);

  // Available rubros and proveedores
  const rubrosList = useMemo(() => {
    if (!agg) return [];
    return Object.keys(agg.rubros).sort();
  }, [agg]);
  const proveedoresList = useMemo(() => {
    if (!agg) return [];
    return agg.proveedoresTop.map((p) => p.name);
  }, [agg]);

  // YoY
  const yoyPct = useMemo(() => {
    if (!totalEstadoPrev || totalEstadoPrev === 0) return null;
    return ((totalEstado - totalEstadoPrev) / totalEstadoPrev) * 100;
  }, [totalEstado, totalEstadoPrev]);

  const clearFilters = () => {
    setSearch("");
    setRubroFilter("");
    setProveedorFilter("");
    setMonthFilter(null);
  };

  const hasFilters = search || rubroFilter || proveedorFilter || monthFilter !== null;

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="mb-4">
        <Link href="/administracion" className="text-sm text-gray-400 hover:text-blue-accent">
          ← Volver a Administración
        </Link>
        <h1 className="text-2xl font-bold text-navy mt-2">Egresos · {SUC_NAMES[sucursal]} {year}</h1>
        <p className="text-xs text-gray-400 mt-1">
          {estado === "pagado" && "Mostrando solo egresos pagados (cash real) · agrupados por fecha de pago"}
          {estado === "pendiente" && "Mostrando deuda pendiente (facturas sin pagar aún) · agrupados por fecha FC"}
          {estado === "todos" && "Mostrando todo (pagados + pendientes) · agrupados por fecha FC"}
        </p>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <div className="flex gap-1 bg-white border border-gray-200 rounded-lg p-1">
          {Object.entries(SUC_NAMES).map(([id, name]) => (
            <button
              key={id}
              onClick={() => setSucursal(id)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                sucursal === id ? "text-white shadow-sm" : "text-gray-600 hover:bg-gray-50"
              }`}
              style={sucursal === id ? { backgroundColor: SUC_COLORS[id] } : {}}
            >
              {name}
            </button>
          ))}
        </div>

        <div className="flex gap-1 bg-white border border-gray-200 rounded-lg p-1">
          {(["2026", "2025"] as const).map((y) => (
            <button
              key={y}
              onClick={() => setYear(y)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                year === y ? "bg-navy text-white shadow-sm" : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              {y}
            </button>
          ))}
        </div>

        <div className="flex gap-1 bg-white border border-gray-200 rounded-lg p-1">
          {([
            { id: "pagado", label: "✓ Pagados" },
            { id: "pendiente", label: "⏳ Pendientes" },
            { id: "todos", label: "Todos" },
          ] as const).map((e) => (
            <button
              key={e.id}
              onClick={() => setEstado(e.id as Estado)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                estado === e.id
                  ? e.id === "pagado"
                    ? "bg-emerald-50 text-emerald-600"
                    : e.id === "pendiente"
                    ? "bg-amber-50 text-amber-600"
                    : "bg-gray-100 text-gray-700"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              {e.label}
            </button>
          ))}
        </div>

        <div className="ml-auto flex gap-1 bg-white border border-gray-200 rounded-lg p-1">
          {(["summary", "rubros", "proveedores", "detalle"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all capitalize ${
                view === v ? "bg-blue-50 text-blue-accent" : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              {v === "summary" ? "Resumen" : v === "rubros" ? "Rubros" : v === "proveedores" ? "Proveedores" : "Detalle"}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="text-gray-400">Cargando...</div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 text-red-700 rounded-lg p-4 mb-4">Error: {error}</div>
      )}

      {data && agg && !loading && (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">
                {hasFilters ? "Filtrado" : estado === "pagado" ? `Pagados ${year}` : estado === "pendiente" ? "Deuda pendiente" : `Total ${year}`}
              </div>
              <div className="text-2xl font-bold text-navy">{fmt(hasFilters ? filteredTotal : totalEstado)}</div>
              {yoyPct !== null && !hasFilters && estado === "pagado" && (
                <div className={`text-xs mt-1 ${yoyPct > 0 ? "text-red-500" : "text-emerald-600"}`}>
                  {yoyPct > 0 ? "↑" : "↓"} {Math.abs(yoyPct).toFixed(1)}% vs {year === "2026" ? "2025" : "2024"}
                </div>
              )}
            </div>

            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Facturas</div>
              <div className="text-2xl font-bold text-navy">{hasFilters ? filtered.length : countEstado}</div>
              <div className="text-xs text-gray-400 mt-1">
                {data.totalPagadoRows} pagadas · {data.totalPendienteRows} pendientes
              </div>
            </div>

            <div className="bg-white rounded-xl border border-emerald-100 p-4">
              <div className="text-xs text-emerald-600 uppercase tracking-wide mb-1">✓ Pagado</div>
              <div className="text-2xl font-bold text-emerald-700">{fmt(data.totalPagado)}</div>
              <div className="text-xs text-gray-400 mt-1">cash real {year}</div>
            </div>

            <div className="bg-white rounded-xl border border-amber-100 p-4">
              <div className="text-xs text-amber-600 uppercase tracking-wide mb-1">⏳ Deuda pendiente</div>
              <div className="text-2xl font-bold text-amber-700">{fmt(data.totalPendiente)}</div>
              <div className="text-xs text-gray-400 mt-1">
                <span className="text-red-500 font-medium">{fmt(data.totalVencido)}</span> vencida · <span className="text-gray-500">{fmt(data.totalFuturo)}</span> futura
              </div>
            </div>
          </div>

          {/* Alertas deuda vencida */}
          {data.totalVencido > 0 && estado !== "pendiente" && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4 flex items-center gap-3">
              <div className="text-red-600 text-lg">⚠️</div>
              <div className="flex-1 text-sm">
                <span className="font-semibold text-red-700">{fmt(data.totalVencido)}</span>
                <span className="text-red-600"> en deuda vencida </span>
                <span className="text-red-500">({data.totalVencidoRows} facturas)</span>
              </div>
              <button
                onClick={() => { setEstado("pendiente"); setView("proveedores"); }}
                className="text-xs text-red-700 font-medium hover:underline"
              >
                Ver proveedores →
              </button>
            </div>
          )}

          {/* ======= SUMMARY VIEW ======= */}
          {view === "summary" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Monthly chart */}
              <div className="bg-white rounded-xl border border-gray-100 p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold text-navy uppercase tracking-wide">
                    {estado === "pagado" ? "Pagos por mes" : estado === "pendiente" ? "Deuda por mes FC" : "Egresos por mes"}
                  </h2>
                  {monthFilter !== null && (
                    <button onClick={() => setMonthFilter(null)} className="text-xs text-blue-accent hover:underline">
                      Mostrar todos
                    </button>
                  )}
                </div>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={monthChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="month" fontSize={11} />
                    <YAxis fontSize={11} tickFormatter={fmtK} />
                    <Tooltip
                      formatter={(v: number) => fmt(v)}
                      labelStyle={{ color: "#1a1a2e" }}
                      contentStyle={{ border: "1px solid #e5e7eb", borderRadius: 8 }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    {aggPrev && <Bar dataKey="anterior" fill="#e5e7eb" name={year === "2026" ? "2025" : "2024"} />}
                    <Bar
                      dataKey="actual"
                      fill={SUC_COLORS[sucursal]}
                      name={year}
                      onClick={(d: { month?: string }) => {
                        const idx = MONTH_NAMES.indexOf(d.month || "");
                        if (idx >= 0) setMonthFilter(idx + 1);
                      }}
                      style={{ cursor: "pointer" }}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Rubros pie */}
              <div className="bg-white rounded-xl border border-gray-100 p-4">
                <h2 className="text-sm font-semibold text-navy uppercase tracking-wide mb-3">Distribución por rubro</h2>
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={topRubrosChart}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      label={(entry: { name: string; percent: number }) => `${entry.name.substring(0, 15)} ${(entry.percent * 100).toFixed(0)}%`}
                      labelLine={false}
                      onClick={(d: { name: string }) => setRubroFilter(d.name)}
                      style={{ cursor: "pointer", fontSize: 10 }}
                    >
                      {topRubrosChart.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => fmt(v)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Top rubros */}
              <div className="bg-white rounded-xl border border-gray-100 p-4">
                <h2 className="text-sm font-semibold text-navy uppercase tracking-wide mb-3">Top Rubros</h2>
                <div className="space-y-2">
                  {Object.entries(agg.rubros)
                    .sort(([, a], [, b]) => b - a)
                    .slice(0, 8)
                    .map(([rubro, total], i) => {
                      const pct = totalEstado ? (total / totalEstado) * 100 : 0;
                      return (
                        <button
                          key={rubro}
                          onClick={() => { setRubroFilter(rubro); setView("detalle"); }}
                          className="w-full text-left hover:bg-gray-50 p-1.5 -mx-1.5 rounded-lg transition-colors"
                        >
                          <div className="flex items-baseline justify-between text-sm mb-1">
                            <span className="text-navy font-medium truncate">{rubro || "(sin rubro)"}</span>
                            <span className="text-gray-600 font-mono text-xs">{fmt(total)}</span>
                          </div>
                          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                          </div>
                        </button>
                      );
                    })}
                </div>
              </div>

              {/* Top proveedores */}
              <div className="bg-white rounded-xl border border-gray-100 p-4">
                <h2 className="text-sm font-semibold text-navy uppercase tracking-wide mb-3">Top Proveedores</h2>
                <div className="space-y-2">
                  {agg.proveedoresTop.slice(0, 8).map((p) => {
                    const pct = totalEstado ? (p.total / totalEstado) * 100 : 0;
                    return (
                      <button
                        key={p.name}
                        onClick={() => { setProveedorFilter(p.name); setView("detalle"); }}
                        className="w-full text-left hover:bg-gray-50 p-1.5 -mx-1.5 rounded-lg transition-colors"
                      >
                        <div className="flex items-baseline justify-between text-sm mb-1">
                          <span className="text-navy font-medium truncate">{p.name}</span>
                          <span className="text-gray-600 font-mono text-xs">{fmt(p.total)}</span>
                        </div>
                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: SUC_COLORS[sucursal] }} />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ======= RUBROS VIEW ======= */}
          {view === "rubros" && (
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-600 uppercase">Rubro</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-600 uppercase">Total</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-600 uppercase">Facturas</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-600 uppercase">%</th>
                    <th className="px-4 py-2.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(agg.rubros)
                    .sort(([, a], [, b]) => b - a)
                    .map(([rubro, total]) => {
                      const count = filteredByEstado.filter((r) => r.rubro === rubro).length;
                      const pct = totalEstado ? (total / totalEstado) * 100 : 0;
                      return (
                        <tr key={rubro} className="border-b border-gray-50 hover:bg-gray-50">
                          <td className="px-4 py-2.5 font-medium text-navy">{rubro || "(sin rubro)"}</td>
                          <td className="px-4 py-2.5 text-right font-mono text-navy">{fmt(total)}</td>
                          <td className="px-4 py-2.5 text-right text-gray-500">{count}</td>
                          <td className="px-4 py-2.5 text-right text-gray-500">{pct.toFixed(1)}%</td>
                          <td className="px-4 py-2.5">
                            <button
                              onClick={() => { setRubroFilter(rubro); setView("detalle"); }}
                              className="text-xs text-blue-accent hover:underline"
                            >
                              Ver detalle →
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}

          {/* ======= PROVEEDORES VIEW — con detalle de deuda ======= */}
          {view === "proveedores" && (
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-navy">Proveedores · Deuda al día y futura</h2>
                <span className="text-xs text-gray-500">
                  {data.proveedoresDeuda.filter((p) => p.vencida > 0 || p.futura > 0).length} con deuda
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-600 uppercase">Proveedor</th>
                      <th className="text-right px-3 py-2.5 text-xs font-semibold text-emerald-700 uppercase">✓ Pagado</th>
                      <th className="text-right px-3 py-2.5 text-xs font-semibold text-red-600 uppercase">⚠️ Vencida</th>
                      <th className="text-right px-3 py-2.5 text-xs font-semibold text-amber-600 uppercase">⏳ Futura</th>
                      <th className="text-right px-3 py-2.5 text-xs font-semibold text-gray-700 uppercase">Deuda total</th>
                      <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-600 uppercase">Días vto.</th>
                      <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-600 uppercase">Facturas</th>
                      <th className="px-3 py-2.5"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.proveedoresDeuda.map((p) => {
                      const tieneVencida = p.vencida > 0;
                      const tieneDeuda = p.vencida > 0 || p.futura > 0;
                      return (
                        <tr
                          key={p.name}
                          className={`border-b border-gray-50 hover:bg-gray-50 ${tieneVencida ? "bg-red-50/30" : ""}`}
                        >
                          <td className="px-3 py-2.5 font-medium text-navy">{p.name}</td>
                          <td className="px-3 py-2.5 text-right font-mono text-emerald-700 text-xs">{p.pagado > 0 ? fmt(p.pagado) : "—"}</td>
                          <td className="px-3 py-2.5 text-right font-mono text-red-600 font-semibold text-xs">{p.vencida > 0 ? fmt(p.vencida) : "—"}</td>
                          <td className="px-3 py-2.5 text-right font-mono text-amber-600 text-xs">{p.futura > 0 ? fmt(p.futura) : "—"}</td>
                          <td className="px-3 py-2.5 text-right font-mono text-navy font-semibold">{tieneDeuda ? fmt(p.vencida + p.futura) : "—"}</td>
                          <td className="px-3 py-2.5 text-center">
                            {p.maxDiasVencido > 0 ? (
                              <span className={`inline-block px-1.5 py-0.5 text-xs rounded-md font-medium ${
                                p.maxDiasVencido > 30 ? "bg-red-100 text-red-700" :
                                p.maxDiasVencido > 15 ? "bg-amber-100 text-amber-700" :
                                "bg-yellow-50 text-yellow-700"
                              }`}>
                                +{p.maxDiasVencido}d
                              </span>
                            ) : "—"}
                          </td>
                          <td className="px-3 py-2.5 text-center text-gray-500 text-xs">
                            {p.cntPagadas > 0 && <span className="text-emerald-600">{p.cntPagadas}p</span>}
                            {p.cntPagadas > 0 && (p.cntVencidas > 0 || p.cntFuturas > 0) && " · "}
                            {p.cntVencidas > 0 && <span className="text-red-600">{p.cntVencidas}v</span>}
                            {p.cntVencidas > 0 && p.cntFuturas > 0 && " · "}
                            {p.cntFuturas > 0 && <span className="text-amber-600">{p.cntFuturas}f</span>}
                          </td>
                          <td className="px-3 py-2.5">
                            <button
                              onClick={() => { setProveedorFilter(p.name); setView("detalle"); }}
                              className="text-xs text-blue-accent hover:underline whitespace-nowrap"
                            >
                              Ver facturas →
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 text-xs text-gray-500 flex items-center gap-4">
                <span><b>p</b>=pagadas · <b>v</b>=vencidas · <b>f</b>=futuras</span>
                <span className="text-red-600">Filas rojas: tienen deuda vencida</span>
                <span>Días vto = máxima antigüedad de deuda vencida</span>
              </div>
            </div>
          )}

          {/* ======= DETAIL VIEW ======= */}
          {view === "detalle" && (
            <>
              {/* Filters */}
              <div className="bg-white rounded-xl border border-gray-100 p-3 mb-4 flex flex-wrap gap-2 items-center">
                <input
                  type="text"
                  placeholder="Buscar..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="border border-gray-200 rounded-lg px-3 py-2 text-sm flex-1 min-w-[200px]"
                />
                <select value={rubroFilter} onChange={(e) => setRubroFilter(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm max-w-[200px]">
                  <option value="">Todos los rubros</option>
                  {rubrosList.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
                <select value={proveedorFilter} onChange={(e) => setProveedorFilter(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm max-w-[200px]">
                  <option value="">Todos los proveedores</option>
                  {proveedoresList.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
                <select value={monthFilter ?? ""} onChange={(e) => setMonthFilter(e.target.value ? parseInt(e.target.value) : null)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm">
                  <option value="">Todos los meses</option>
                  {MONTH_NAMES.map((n, i) => <option key={i} value={i + 1}>{n}</option>)}
                </select>
                {hasFilters && (
                  <button onClick={clearFilters} className="text-xs text-red-500 hover:underline">
                    Limpiar filtros
                  </button>
                )}
                <span className="text-xs text-gray-400 ml-auto">
                  {filtered.length} facturas · {fmt(filteredTotal)}
                </span>
              </div>

              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-100 sticky top-0">
                      <tr>
                        <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600 uppercase">Estado</th>
                        <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600 uppercase">Fecha FC</th>
                        <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600 uppercase">Vto.</th>
                        <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600 uppercase">Fecha Pago</th>
                        <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600 uppercase">Proveedor</th>
                        <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600 uppercase">Rubro</th>
                        <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600 uppercase">Insumo</th>
                        <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600 uppercase">Método</th>
                        <th className="text-right px-3 py-2 text-xs font-semibold text-gray-600 uppercase">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.slice(0, 1000).map((r, i) => (
                        <tr key={i} className={`border-b border-gray-50 hover:bg-gray-50 ${r.tipoDeuda === "vencida" ? "bg-red-50/30" : ""}`}>
                          <td className="px-3 py-2">
                            {r.estadoPago === "pagado" ? (
                              <span className="inline-block px-1.5 py-0.5 bg-emerald-50 text-emerald-600 text-xs rounded-md font-medium">✓ pagado</span>
                            ) : r.tipoDeuda === "vencida" ? (
                              <span className="inline-block px-1.5 py-0.5 bg-red-50 text-red-600 text-xs rounded-md font-medium">
                                ⚠️ vencido{r.diasVencido ? ` +${r.diasVencido}d` : ""}
                              </span>
                            ) : (
                              <span className="inline-block px-1.5 py-0.5 bg-amber-50 text-amber-600 text-xs rounded-md font-medium">⏳ futuro</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-gray-600 whitespace-nowrap text-xs">{r.fechaFC || "—"}</td>
                          <td className="px-3 py-2 text-gray-600 whitespace-nowrap text-xs">{r.fechaVto || "—"}</td>
                          <td className="px-3 py-2 text-gray-600 whitespace-nowrap text-xs">{r.fechaPago || "—"}</td>
                          <td className="px-3 py-2 font-medium text-navy">{r.proveedor}</td>
                          <td className="px-3 py-2 text-gray-500 text-xs">{r.rubro}</td>
                          <td className="px-3 py-2 text-gray-500 max-w-[180px] truncate text-xs" title={r.insumo}>{r.insumo}</td>
                          <td className="px-3 py-2 text-gray-400 text-xs">{r.metodoPago}</td>
                          <td className="px-3 py-2 text-right font-mono text-navy">{fmt(r.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {filtered.length > 1000 && (
                  <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 text-xs text-gray-500 text-center">
                    Mostrando primeras 1000 filas. Usá los filtros para refinar.
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
