"use client";

import { useState, useEffect, useMemo } from "react";
import Header from "@/components/Header";
import Navigation from "@/components/Navigation";
import ErrorBanner from "@/components/ErrorBanner";
import { ConsumptionData, SucursalId } from "@/types";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  LineChart,
  Line,
} from "recharts";

const SUCURSAL_COLORS: Record<string, string> = {
  palermo: "#2E6DA4",
  belgrano: "#10B981",
  puerto: "#8B5CF6",
};

function formatMonth(ym: string): string {
  const [year, month] = ym.split("-");
  const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  return `${months[parseInt(month) - 1]} ${year.slice(2)}`;
}

function TrendBadge({ trend }: { trend: number }) {
  if (trend > 10) return <span className="text-xs px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">▲ {trend.toFixed(0)}%</span>;
  if (trend < -10) return <span className="text-xs px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">▼ {Math.abs(trend).toFixed(0)}%</span>;
  return <span className="text-xs px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">estable</span>;
}

function MiniSparkline({ data, months }: { data: Record<string, number>; months: string[] }) {
  const values = months.map((m) => data[m] || 0);
  const max = Math.max(...values, 1);
  const width = 80;
  const height = 24;
  const points = values.map((v, i) => ({
    x: (i / Math.max(values.length - 1, 1)) * width,
    y: height - (v / max) * (height - 4) - 2,
  }));
  const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  // Color based on trend
  const first = values[0] || 0;
  const last = values[values.length - 1] || 0;
  const color = last > first ? "#10B981" : last < first ? "#EF4444" : "#6B7280";

  return (
    <svg width={width} height={height} className="inline-block">
      <path d={pathD} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {/* Dot on last point */}
      <circle cx={points[points.length - 1]?.x || 0} cy={points[points.length - 1]?.y || 0} r="2.5" fill={color} />
    </svg>
  );
}

