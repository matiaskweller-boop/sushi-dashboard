"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend,
} from "recharts";

type Categoria =
  | "insumos"
  | "sueldos"
  | "alquilerServicios"
  | "operativos"
  | "financieros"
  | "impuestos"
  | "otros";

interface PnLMonth {
  year: number;
  month: number;
  ventas: number;
  ordenes: number;
  comensales: number;
  ticketPromedio: number;
  costos: {
    insumos: number;
    sueldos: number;
    alquilerServicios: number;
    operativos: number;
    financieros: number;
    impuestos: number;
    otros: number;
    total: number;
  };
  margenBruto: number;
  cmvPct: number;
  ebitda: number;
  ebitdaPct: number;
}

interface RubroBreakdown {
  rubro: string;
  categoria: Categoria;
  total: number;
  facturas: number;
}

interface PnLResponse {
  sucursal: string;
  year: string;
  months: PnLMonth[];
  ytd: {
    ventas: number;
    ordenes: number;
    comensales: number;
    costosInsumos: number;
    costosSueldos: number;
    costosAlquilerServicios: number;
    costosOperativos: number;
    costosFinancieros: number;
    costosImpuestos: number;
    costosOtros: number;
    costosTotal: number;
    ebitda: number;
    cmvPct: number;
    ebitdaPct: number;
  };
  byRubro: RubroBreakdown[];
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
const MONTH_NAMES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

const CATEGORIA_LABEL: Record<Categoria, string> = {
  insumos: "Insumos / CMV",
  sueldos: "Sueldos / RRHH",
  alquilerServicios: "Alquiler + Servicios",
  operativos: "Operativos",
  financieros: "Bancarios / Comisiones",
  impuestos: "Impuestos / Acuerdos",
  otros: "Otros",
};
const CATEGORIA_COLOR: Record<Categoria, string> = {
  insumos: "#EF4444",
  sueldos: "#F59E0B",
  alquilerServicios: "#8B5CF6",
  operativos: "#06B6D4",
  financieros: "#EC4899",
  impuestos: "#6366F1",
  otros: "#64748B",
};

function fmt(n: number): string {
  return "$" + Math.round(n).toLocaleString("es-AR");
}
function fmtK(n: number): string {
  if (Math.abs(n) >= 1000000) return "$" + (n / 1000000).toFixed(1) + "M";
  if (Math.abs(n) >= 1000) return "$" + Math.round(n / 1000) + "k";
  return "$" + Math.round(n);
}
function fmtPct(n: number): string {
  return n.toFixed(1) + "%";
}

export default function PnLPage() {
  const [year, setYear] = useState<"2025" | "2026">("2026");
  const [sucursal, setSucursal] = useState<string>("palermo");
  const [data, setData] = useState<PnLResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/erp/pnl?sucursal=${sucursal}&year=${year}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setData(d);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [sucursal, year]);

  // Chart data: Ventas vs Costos + EBITDA line
  const chartData = useMemo(() => {
    if (!data) return [];
    return data.months.map((m) => ({
      month: MONTH_NAMES[m.month - 1],
      ventas: m.ventas,
      insumos: m.costos.insumos,
      sueldos: m.costos.sueldos,
      alquilerServicios: m.costos.alquilerServicios,
      operativos: m.costos.operativos,
      financieros: m.costos.financieros,
      impuestos: m.costos.impuestos,
      otros: m.costos.otros,
      ebitda: m.ebitda,
      ebitdaPct: m.ebitdaPct,
    }));
  }, [data]);

  const selectedMonthData = useMemo(() => {
    if (!data || selectedMonth === null) return null;
    return data.months.find((m) => m.month === selectedMonth) || null;
  }, [data, selectedMonth]);

