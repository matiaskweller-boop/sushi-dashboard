"use client";

import { useState, useEffect, useMemo, Fragment } from "react";
import Link from "next/link";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend,
} from "recharts";
import { format } from "date-fns";

interface DescuentoRow {
  saleId: string;
  fecha: string;
  cliente: string;
  bruto: number;
  neto: number;
  descuento: number;
  pct: number;
  itemsCount: number;
  itemsDetail: Array<{ name: string; price: number; quantity: number; subtotal: number }>;
  metodoPago: string;
  saleType: string;
}

interface ApiResponse {
  sucursal: string;
  from: string;
  to: string;
  ventas: DescuentoRow[];
  total: number;
  totalDescuentos: number;
  totalBruto: number;
  totalNeto: number;
  pctPromedio: number;
  ventasTotal: number;
  pctConDescuento: number;
  byMonth: Record<string, { count: number; total: number }>;
  byPctBucket: Record<string, { count: number; total: number }>;
  topMetodos: Array<{ metodo: string; count: number; total: number }>;
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
function fmtK(n: number): string {
  if (Math.abs(n) >= 1000000) return "$" + (n / 1000000).toFixed(1) + "M";
  if (Math.abs(n) >= 1000) return "$" + Math.round(n / 1000) + "k";
  return "$" + Math.round(n);
}

export default function DescuentosPage() {
  const today = new Date();
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(today.getDate() - 90);

  const [sucursal, setSucursal] = useState<string>("palermo");
  const [fromDate, setFromDate] = useState(format(ninetyDaysAgo, "yyyy-MM-dd"));
  const [toDate, setToDate] = useState(format(today, "yyyy-MM-dd"));
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [minPct, setMinPct] = useState<number>(0);
  const [expandedSale, setExpandedSale] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"descuento" | "pct" | "fecha">("descuento");

  const fetchData = () => {
    setLoading(true);
    setError(null);
    fetch(`/api/erp/descuentos?sucursal=${sucursal}&from=${fromDate}&to=${toDate}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setData(d);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [sucursal, fromDate, toDate]);

  const filtered = useMemo(() => {
    if (!data) return [];
    let items = data.ventas.filter((r) => r.pct >= minPct);
    if (search) {
      const q = search.toLowerCase();
      items = items.filter((r) =>
        r.saleId.toLowerCase().includes(q) ||
        r.metodoPago.toLowerCase().includes(q) ||
        r.cliente.toLowerCase().includes(q)
      );
    }
    if (sortBy === "descuento") items.sort((a, b) => b.descuento - a.descuento);
    else if (sortBy === "pct") items.sort((a, b) => b.pct - a.pct);
    else items.sort((a, b) => b.fecha.localeCompare(a.fecha));
    return items;
  }, [data, minPct, search, sortBy]);

  const filteredTotal = useMemo(() => filtered.reduce((s, r) => s + r.descuento, 0), [filtered]);

  const monthChartData = useMemo(() => {
    if (!data) return [];
    return Object.entries(data.byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, d]) => ({ month: month.substring(5, 7) + "/" + month.substring(2, 4), total: d.total, count: d.count }));
  }, [data]);

  const exportCsv = () => {
    if (!data) return;
    const headers = ["Fecha", "SaleID", "Bruto", "Neto", "Descuento", "% Descuento", "Método de Pago", "Items", "Tipo Venta"];
    const rows = filtered.map((r) => [
      format(new Date(r.fecha), "yyyy-MM-dd HH:mm"),
      r.saleId,
      Math.round(r.bruto),
      Math.round(r.neto),
      Math.round(r.descuento),
      r.pct.toFixed(1),
      r.metodoPago,
      r.itemsCount,
      r.saleType,
    ]);
    const csv = [headers, ...rows].map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Descuentos-${SUC_NAMES[sucursal]}-${fromDate}-a-${toDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="mb-4">
        <Link href="/administracion" className="text-sm text-gray-400 hover:text-blue-accent">
          ← Volver a Administración
        </Link>
        <h1 className="text-2xl font-bold text-navy mt-2">Descuentos · {SUC_NAMES[sucursal]}</h1>
        <p className="text-xs text-gray-400 mt-1">
          Detalle de cada venta donde el total cobrado fue menor al precio bruto de los items (descuentos a socios, promos, ajustes manuales)
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
        <input
          type="date"
          value={fromDate}
          onChange={(e) => setFromDate(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white"
        />
        <span className="text-gray-400">→</span>
        <input
          type="date"
          value={toDate}
          onChange={(e) => setToDate(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white"
        />
        <div className="ml-auto">
          <button
            onClick={exportCsv}
            disabled={!data}
            className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm text-navy hover:bg-blue-50 disabled:opacity-50"
          >
            📥 Exportar CSV
          </button>
        </div>
      </div>

      {loading && <div className="text-center py-20 text-gray-400">Cargando descuentos...</div>}
      {error && <div className="bg-red-50 text-red-700 rounded-lg p-4 mb-4">Error: {error}</div>}

      {data && !loading && (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <div className="bg-white rounded-xl border border-amber-100 p-4">
              <div className="text-xs text-amber-700 uppercase tracking-wide mb-1">Total Descuentos</div>
              <div className="text-xl font-bold text-amber-700">{fmt(data.totalDescuentos)}</div>
              <div className="text-xs text-gray-400 mt-1">{data.pctPromedio.toFixed(1)}% promedio</div>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Ventas con descuento</div>
              <div className="text-xl font-bold text-navy">{data.total}</div>
              <div className="text-xs text-gray-400 mt-1">{data.pctConDescuento.toFixed(1)}% del total ({data.ventasTotal})</div>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Bruto descontado</div>
              <div className="text-xl font-bold text-navy">{fmt(data.totalBruto)}</div>
              <div className="text-xs text-gray-400 mt-1">precio menú original</div>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Neto cobrado</div>
              <div className="text-xl font-bold text-navy">{fmt(data.totalNeto)}</div>
              <div className="text-xs text-gray-400 mt-1">lo que ingresó realmente</div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            {/* Chart por mes */}
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <h2 className="text-sm font-semibold text-navy uppercase tracking-wide mb-3">Descuentos por mes</h2>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={monthChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" fontSize={11} />
                  <YAxis fontSize={11} tickFormatter={fmtK} />
                  <Tooltip formatter={(v: number, n: string) => n === "count" ? `${v} ventas` : fmt(v)} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="total" fill="#F59E0B" name="Descuento $" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Distribución por % de descuento */}
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <h2 className="text-sm font-semibold text-navy uppercase tracking-wide mb-3">Distribución por % de descuento</h2>
              <div className="space-y-2">
                {Object.entries(data.byPctBucket).map(([bucket, d]) => {
                  const pct = data.totalDescuentos > 0 ? (d.total / data.totalDescuentos) * 100 : 0;
                  return (
                    <div key={bucket}>
                      <div className="flex items-baseline justify-between text-sm mb-1">
                        <span className="text-navy font-medium">{bucket}</span>
                        <span className="text-gray-500 font-mono text-xs">{d.count} vta · {fmt(d.total)}</span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-amber-400 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Top métodos de pago con descuentos */}
          {data.topMetodos.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 p-4 mb-4">
              <h2 className="text-sm font-semibold text-navy uppercase tracking-wide mb-3">Descuentos por método de pago</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                {data.topMetodos.slice(0, 12).map((m) => {
                  const pct = data.totalDescuentos > 0 ? (m.total / data.totalDescuentos) * 100 : 0;
                  return (
                    <div key={m.metodo} className="flex items-baseline justify-between text-sm bg-gray-50 px-3 py-2 rounded-lg">
                      <span className="text-navy font-medium truncate">{m.metodo}</span>
                      <div className="text-right ml-2">
                        <div className="text-gray-700 font-mono text-xs">{fmt(m.total)}</div>
                        <div className="text-[10px] text-gray-400">{m.count} vta · {pct.toFixed(0)}%</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Filtros tabla */}
          <div className="bg-white rounded-xl border border-gray-100 p-3 mb-2 flex flex-wrap gap-2 items-center">
            <input
              type="text"
              placeholder="Buscar SaleID, método, cliente..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm flex-1 min-w-[200px]"
            />
            <label className="flex items-center gap-2 text-xs text-gray-600">
              % min:
              <input
                type="number"
                value={minPct}
                onChange={(e) => setMinPct(parseFloat(e.target.value) || 0)}
                step="5"
                min="0"
                max="100"
                className="border border-gray-200 rounded-lg px-2 py-1 text-sm w-16"
              />
              %
            </label>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as "descuento" | "pct" | "fecha")} className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white">
              <option value="descuento">Mayor descuento $</option>
              <option value="pct">Mayor descuento %</option>
              <option value="fecha">Más reciente</option>
            </select>
            <span className="text-xs text-gray-400 ml-auto">
              {filtered.length} ventas · {fmt(filteredTotal)}
            </span>
          </div>

          {/* Tabla detalle */}
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100 sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-600 uppercase">Fecha</th>
                    <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-600 uppercase">Sale ID</th>
                    <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-600 uppercase">Tipo</th>
                    <th className="text-right px-3 py-2.5 text-xs font-semibold text-gray-600 uppercase">Bruto</th>
                    <th className="text-right px-3 py-2.5 text-xs font-semibold text-gray-600 uppercase">Neto</th>
                    <th className="text-right px-3 py-2.5 text-xs font-semibold text-amber-700 uppercase">Descuento</th>
                    <th className="text-right px-3 py-2.5 text-xs font-semibold text-amber-700 uppercase">%</th>
                    <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-600 uppercase">Método</th>
                    <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-600 uppercase">Items</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, 1000).map((r) => {
                    const isExp = expandedSale === r.saleId;
                    return (
                      <Fragment key={r.saleId}>
                        <tr
                          onClick={() => setExpandedSale(isExp ? null : r.saleId)}
                          className={`border-b border-gray-50 cursor-pointer ${isExp ? "bg-amber-50/40" : "hover:bg-gray-50"} ${r.pct >= 30 ? "bg-amber-50/20" : ""}`}
                        >
                          <td className="px-3 py-2 text-gray-600 text-xs whitespace-nowrap">{format(new Date(r.fecha), "dd/MM HH:mm")}</td>
                          <td className="px-3 py-2 text-gray-400 text-xs font-mono">{r.saleId}</td>
                          <td className="px-3 py-2 text-gray-500 text-xs">{r.saleType}</td>
                          <td className="px-3 py-2 text-right font-mono text-gray-500">{fmt(r.bruto)}</td>
                          <td className="px-3 py-2 text-right font-mono text-navy">{fmt(r.neto)}</td>
                          <td className="px-3 py-2 text-right font-mono text-amber-700 font-semibold">{fmt(r.descuento)}</td>
                          <td className="px-3 py-2 text-right font-semibold">
                            <span className={`px-1.5 py-0.5 rounded-md text-xs ${
                              r.pct >= 50 ? "bg-red-100 text-red-700" :
                              r.pct >= 30 ? "bg-amber-100 text-amber-700" :
                              r.pct >= 15 ? "bg-yellow-50 text-yellow-700" :
                              "bg-gray-50 text-gray-600"
                            }`}>
                              {r.pct.toFixed(1)}%
                            </span>
                          </td>
                          <td className="px-3 py-2 text-gray-500 text-xs max-w-[180px] truncate" title={r.metodoPago}>{r.metodoPago || "—"}</td>
                          <td className="px-3 py-2 text-center text-gray-500 text-xs">{r.itemsCount}</td>
                        </tr>
                        {isExp && (
                          <tr className="bg-amber-50/20 border-b border-amber-100">
                            <td colSpan={9} className="px-6 py-3">
                              <div className="text-xs font-semibold text-gray-600 uppercase mb-2">
                                Items de la venta · {r.itemsCount}
                              </div>
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="text-gray-500 text-[10px] uppercase border-b border-amber-100">
                                    <th className="text-left py-1">Cantidad</th>
                                    <th className="text-right py-1 w-24">Precio Unit</th>
                                    <th className="text-right py-1 w-32">Subtotal</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {r.itemsDetail.map((it, i) => (
                                    <tr key={i} className="border-b border-amber-50/50">
                                      <td className="py-1 text-navy">{it.quantity}× item</td>
                                      <td className="py-1 text-right font-mono text-gray-500">{fmt(it.price)}</td>
                                      <td className="py-1 text-right font-mono text-navy">{fmt(it.subtotal)}</td>
                                    </tr>
                                  ))}
                                  <tr className="border-t border-amber-200 font-semibold">
                                    <td className="py-1 text-navy">Total bruto items</td>
                                    <td></td>
                                    <td className="py-1 text-right font-mono text-navy">{fmt(r.bruto)}</td>
                                  </tr>
                                  <tr>
                                    <td className="py-1 text-amber-700">- Descuento</td>
                                    <td></td>
                                    <td className="py-1 text-right font-mono text-amber-700">{fmt(r.descuento)} ({r.pct.toFixed(1)}%)</td>
                                  </tr>
                                  <tr className="font-semibold">
                                    <td className="py-1 text-emerald-700">= Neto cobrado</td>
                                    <td></td>
                                    <td className="py-1 text-right font-mono text-emerald-700">{fmt(r.neto)}</td>
                                  </tr>
                                </tbody>
                              </table>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {filtered.length === 0 && (
              <div className="px-4 py-8 text-center text-sm text-gray-400">
                No hay ventas con descuento en el período seleccionado
              </div>
            )}
            {filtered.length > 1000 && (
              <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 text-xs text-gray-500 text-center">
                Mostrando primeras 1000. Usá filtros o exportá CSV para ver todas.
              </div>
            )}
          </div>

          <div className="text-xs text-gray-400 mt-3">
            Click en una fila para ver los items · color rojo: descuento ≥ 50% · ámbar: 30-50%
          </div>
        </>
      )}
    </div>
  );
}