export default function ConsumoPage() {
  const [data, setData] = useState<ConsumptionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [sucursalFilter, setSucursalFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch("/api/fudo/consumo");
        if (res.status === 401) { window.location.href = "/login"; return; }
        if (res.ok) setData(await res.json());
      } catch (error) {
        console.error("Error fetching consumption data:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const availableCategories = useMemo(() => {
    if (!data) return [];
    return data.categories.map((c) => c.categoryName).sort();
  }, [data]);

  // Deduplicate months (fix for duplicate month keys)
  const uniqueMonths = useMemo(() => {
    if (!data) return [];
    return Array.from(new Set(data.months)).sort();
  }, [data]);

  const filteredProducts = useMemo(() => {
    if (!data) return [];
    let products = data.products;
    if (categoryFilter !== "all") {
      products = products.filter((p) => p.categoryName === categoryFilter);
    }
    if (sucursalFilter !== "all") {
      products = products
        .filter((p) => p.bySucursal[sucursalFilter as SucursalId] > 0)
        .sort((a, b) => b.bySucursal[sucursalFilter as SucursalId] - a.bySucursal[sucursalFilter as SucursalId]);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      products = products.filter((p) => p.name.toLowerCase().includes(q));
    }
    return products;
  }, [data, categoryFilter, sucursalFilter, search]);

  // Summary stats
  const stats = useMemo(() => {
    if (!data || !uniqueMonths.length) return null;
    const currentMonth = uniqueMonths[uniqueMonths.length - 1];
    const prevMonth = uniqueMonths.length > 1 ? uniqueMonths[uniqueMonths.length - 2] : null;
    const totalThisMonth = filteredProducts.reduce((s, p) => s + (p.monthlyData[currentMonth] || 0), 0);
    const totalPrevMonth = prevMonth ? filteredProducts.reduce((s, p) => s + (p.monthlyData[prevMonth] || 0), 0) : 0;
    const totalAll = filteredProducts.reduce((s, p) => s + p.totalQuantity, 0);
    const uniqueProducts = filteredProducts.length;
    const growthPct = totalPrevMonth > 0 ? ((totalThisMonth - totalPrevMonth) / totalPrevMonth) * 100 : 0;
    // Top category
    const catTotals: Record<string, number> = {};
    filteredProducts.forEach((p) => { catTotals[p.categoryName] = (catTotals[p.categoryName] || 0) + p.totalQuantity; });
    const topCat = Object.entries(catTotals).sort((a, b) => b[1] - a[1])[0];

    return { totalThisMonth, totalPrevMonth, totalAll, uniqueProducts, growthPct, currentMonth, topCat };
  }, [filteredProducts, data, uniqueMonths]);

  // Selected product detail
  const selectedProductData = useMemo(() => {
    if (!selectedProduct || !data) return null;
    return data.products.find((p) => p.name === selectedProduct) || null;
  }, [selectedProduct, data]);

  // Product trend chart for selected product
  const productTrendData = useMemo(() => {
    if (!selectedProductData) return [];
    return uniqueMonths.map((m) => ({
      month: formatMonth(m),
      palermo: 0, belgrano: 0, puerto: 0,
      total: selectedProductData.monthlyData[m] || 0,
    }));
  }, [selectedProductData, uniqueMonths]);

  // Sucursal comparison for top products
  const sucursalCompData = useMemo(() => {
    return filteredProducts.slice(0, 12).map((p) => ({
      name: p.name.length > 22 ? p.name.substring(0, 22) + "..." : p.name,
      fullName: p.name,
      palermo: p.bySucursal.palermo,
      belgrano: p.bySucursal.belgrano,
      puerto: p.bySucursal.puerto,
    }));
  }, [filteredProducts]);

  const CHART_COLORS = ["#2E6DA4", "#10B981", "#8B5CF6", "#F59E0B", "#EF4444", "#6366F1", "#EC4899", "#14B8A6"];

  const displayLimit = showAll ? filteredProducts.length : 30;

  if (loading) {
    return (
      <div className="min-h-screen bg-bg-main">
        <Header connectedCount={3} errors={[]} />
        <Navigation />
        <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[1,2,3,4].map(i => <div key={i} className="skeleton h-20 rounded-xl" />)}
          </div>
          <div className="skeleton h-12 w-full rounded-xl" />
          <div className="skeleton h-64 w-full rounded-xl" />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-main">
      <Header connectedCount={3} errors={data?.errors || []} />
      <Navigation />

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <ErrorBanner errors={data?.errors || []} />

        {/* Summary KPI Cards */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="kpi-card">
              <span className="kpi-label">Unidades este mes</span>
              <span className="kpi-value">{stats.totalThisMonth.toLocaleString("es-AR")}</span>
              <span className="text-xs text-gray-400">{formatMonth(stats.currentMonth)}</span>
            </div>
            <div className="kpi-card">
              <span className="kpi-label">vs mes anterior</span>
              <span className="kpi-value">
                <span className={stats.growthPct >= 0 ? "text-green-600" : "text-red-500"}>
                  {stats.growthPct >= 0 ? "+" : ""}{stats.growthPct.toFixed(0)}%
                </span>
              </span>
              <span className="text-xs text-gray-400">{stats.totalPrevMonth.toLocaleString("es-AR")} uds prev</span>
            </div>
            <div className="kpi-card">
              <span className="kpi-label">Total 6 meses</span>
              <span className="kpi-value">{stats.totalAll.toLocaleString("es-AR")}</span>
              <span className="text-xs text-gray-400">{stats.uniqueProducts} productos</span>
            </div>
            <div className="kpi-card">
              <span className="kpi-label">Top categoria</span>
              <span className="kpi-value text-base">{stats.topCat?.[0] || "—"}</span>
              <span className="text-xs text-gray-400">{stats.topCat?.[1]?.toLocaleString("es-AR")} uds</span>
            </div>
          </div>
        )}

        {/* Filters + Search */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <label className="text-xs text-gray-500 block mb-1">Buscar producto</label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Ej: alfajor, bocha, cerveza..."
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-accent"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Categoria</label>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 bg-white"
            >
              <option value="all">Todas</option>
              {availableCategories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Sucursal</label>
            <select
              value={sucursalFilter}
              onChange={(e) => setSucursalFilter(e.target.value)}
              className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 bg-white"
            >
              <option value="all">Todas</option>
              <option value="palermo">Palermo</option>
              <option value="belgrano">Belgrano</option>
              <option value="puerto">Puerto Madero</option>
            </select>
          </div>
          <div className="text-xs text-gray-400 self-end pb-1.5">
            {filteredProducts.length} productos
          </div>
        </div>

        {/* Product detail panel (when a product is selected) */}
        {selectedProductData && (
          <div className="card border-2 border-blue-accent animate-in">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold text-lg">{selectedProductData.name}</h3>
                <span className="text-xs text-gray-400">{selectedProductData.categoryName}</span>
              </div>
              <button
                onClick={() => setSelectedProduct(null)}
                className="text-gray-400 hover:text-gray-600 text-lg px-2"
              >✕</button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <p className="text-xs text-gray-500">Total 6 meses</p>
                <p className="text-xl font-bold">{selectedProductData.totalQuantity}</p>
              </div>
              <div className="bg-blue-50 rounded-lg p-3 text-center">
                <p className="text-xs text-gray-500">Palermo</p>
                <p className="text-xl font-bold" style={{ color: "#2E6DA4" }}>{selectedProductData.bySucursal.palermo}</p>
              </div>
              <div className="bg-green-50 rounded-lg p-3 text-center">
                <p className="text-xs text-gray-500">Belgrano</p>
                <p className="text-xl font-bold" style={{ color: "#10B981" }}>{selectedProductData.bySucursal.belgrano}</p>
              </div>
              <div className="bg-purple-50 rounded-lg p-3 text-center">
                <p className="text-xs text-gray-500">Puerto Madero</p>
                <p className="text-xl font-bold" style={{ color: "#8B5CF6" }}>{selectedProductData.bySucursal.puerto}</p>
              </div>
            </div>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={productTrendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(v: number) => [`${v} uds`, "Cantidad"]} />
                  <Line type="monotone" dataKey="total" stroke="#1B2A4A" strokeWidth={2.5} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            {/* Monthly breakdown */}
            <div className="flex gap-2 mt-3 flex-wrap">
              {uniqueMonths.map((m) => (
                <div key={m} className="bg-gray-50 rounded-lg px-3 py-1.5 text-center min-w-[60px]">
                  <p className="text-[10px] text-gray-400">{formatMonth(m)}</p>
                  <p className="text-sm font-bold">{selectedProductData.monthlyData[m] || 0}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Main ranking table */}
        <div className="card">
          <h3 className="font-semibold text-lg mb-1">
            Consumo por producto
            {categoryFilter !== "all" && <span className="text-sm font-normal text-gray-400 ml-2">({categoryFilter})</span>}
          </h3>
          <p className="text-xs text-gray-400 mb-4">Click en un producto para ver el detalle por sucursal</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-navy/10">
                  <th className="text-left py-2.5 px-2 font-medium text-gray-500 w-8">#</th>
                  <th className="text-left py-2.5 px-2 font-medium text-gray-500">Producto</th>
                  <th className="text-left py-2.5 px-2 font-medium text-gray-500 hidden sm:table-cell">Categoria</th>
                  <th className="text-right py-2.5 px-2 font-medium text-gray-500">Total</th>
                  <th className="text-center py-2.5 px-2 font-medium text-gray-500">Tend.</th>
                  <th className="text-center py-2.5 px-2 font-medium text-gray-500 hidden md:table-cell">6m</th>
                  {uniqueMonths.map((m) => (
                    <th key={m} className="text-right py-2.5 px-2 font-medium text-gray-500 whitespace-nowrap">
                      {formatMonth(m)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredProducts.slice(0, displayLimit).map((p, i) => {
                  const isSelected = selectedProduct === p.name;
                  const qty = sucursalFilter !== "all"
                    ? p.bySucursal[sucursalFilter as SucursalId]
                    : p.totalQuantity;
                  return (
                    <tr
                      key={p.name}
                      onClick={() => setSelectedProduct(isSelected ? null : p.name)}
                      className={`border-b border-card-border last:border-0 cursor-pointer transition-colors ${
                        isSelected ? "bg-blue-50" : "hover:bg-gray-50"
                      }`}
                    >
                      <td className="py-2 px-2 font-mono text-gray-300 text-xs">{i + 1}</td>
                      <td className="py-2 px-2 font-medium max-w-[200px]">
                        <span className="truncate block">{p.name}</span>
                      </td>
                      <td className="py-2 px-2 text-gray-400 text-xs hidden sm:table-cell">{p.categoryName}</td>
                      <td className="py-2 px-2 text-right font-mono font-bold text-navy">
                        {qty.toLocaleString("es-AR")}
                      </td>
                      <td className="py-2 px-2 text-center">
                        <TrendBadge trend={p.trend} />
                      </td>
                      <td className="py-2 px-2 text-center hidden md:table-cell">
                        <MiniSparkline data={p.monthlyData} months={uniqueMonths} />
                      </td>
                      {uniqueMonths.map((m) => {
                        const val = p.monthlyData[m] || 0;
                        const maxVal = Math.max(...uniqueMonths.map(mm => p.monthlyData[mm] || 0), 1);
                        const intensity = val / maxVal;
                        return (
                          <td key={m} className="py-2 px-2 text-right font-mono relative">
                            <span className={`relative z-10 ${val === 0 ? "text-gray-300" : "text-gray-700"}`}>
                              {val === 0 ? "—" : val.toLocaleString("es-AR")}
                            </span>
                            {val > 0 && (
                              <div
                                className="absolute inset-0 bg-blue-100 opacity-30 rounded-sm"
                                style={{ width: `${intensity * 100}%`, right: 0, left: "auto" }}
                              />
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {filteredProducts.length > 30 && !showAll && (
            <button
              onClick={() => setShowAll(true)}
              className="w-full mt-3 py-2 text-sm text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors"
            >
              Ver todos ({filteredProducts.length} productos)
            </button>
          )}
          {showAll && filteredProducts.length > 30 && (
            <button
              onClick={() => setShowAll(false)}
              className="w-full mt-3 py-2 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
            >
              Mostrar menos
            </button>
          )}
        </div>

        {/* Low movement / dying products */}
        {data && data.lowMovement && data.lowMovement.length > 0 && (
          <div className="card border-l-4 border-l-red-400">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xl">⚠️</span>
              <h3 className="font-semibold text-lg">Productos sin movimiento</h3>
            </div>
            <p className="text-xs text-gray-400 mb-4">
              Productos que dejaron de venderse o bajaron mas del 50%. Considerar quitar de la carta o del stock.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {data.lowMovement.slice(0, 15).map((p) => (
                <div key={p.name} className="bg-red-50 border border-red-100 rounded-lg p-3">
                  <div className="flex items-start justify-between">
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{p.name}</p>
                      <p className="text-xs text-gray-400">{p.categoryName}</p>
                    </div>
                    <span className="text-xs px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 whitespace-nowrap ml-2">
                      {p.monthsWithoutSales > 0
                        ? `${p.monthsWithoutSales} mes${p.monthsWithoutSales > 1 ? "es" : ""} sin venta`
                        : "▼ cayendo"}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                    <span>Total historico: {p.totalQuantity} uds</span>
                    {p.lastSoldMonth && <span>Ultima venta: {formatMonth(p.lastSoldMonth)}</span>}
                  </div>
                </div>
              ))}
            </div>
            {data.lowMovement.length > 15 && (
              <p className="text-xs text-gray-400 mt-3 text-center">
                +{data.lowMovement.length - 15} productos mas sin movimiento
              </p>
            )}
          </div>
        )}

        {/* Sucursal comparison */}
        <div className="card">
          <h3 className="font-semibold text-lg mb-4">Comparativo por sucursal (top 12)</h3>
          <div className="h-[450px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sucursalCompData} layout="vertical" margin={{ left: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={130} />
                <Tooltip
                  formatter={(value: number, name: string) => [`${value} uds`, name]}
                />
                <Legend />
                <Bar dataKey="palermo" name="Palermo" fill={SUCURSAL_COLORS.palermo} stackId="suc" />
                <Bar dataKey="belgrano" name="Belgrano" fill={SUCURSAL_COLORS.belgrano} stackId="suc" />
                <Bar dataKey="puerto" name="Puerto Madero" fill={SUCURSAL_COLORS.puerto} stackId="suc" radius={[0, 2, 2, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </main>

      <footer className="text-center py-6 text-xs text-gray-400">
        Masunori Dashboard v1.0
      </footer>
    </div>
  );
}