  // Rubros agrupados por categoria para el detalle
  const rubrosByCategoria = useMemo<Record<Categoria, RubroBreakdown[]>>(() => {
    const r: Record<Categoria, RubroBreakdown[]> = {
      insumos: [], sueldos: [], alquilerServicios: [], operativos: [],
      financieros: [], impuestos: [], otros: [],
    };
    if (!data) return r;
    for (const b of data.byRubro) {
      r[b.categoria].push(b);
    }
    return r;
  }, [data]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="mb-4">
        <Link href="/administracion" className="text-sm text-gray-400 hover:text-blue-accent">
          ← Volver a Administración
        </Link>
        <h1 className="text-2xl font-bold text-navy mt-2">P&amp;L · {SUC_NAMES[sucursal]} {year}</h1>
        <p className="text-xs text-gray-400 mt-1">
          Ventas desde Fudo · Costos de EGRESOS pagados (cash real) · clasificados por categoría
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
      </div>

      {loading && <div className="text-center py-20 text-gray-400">Cargando...</div>}
      {error && <div className="bg-red-50 text-red-700 rounded-lg p-4 mb-4">Error: {error}</div>}

      {data && !loading && (
        <>
          {/* YTD KPI cards */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Ventas YTD</div>
              <div className="text-xl font-bold text-navy">{fmt(data.ytd.ventas)}</div>
              <div className="text-xs text-gray-400 mt-1">{data.ytd.ordenes.toLocaleString("es-AR")} órdenes</div>
            </div>
            <div className="bg-white rounded-xl border border-red-100 p-4">
              <div className="text-xs text-red-600 uppercase tracking-wide mb-1">Insumos (CMV)</div>
              <div className="text-xl font-bold text-red-700">{fmt(data.ytd.costosInsumos)}</div>
              <div className="text-xs text-gray-400 mt-1">{fmtPct(data.ytd.cmvPct)} de ventas</div>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Costos totales</div>
              <div className="text-xl font-bold text-navy">{fmt(data.ytd.costosTotal)}</div>
              <div className="text-xs text-gray-400 mt-1">{data.ytd.ventas ? fmtPct((data.ytd.costosTotal / data.ytd.ventas) * 100) : "—"} de ventas</div>
            </div>
            <div className={`bg-white rounded-xl border p-4 ${data.ytd.ebitda >= 0 ? "border-emerald-100" : "border-red-100"}`}>
              <div className={`text-xs uppercase tracking-wide mb-1 ${data.ytd.ebitda >= 0 ? "text-emerald-600" : "text-red-600"}`}>EBITDA</div>
              <div className={`text-xl font-bold ${data.ytd.ebitda >= 0 ? "text-emerald-700" : "text-red-700"}`}>{fmt(data.ytd.ebitda)}</div>
              <div className="text-xs text-gray-400 mt-1">{fmtPct(data.ytd.ebitdaPct)} margen</div>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Comensales</div>
              <div className="text-xl font-bold text-navy">{data.ytd.comensales.toLocaleString("es-AR")}</div>
              <div className="text-xs text-gray-400 mt-1">
                {data.ytd.comensales > 0 ? fmt(data.ytd.ventas / data.ytd.comensales) : "—"} / persona
              </div>
            </div>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            {/* Ventas vs Costos */}
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <h2 className="text-sm font-semibold text-navy uppercase tracking-wide mb-3">Ventas vs Costos por mes</h2>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={chartData} onClick={(d) => {
                  if (d?.activePayload?.[0]?.payload?.month) {
                    const idx = MONTH_NAMES.indexOf(d.activePayload[0].payload.month);
                    setSelectedMonth(idx + 1);
                  }
                }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" fontSize={11} />
                  <YAxis fontSize={11} tickFormatter={fmtK} />
                  <Tooltip formatter={(v: number) => fmt(v)} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="ventas" fill={SUC_COLORS[sucursal]} name="Ventas" />
                  <Bar dataKey="insumos" stackId="costos" fill={CATEGORIA_COLOR.insumos} name="Insumos" />
                  <Bar dataKey="sueldos" stackId="costos" fill={CATEGORIA_COLOR.sueldos} name="Sueldos" />
                  <Bar dataKey="alquilerServicios" stackId="costos" fill={CATEGORIA_COLOR.alquilerServicios} name="Alquiler" />
                  <Bar dataKey="operativos" stackId="costos" fill={CATEGORIA_COLOR.operativos} name="Operativos" />
                  <Bar dataKey="impuestos" stackId="costos" fill={CATEGORIA_COLOR.impuestos} name="Impuestos" />
                  <Bar dataKey="financieros" stackId="costos" fill={CATEGORIA_COLOR.financieros} name="Financieros" />
                  <Bar dataKey="otros" stackId="costos" fill={CATEGORIA_COLOR.otros} name="Otros" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* EBITDA line */}
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <h2 className="text-sm font-semibold text-navy uppercase tracking-wide mb-3">EBITDA por mes</h2>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" fontSize={11} />
                  <YAxis fontSize={11} tickFormatter={fmtK} />
                  <Tooltip formatter={(v: number, name: string) => name === "ebitdaPct" ? fmtPct(v) : fmt(v)} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="ebitda" stroke="#10B981" strokeWidth={2} name="EBITDA" dot={{ r: 4 }} />
                  <Line type="monotone" dataKey="margenBruto" stroke={SUC_COLORS[sucursal]} strokeWidth={2} name="Margen Bruto" dot={{ r: 3 }} strokeDasharray="4 2" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Tabla P&L */}
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden mb-4">
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
              <h2 className="text-sm font-semibold text-navy">Tabla P&amp;L · {year}</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold text-gray-600 uppercase sticky left-0 bg-gray-50">Concepto</th>
                    {MONTH_NAMES.map((m, i) => (
                      <th
                        key={m}
                        className={`text-right px-2 py-2 font-semibold uppercase cursor-pointer hover:bg-gray-100 ${
                          selectedMonth === i + 1 ? "bg-blue-100 text-blue-accent" : "text-gray-600"
                        }`}
                        onClick={() => setSelectedMonth(selectedMonth === i + 1 ? null : i + 1)}
                      >
                        {m}
                      </th>
                    ))}
                    <th className="text-right px-3 py-2 font-semibold text-gray-700 uppercase bg-gray-100">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Ventas */}
                  <tr className="border-b border-gray-100 bg-blue-50/40">
                    <td className="px-3 py-2 font-semibold text-navy sticky left-0 bg-blue-50/40">Ventas</td>
                    {data.months.map((m) => (
                      <td key={m.month} className="text-right px-2 py-2 font-mono text-navy">{m.ventas > 0 ? fmtK(m.ventas) : "—"}</td>
                    ))}
                    <td className="text-right px-3 py-2 font-mono font-semibold text-navy bg-gray-100">{fmtK(data.ytd.ventas)}</td>
                  </tr>

                  {/* Insumos */}
                  <tr className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-3 py-2 text-red-700 sticky left-0 bg-white">- Insumos (CMV)</td>
                    {data.months.map((m) => (
                      <td key={m.month} className="text-right px-2 py-2 font-mono text-red-600">{m.costos.insumos > 0 ? fmtK(m.costos.insumos) : "—"}</td>
                    ))}
                    <td className="text-right px-3 py-2 font-mono text-red-600 bg-gray-100">{fmtK(data.ytd.costosInsumos)}</td>
                  </tr>

                  {/* Margen Bruto */}
                  <tr className="border-b border-gray-100 bg-gray-50/50 font-semibold">
                    <td className="px-3 py-2 text-navy sticky left-0 bg-gray-50/50">= Margen Bruto</td>
                    {data.months.map((m) => (
                      <td key={m.month} className="text-right px-2 py-2 font-mono text-navy">
                        {m.ventas > 0 ? <span>{fmtK(m.margenBruto)}<span className="text-[10px] text-gray-400 block">{fmtPct(100 - m.cmvPct)}</span></span> : "—"}
                      </td>
                    ))}
                    <td className="text-right px-3 py-2 font-mono text-navy bg-gray-100">{fmtK(data.ytd.ventas - data.ytd.costosInsumos)}</td>
                  </tr>

                  {/* Other costs */}
                  <tr className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-3 py-2 text-gray-600 sticky left-0 bg-white">- Sueldos / RRHH</td>
                    {data.months.map((m) => (
                      <td key={m.month} className="text-right px-2 py-2 font-mono text-gray-500">{m.costos.sueldos > 0 ? fmtK(m.costos.sueldos) : "—"}</td>
                    ))}
                    <td className="text-right px-3 py-2 font-mono text-gray-500 bg-gray-100">{fmtK(data.ytd.costosSueldos)}</td>
                  </tr>
                  <tr className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-3 py-2 text-gray-600 sticky left-0 bg-white">- Alquiler + Servicios</td>
                    {data.months.map((m) => (
                      <td key={m.month} className="text-right px-2 py-2 font-mono text-gray-500">{m.costos.alquilerServicios > 0 ? fmtK(m.costos.alquilerServicios) : "—"}</td>
                    ))}
                    <td className="text-right px-3 py-2 font-mono text-gray-500 bg-gray-100">{fmtK(data.ytd.costosAlquilerServicios)}</td>
                  </tr>
                  <tr className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-3 py-2 text-gray-600 sticky left-0 bg-white">- Operativos</td>
                    {data.months.map((m) => (
                      <td key={m.month} className="text-right px-2 py-2 font-mono text-gray-500">{m.costos.operativos > 0 ? fmtK(m.costos.operativos) : "—"}</td>
                    ))}
                    <td className="text-right px-3 py-2 font-mono text-gray-500 bg-gray-100">{fmtK(data.ytd.costosOperativos)}</td>
                  </tr>
                  <tr className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-3 py-2 text-gray-600 sticky left-0 bg-white">- Impuestos / Acuerdos</td>
                    {data.months.map((m) => (
                      <td key={m.month} className="text-right px-2 py-2 font-mono text-gray-500">{m.costos.impuestos > 0 ? fmtK(m.costos.impuestos) : "—"}</td>
                    ))}
                    <td className="text-right px-3 py-2 font-mono text-gray-500 bg-gray-100">{fmtK(data.ytd.costosImpuestos)}</td>
                  </tr>
                  <tr className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-3 py-2 text-gray-600 sticky left-0 bg-white">- Bancarios / Comisiones</td>
                    {data.months.map((m) => (
                      <td key={m.month} className="text-right px-2 py-2 font-mono text-gray-500">{m.costos.financieros > 0 ? fmtK(m.costos.financieros) : "—"}</td>
                    ))}
                    <td className="text-right px-3 py-2 font-mono text-gray-500 bg-gray-100">{fmtK(data.ytd.costosFinancieros)}</td>
                  </tr>
                  <tr className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-3 py-2 text-gray-600 sticky left-0 bg-white">- Otros</td>
                    {data.months.map((m) => (
                      <td key={m.month} className="text-right px-2 py-2 font-mono text-gray-500">{m.costos.otros > 0 ? fmtK(m.costos.otros) : "—"}</td>
                    ))}
                    <td className="text-right px-3 py-2 font-mono text-gray-500 bg-gray-100">{fmtK(data.ytd.costosOtros)}</td>
                  </tr>

                  {/* EBITDA */}
                  <tr className="border-t-2 border-emerald-200 bg-emerald-50/40 font-bold">
                    <td className="px-3 py-2.5 text-emerald-700 sticky left-0 bg-emerald-50/40">= EBITDA</td>
                    {data.months.map((m) => (
                      <td key={m.month} className={`text-right px-2 py-2.5 font-mono ${m.ebitda >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                        {m.ventas > 0 ? (
                          <span>
                            {fmtK(m.ebitda)}
                            <span className="text-[10px] block font-normal">{fmtPct(m.ebitdaPct)}</span>
                          </span>
                        ) : "—"}
                      </td>
                    ))}
                    <td className={`text-right px-3 py-2.5 font-mono bg-emerald-100 ${data.ytd.ebitda >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                      {fmtK(data.ytd.ebitda)}
                      <span className="text-[10px] block font-normal">{fmtPct(data.ytd.ebitdaPct)}</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Detalle mes seleccionado */}
          {selectedMonthData && (
            <div className="bg-white rounded-xl border border-gray-100 p-4 mb-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-navy">
                  Detalle · {MONTH_NAMES[selectedMonthData.month - 1]} {year}
                </h2>
                <button onClick={() => setSelectedMonth(null)} className="text-xs text-gray-400 hover:text-navy">✕ cerrar</button>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                <div>
                  <div className="text-xs text-gray-500">Ventas</div>
                  <div className="text-lg font-semibold text-navy">{fmt(selectedMonthData.ventas)}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Órdenes</div>
                  <div className="text-lg font-semibold text-navy">{selectedMonthData.ordenes.toLocaleString("es-AR")}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Ticket promedio</div>
                  <div className="text-lg font-semibold text-navy">{fmt(selectedMonthData.ticketPromedio)}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">CMV</div>
                  <div className="text-lg font-semibold text-red-700">{fmtPct(selectedMonthData.cmvPct)}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">EBITDA margen</div>
                  <div className={`text-lg font-semibold ${selectedMonthData.ebitdaPct >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                    {fmtPct(selectedMonthData.ebitdaPct)}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Detalle de rubros por categoria */}
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
              <h2 className="text-sm font-semibold text-navy">Detalle por rubro · YTD {year}</h2>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 divide-y lg:divide-y-0 lg:divide-x divide-gray-100">
              {(["insumos", "sueldos", "alquilerServicios", "operativos", "impuestos", "financieros", "otros"] as Categoria[]).map((cat) => {
                const items = rubrosByCategoria[cat] || [];
                if (items.length === 0) return null;
                const catTotal = items.reduce((s, r) => s + r.total, 0);
                return (
                  <div key={cat} className="p-4">
                    <div className="flex items-baseline justify-between mb-2">
                      <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: CATEGORIA_COLOR[cat] }}>
                        {CATEGORIA_LABEL[cat]}
                      </div>
                      <div className="text-xs font-mono text-gray-600">{fmt(catTotal)}</div>
                    </div>
                    <div className="space-y-1">
                      {items.slice(0, 8).map((r) => {
                        const pct = catTotal > 0 ? (r.total / catTotal) * 100 : 0;
                        return (
                          <div key={r.rubro} className="flex items-baseline justify-between text-xs">
                            <span className="text-gray-600 truncate flex-1">{r.rubro || "(sin rubro)"}</span>
                            <span className="font-mono text-gray-500 ml-2">{fmt(r.total)}</span>
                            <span className="text-gray-400 ml-2 w-12 text-right">{pct.toFixed(0)}%</span>
                          </div>
                        );
                      })}
                      {items.length > 8 && (
                        <div className="text-xs text-gray-400 italic">+ {items.length - 8} rubros más</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
