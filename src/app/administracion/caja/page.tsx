"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend, ReferenceLine,
} from "recharts";

type Bucket = "efectivo" | "tarjeta" | "mp" | "transferencia" | "cuentaCte" | "otro";

interface DayCash {
  date: string;
  ingresos: Record<Bucket, number>;
  ingresosTotal: number;
  ordenes: number;
  egresos: Record<Bucket, number>;
  egresosTotal: number;
  neto: number;
}

interface ApiResponse {
  sucursal: string;
  year: string;
  month: string;
  days: DayCash[];
  totals: {
    ingresos: Record<Bucket, number>;
    ingresosTotal: number;
    ordenes: number;
    egresos: Record<Bucket, number>;
    egresosTotal: number;
    neto: number;
  };
  topEgresos: Array<{ date: string; total: number; bucket: Bucket; proveedor: string; rubro: string; metodoPago: string }>;
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
const MONTHS = [
  { v: "01", n: "Enero" }, { v: "02", n: "Febrero" }, { v: "03", n: "Marzo" }, { v: "04", n: "Abril" },
  { v: "05", n: "Mayo" }, { v: "06", n: "Junio" }, { v: "07", n: "Julio" }, { v: "08", n: "Agosto" },
  { v: "09", n: "Septiembre" }, { v: "10", n: "Octubre" }, { v: "11", n: "Noviembre" }, { v: "12", n: "Diciembre" },
];

const BUCKET_LABEL: Record<Bucket, string> = {
  efectivo: "Efectivo",
  tarjeta: "Tarjeta",
  mp: "MP",
  transferencia: "Transferencia",
  cuentaCte: "Cta. Cte",
  otro: "Otro",
};
const BUCKET_COLOR: Record<Bucket, string> = {
  efectivo: "#10B981",
  tarjeta: "#2E6DA4",
  mp: "#06B6D4",
  transferencia: "#8B5CF6",
  cuentaCte: "#F59E0B",
  otro: "#6B7280",
};

function fmt(n: number): string {
  return "$" + Math.round(n).toLocaleString("es-AR");
}
function fmtK(n: number): string {
  if (Math.abs(n) >= 1000000) return "$" + (n / 1000000).toFixed(1) + "M";
  if (Math.abs(n) >= 1000) return "$" + Math.round(n / 1000) + "k";
  return "$" + Math.round(n);
}
function dayOfMonth(date: string): number {
  return parseInt(date.substring(8, 10));
}

export default function CajaPage() {
  const [year, setYear] = useState<"2025" | "2026">("2026");
  const today = new Date();
  const [month, setMonth] = useState<string>(String(today.getMonth() + 1).padStart(2, "0"));
  const [sucursal, setSucursal] = useState<string>("palermo");
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setSelectedDay(null);
    fetch(`/api/erp/caja?sucursal=${sucursal}&year=${year}&month=${month}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setData(d);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [sucursal, year, month]);

  const chartData = useMemo(() => {
    if (!data) return [];
    return data.days.map((d) => ({
      day: dayOfMonth(d.date),
      ingresos: d.ingresosTotal,
      egresos: -d.egresosTotal,
      neto: d.neto,
    }));
  }, [data]);

  const selectedDayData = useMemo(() => {
    if (!data || !selectedDay) return null;
    return data.days.find((d) => d.date === selectedDay) || null;
  }, [data, selectedDay]);

  const egresosForDay = useMemo(() => {
    if (!data || !selectedDay) return [];
    return data.topEgresos.filter((e) => e.date === selectedDay).sort((a, b) => b.total - a.total);
  }, [data, selectedDay]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="mb-4">
        <Link href="/administracion" className="text-sm text-gray-400 hover:text-blue-accent">
          ← Volver a Administración
        </Link>
        <h1 className="text-2xl font-bold text-navy mt-2">Caja diaria · {SUC_NAMES[sucursal]} · {MONTHS.find((m) => m.v === month)?.n} {year}</h1>
        <p className="text-xs text-gray-400 mt-1">
          Ingresos de Fudo (por método de pago) vs egresos pagados (por método) · neto diario
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
        <select value={month} onChange={(e) => setMonth(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
          {MONTHS.map((m) => <option key={m.v} value={m.v}>{m.n}</option>)}
        </select>
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

      {loading && <div className="text-center py-20 text-gray-400">Cargando caja...</div>}
      {error && <div className="bg-red-50 text-red-700 rounded-lg p-4 mb-4">Error: {error}</div>}

      {data && !loading && (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <div className="bg-white rounded-xl border border-emerald-100 p-4">
              <div className="text-xs text-emerald-600 uppercase tracking-wide mb-1">Ingresos</div>
              <div className="text-xl font-bold text-emerald-700">{fmt(data.totals.ingresosTotal)}</div>
              <div className="text-xs text-gray-400 mt-1">{data.totals.ordenes.toLocaleString("es-AR")} órdenes</div>
            </div>
            <div className="bg-white rounded-xl border border-red-100 p-4">
              <div className="text-xs text-red-600 uppercase tracking-wide mb-1">Egresos pagados</div>
              <div className="text-xl font-bold text-red-700">{fmt(data.totals.egresosTotal)}</div>
              <div className="text-xs text-gray-400 mt-1">cash real del mes</div>
            </div>
            <div className={`bg-white rounded-xl border p-4 ${data.totals.neto >= 0 ? "border-blue-100" : "border-red-200"}`}>
              <div className={`text-xs uppercase tracking-wide mb-1 ${data.totals.neto >= 0 ? "text-blue-accent" : "text-red-600"}`}>Neto del mes</div>
              <div className={`text-xl font-bold ${data.totals.neto >= 0 ? "text-blue-accent" : "text-red-700"}`}>{fmt(data.totals.neto)}</div>
              <div className="text-xs text-gray-400 mt-1">ingresos - egresos</div>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Días con info</div>
              <div className="text-xl font-bold text-navy">{data.days.filter((d) => d.ingresosTotal > 0 || d.egresosTotal > 0).length}</div>
              <div className="text-xs text-gray-400 mt-1">de {data.days.length}</div>
            </div>
          </div>

          {/* Chart */}
          <div className="bg-white rounded-xl border border-gray-100 p-4 mb-4">
            <h2 className="text-sm font-semibold text-navy uppercase tracking-wide mb-3">Flujo diario · Click en un día para ver detalle</h2>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart
                data={chartData}
                onClick={(d) => {
                  if (d?.activePayload?.[0]?.payload?.day) {
                    const day = d.activePayload[0].payload.day;
                    setSelectedDay(`${year}-${month}-${String(day).padStart(2, "0")}`);
                  }
                }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="day" fontSize={11} />
                <YAxis fontSize={11} tickFormatter={fmtK} />
                <Tooltip formatter={(v: number, name: string) => {
                  if (name === "egresos") return [fmt(Math.abs(v)), "Egresos"];
                  return [fmt(v), name === "ingresos" ? "Ingresos" : "Neto"];
                }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <ReferenceLine y={0} stroke="#94a3b8" />
                <Bar dataKey="ingresos" fill="#10B981" name="Ingresos" />
                <Bar dataKey="egresos" fill="#EF4444" name="Egresos" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            {/* Breakdown ingresos por método */}
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <h2 className="text-sm font-semibold text-emerald-700 uppercase tracking-wide mb-3">Ingresos por método</h2>
              <div className="space-y-2">
                {(Object.entries(data.totals.ingresos) as [Bucket, number][])
                  .filter(([, v]) => v > 0)
                  .sort(([, a], [, b]) => b - a)
                  .map(([bucket, total]) => {
                    const pct = data.totals.ingresosTotal > 0 ? (total / data.totals.ingresosTotal) * 100 : 0;
                    return (
                      <div key={bucket}>
                        <div className="flex items-baseline justify-between text-sm mb-1">
                          <span className="text-navy font-medium">{BUCKET_LABEL[bucket]}</span>
                          <span className="text-gray-600 font-mono text-xs">{fmt(total)} <span className="text-gray-400">({pct.toFixed(1)}%)</span></span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: BUCKET_COLOR[bucket] }} />
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>

            {/* Breakdown egresos por método */}
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <h2 className="text-sm font-semibold text-red-700 uppercase tracking-wide mb-3">Egresos por método</h2>
              <div className="space-y-2">
                {(Object.entries(data.totals.egresos) as [Bucket, number][])
                  .filter(([, v]) => v > 0)
                  .sort(([, a], [, b]) => b - a)
                  .map(([bucket, total]) => {
                    const pct = data.totals.egresosTotal > 0 ? (total / data.totals.egresosTotal) * 100 : 0;
                    return (
                      <div key={bucket}>
                        <div className="flex items-baseline justify-between text-sm mb-1">
                          <span className="text-navy font-medium">{BUCKET_LABEL[bucket]}</span>
                          <span className="text-gray-600 font-mono text-xs">{fmt(total)} <span className="text-gray-400">({pct.toFixed(1)}%)</span></span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: BUCKET_COLOR[bucket] }} />
                        </div>
                      </div>
                    );
                  })}
                {data.totals.egresosTotal === 0 && (
                  <div className="text-xs text-gray-400 italic">No hay egresos pagados este mes</div>
                )}
              </div>
            </div>
          </div>

          {/* Tabla diaria */}
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden mb-4">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 border-b border-gray-100 sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold text-gray-600 uppercase">Día</th>
                    <th className="text-right px-2 py-2 font-semibold text-emerald-700 uppercase">Ingresos</th>
                    <th className="text-right px-2 py-2 font-semibold text-emerald-700 uppercase">Efectivo</th>
                    <th className="text-right px-2 py-2 font-semibold text-emerald-700 uppercase">Tarjeta</th>
                    <th className="text-right px-2 py-2 font-semibold text-emerald-700 uppercase">MP</th>
                    <th className="text-right px-2 py-2 font-semibold text-emerald-700 uppercase">Transf</th>
                    <th className="text-right px-2 py-2 font-semibold text-red-600 uppercase">Egresos</th>
                    <th className="text-right px-2 py-2 font-semibold text-red-600 uppercase">Efe</th>
                    <th className="text-right px-2 py-2 font-semibold text-red-600 uppercase">Tarj</th>
                    <th className="text-right px-2 py-2 font-semibold text-red-600 uppercase">MP</th>
                    <th className="text-right px-2 py-2 font-semibold text-red-600 uppercase">Trans</th>
                    <th className="text-right px-3 py-2 font-semibold text-blue-accent uppercase">Neto</th>
                  </tr>
                </thead>
                <tbody>
                  {data.days.map((d) => {
                    const day = dayOfMonth(d.date);
                    const empty = d.ingresosTotal === 0 && d.egresosTotal === 0;
                    const isSelected = selectedDay === d.date;
                    return (
                      <tr
                        key={d.date}
                        onClick={() => !empty && setSelectedDay(isSelected ? null : d.date)}
                        className={`border-b border-gray-50 ${empty ? "opacity-40" : "cursor-pointer hover:bg-gray-50"} ${isSelected ? "bg-blue-50" : ""}`}
                      >
                        <td className="px-3 py-1.5 font-medium text-navy">{day}</td>
                        <td className="text-right px-2 py-1.5 font-mono text-emerald-700">{d.ingresosTotal > 0 ? fmtK(d.ingresosTotal) : "—"}</td>
                        <td className="text-right px-2 py-1.5 font-mono text-emerald-600">{d.ingresos.efectivo > 0 ? fmtK(d.ingresos.efectivo) : ""}</td>
                        <td className="text-right px-2 py-1.5 font-mono text-emerald-600">{d.ingresos.tarjeta > 0 ? fmtK(d.ingresos.tarjeta) : ""}</td>
                        <td className="text-right px-2 py-1.5 font-mono text-emerald-600">{d.ingresos.mp > 0 ? fmtK(d.ingresos.mp) : ""}</td>
                        <td className="text-right px-2 py-1.5 font-mono text-emerald-600">{d.ingresos.transferencia > 0 ? fmtK(d.ingresos.transferencia) : ""}</td>
                        <td className="text-right px-2 py-1.5 font-mono text-red-700">{d.egresosTotal > 0 ? fmtK(d.egresosTotal) : "—"}</td>
                        <td className="text-right px-2 py-1.5 font-mono text-red-600">{d.egresos.efectivo > 0 ? fmtK(d.egresos.efectivo) : ""}</td>
                        <td className="text-right px-2 py-1.5 font-mono text-red-600">{d.egresos.tarjeta > 0 ? fmtK(d.egresos.tarjeta) : ""}</td>
                        <td className="text-right px-2 py-1.5 font-mono text-red-600">{d.egresos.mp > 0 ? fmtK(d.egresos.mp) : ""}</td>
                        <td className="text-right px-2 py-1.5 font-mono text-red-600">{d.egresos.transferencia > 0 ? fmtK(d.egresos.transferencia) : ""}</td>
                        <td className={`text-right px-3 py-1.5 font-mono font-semibold ${d.neto >= 0 ? "text-blue-accent" : "text-red-700"}`}>
                          {empty ? "—" : fmtK(d.neto)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-gray-50 border-t-2 border-gray-200 font-semibold">
                  <tr>
                    <td className="px-3 py-2 text-navy">Total</td>
                    <td className="text-right px-2 py-2 font-mono text-emerald-700">{fmtK(data.totals.ingresosTotal)}</td>
                    <td className="text-right px-2 py-2 font-mono text-emerald-600">{fmtK(data.totals.ingresos.efectivo)}</td>
                    <td className="text-right px-2 py-2 font-mono text-emerald-600">{fmtK(data.totals.ingresos.tarjeta)}</td>
                    <td className="text-right px-2 py-2 font-mono text-emerald-600">{fmtK(data.totals.ingresos.mp)}</td>
                    <td className="text-right px-2 py-2 font-mono text-emerald-600">{fmtK(data.totals.ingresos.transferencia)}</td>
                    <td className="text-right px-2 py-2 font-mono text-red-700">{fmtK(data.totals.egresosTotal)}</td>
                    <td className="text-right px-2 py-2 font-mono text-red-600">{fmtK(data.totals.egresos.efectivo)}</td>
                    <td className="text-right px-2 py-2 font-mono text-red-600">{fmtK(data.totals.egresos.tarjeta)}</td>
                    <td className="text-right px-2 py-2 font-mono text-red-600">{fmtK(data.totals.egresos.mp)}</td>
                    <td className="text-right px-2 py-2 font-mono text-red-600">{fmtK(data.totals.egresos.transferencia)}</td>
                    <td className={`text-right px-3 py-2 font-mono ${data.totals.neto >= 0 ? "text-blue-accent" : "text-red-700"}`}>{fmtK(data.totals.neto)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Detalle del día seleccionado */}
          {selectedDayData && (
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-navy">Detalle · {selectedDayData.date}</h2>
                <button onClick={() => setSelectedDay(null)} className="text-xs text-gray-400 hover:text-navy">✕ cerrar</button>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div>
                  <div className="text-xs font-semibold text-emerald-700 uppercase mb-2">Ingresos {fmt(selectedDayData.ingresosTotal)}</div>
                  <div className="space-y-1 text-sm">
                    {(Object.entries(selectedDayData.ingresos) as [Bucket, number][])
                      .filter(([, v]) => v > 0)
                      .sort(([, a], [, b]) => b - a)
                      .map(([b, v]) => (
                        <div key={b} className="flex justify-between">
                          <span className="text-gray-600">{BUCKET_LABEL[b]}</span>
                          <span className="font-mono text-emerald-600">{fmt(v)}</span>
                        </div>
                      ))}
                    <div className="text-xs text-gray-400 pt-1">{selectedDayData.ordenes} órdenes</div>
                  </div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-red-700 uppercase mb-2">Egresos {fmt(selectedDayData.egresosTotal)}</div>
                  <div className="space-y-1 text-sm">
                    {(Object.entries(selectedDayData.egresos) as [Bucket, number][])
                      .filter(([, v]) => v > 0)
                      .sort(([, a], [, b]) => b - a)
                      .map(([b, v]) => (
                        <div key={b} className="flex justify-between">
                          <span className="text-gray-600">{BUCKET_LABEL[b]}</span>
                          <span className="font-mono text-red-600">{fmt(v)}</span>
                        </div>
                      ))}
                    {selectedDayData.egresosTotal === 0 && <div className="text-xs text-gray-400">Sin egresos</div>}
                  </div>
                </div>
                <div>
                  <div className={`text-xs font-semibold uppercase mb-2 ${selectedDayData.neto >= 0 ? "text-blue-accent" : "text-red-700"}`}>Neto del día</div>
                  <div className={`text-2xl font-bold ${selectedDayData.neto >= 0 ? "text-blue-accent" : "text-red-700"}`}>
                    {fmt(selectedDayData.neto)}
                  </div>
                </div>
              </div>

              {egresosForDay.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <div className="text-xs font-semibold text-gray-600 uppercase mb-2">Egresos del día ({egresosForDay.length})</div>
                  <div className="space-y-1 text-xs">
                    {egresosForDay.map((e, i) => (
                      <div key={i} className="flex items-center justify-between py-1 border-b border-gray-50">
                        <div className="flex-1">
                          <span className="text-navy font-medium">{e.proveedor}</span>
                          <span className="text-gray-400 ml-2">{e.rubro}</span>
                        </div>
                        <span className="text-gray-500 mx-3 text-[10px]">{e.metodoPago}</span>
                        <span className="font-mono text-red-600">{fmt(e.total)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
