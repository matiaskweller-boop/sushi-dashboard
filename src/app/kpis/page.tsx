"use client";

import { useState, useEffect, useCallback } from "react";
import { format } from "date-fns";
import Header from "@/components/Header";
import Navigation from "@/components/Navigation";
import PeriodFilter from "@/components/PeriodFilter";
import ErrorBanner from "@/components/ErrorBanner";
import RevenueHeatmap from "@/components/RevenueHeatmap";
import ProductAnalytics from "@/components/ProductAnalytics";
import { PeriodFilter as PeriodFilterType, AdvancedKPIsData } from "@/types";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";

import { formatMoney as _formatMoney, formatMoneyShort as _formatMoneyShort } from "@/lib/format";
import { useCurrency } from "@/lib/CurrencyContext";

const EMPTY_DATA: AdvancedKPIsData = {
  global: {
    avgDurationMinutes: 0,
    avgPeoplePerOrder: 0,
    revpash: 0,
    avgItemsPerOrder: 0,
  },
  bySucursal: [],
  hourlyOrderCounts: [],
  canceledItemsRate: 0,
  totalItems: 0,
  canceledItems: 0,
  peopleDistribution: [],
  itemsPerPerson: 0,
  revenuePerMinute: 0,
  topProductConcentration: 0,
  lunchRevenue: 0,
  dinnerRevenue: 0,
  lunchOrders: 0,
  dinnerOrders: 0,
  peakHours: {},
  revenueHeatmap: [],
  errors: [],
  lastUpdated: "",
};

const SUCURSAL_NAMES: Record<string, string> = {
  palermo: "Palermo",
  belgrano: "Belgrano",
  puerto: "Puerto Madero",
};

const SUCURSAL_COLORS: Record<string, string> = {
  palermo: "#2E6DA4",
  belgrano: "#10B981",
  puerto: "#8B5CF6",
};

export default function KPIsPage() {
  const [data, setData] = useState<AdvancedKPIsData>(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<PeriodFilterType>("today");
  const { currency, getRate } = useCurrency();
  const rate = getRate();

  const formatMoney = (amount: number) => _formatMoney(amount, currency, rate);
  const formatMoneyShort = (amount: number) => _formatMoneyShort(amount, currency, rate);
  const [customFrom, setCustomFrom] = useState(
    format(new Date(), "yyyy-MM-dd")
  );
  const [customTo, setCustomTo] = useState(format(new Date(), "yyyy-MM-dd"));

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ period });
      if (period === "custom") {
        params.set("from", customFrom);
        params.set("to", customTo);
      }
      const res = await fetch(`/api/fudo/kpis?${params}`);
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (error) {
      console.error("Error fetching KPIs:", error);
    } finally {
      setLoading(false);
    }
  }, [period, customFrom, customTo]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const connectedCount = data.bySucursal.length || 3;

  const canceledData = [
    { name: "Cancelados", value: data.canceledItems },
    { name: "Activos", value: data.totalItems - data.canceledItems },
  ];
  const canceledColors = ["#EF4444", "#10B981"];

  return (
    <div className="min-h-screen bg-bg-main">
      <Header connectedCount={connectedCount} errors={data.errors} />
      <Navigation />

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Period filter */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <PeriodFilter
            selected={period}
            onSelect={setPeriod}
            customFrom={customFrom}
            customTo={customTo}
            onCustomFromChange={setCustomFrom}
            onCustomToChange={setCustomTo}
          />
          {data.lastUpdated && (
            <button
              onClick={fetchData}
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors self-end"
            >
              Actualizado:{" "}
              {new Date(data.lastUpdated).toLocaleTimeString("es-AR")} — Click
              para refrescar
            </button>
          )}
        </div>

        <ErrorBanner errors={data.errors} />

        {/* Global KPI cards - original 4 */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="kpi-card">
                <div className="skeleton h-4 w-24 mb-2" />
                <div className="skeleton h-8 w-32 mb-1" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="kpi-card">
              <span className="kpi-label">Tiempo promedio de mesa</span>
              <span className="kpi-value">
                {data.global.avgDurationMinutes.toFixed(0)}
                <span className="text-base font-normal text-gray-500">
                  {" "}
                  min
                </span>
              </span>
            </div>
            <div className="kpi-card">
              <span className="kpi-label">Comensales promedio por mesa</span>
              <span className="kpi-value">
                {data.global.avgPeoplePerOrder.toFixed(1)}
              </span>
            </div>
            <div className="kpi-card">
              <span className="kpi-label">RevPASH</span>
              <span className="kpi-value">
                {formatMoney(data.global.revpash)}
              </span>
              <span className="text-xs text-gray-400">
                Ingreso por asiento por hora
              </span>
            </div>
            <div className="kpi-card">
              <span className="kpi-label">Items promedio por orden</span>
              <span className="kpi-value">
                {data.global.avgItemsPerOrder.toFixed(1)}
              </span>
            </div>
          </div>
        )}

        {/* New KPI cards row */}
        {!loading && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="kpi-card">
              <span className="kpi-label">Items por comensal</span>
              <span className="kpi-value">
                {data.itemsPerPerson.toFixed(1)}
              </span>
            </div>
            <div className="kpi-card">
              <span className="kpi-label">Ingreso por minuto</span>
              <span className="kpi-value">
                {formatMoney(data.revenuePerMinute)}
              </span>
              <span className="text-xs text-gray-400">
                Por minuto de mesa ocupada
              </span>
            </div>
            <div className="kpi-card">
              <span className="kpi-label">Concentracion top 5</span>
              <span className="kpi-value">
                {data.topProductConcentration.toFixed(1)}%
              </span>
              <span className="text-xs text-gray-400">
                De los ingresos en 5 productos
              </span>
            </div>
          </div>
        )}

        {/* Almuerzo vs Cena */}
        {!loading && (
          <div>
            <h2 className="text-lg font-semibold mb-3">Almuerzo vs Cena</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="card">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xl">&#9728;&#65039;</span>
                  <h3 className="font-semibold text-lg">Almuerzo</h3>
                  <span className="text-xs text-gray-400">(12-16hs)</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-gray-500">Ingresos</p>
                    <p className="text-xl font-bold">{formatMoney(data.lunchRevenue)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Ordenes</p>
                    <p className="text-xl font-bold">{data.lunchOrders}</p>
                  </div>
                </div>
              </div>
              <div className="card">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xl">&#127769;</span>
                  <h3 className="font-semibold text-lg">Cena</h3>
                  <span className="text-xs text-gray-400">(19-00hs)</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-gray-500">Ingresos</p>
                    <p className="text-xl font-bold">{formatMoney(data.dinnerRevenue)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Ordenes</p>
                    <p className="text-xl font-bold">{data.dinnerOrders}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Peak hours per sucursal */}
        {!loading && data.peakHours && Object.keys(data.peakHours).length > 0 && (
          <div>
            <h2 className="text-lg font-semibold mb-3">Hora pico por sucursal</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {Object.entries(data.peakHours).map(([sucId, peak]) => (
                <div key={sucId} className="card relative overflow-hidden">
                  <div
                    className="absolute top-0 left-0 right-0 h-1"
                    style={{ backgroundColor: SUCURSAL_COLORS[sucId] || "#6B7280" }}
                  />
                  <h4 className="font-semibold text-sm" style={{ color: SUCURSAL_COLORS[sucId] }}>
                    {SUCURSAL_NAMES[sucId] || sucId}
                  </h4>
                  <p className="text-2xl font-bold mt-1">{peak.hour}:00 hs</p>
                  <p className="text-xs text-gray-500">
                    {formatMoney(peak.revenue)} en esa hora
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Revenue Heatmap */}
        {!loading && data.revenueHeatmap && data.revenueHeatmap.length > 0 && (
          <RevenueHeatmap data={data.revenueHeatmap} />
        )}

        {/* Per sucursal KPIs */}
        {!loading && data.bySucursal.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold mb-3">KPIs por sucursal</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {data.bySucursal.map((s) => (
                <div key={s.sucursalId} className="card">
                  <div className="flex items-center gap-2 mb-4">
                    <span
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: s.color }}
                    />
                    <h3 className="font-semibold">{s.name}</h3>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs text-gray-500">Tiempo mesa</p>
                      <p className="text-lg font-bold">
                        {s.avgDurationMinutes.toFixed(0)} min
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Comensales/mesa</p>
                      <p className="text-lg font-bold">
                        {s.avgPeoplePerOrder.toFixed(1)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">RevPASH</p>
                      <p className="text-lg font-bold">
                        {formatMoney(s.revpash)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Items/orden</p>
                      <p className="text-lg font-bold">
                        {s.avgItemsPerOrder.toFixed(1)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Product Analytics */}
        {!loading && (
          <div>
            <h2 className="text-lg font-semibold mb-3">Analytics de productos</h2>
            <ProductAnalytics
              period={period}
              customFrom={customFrom}
              customTo={customTo}
            />
          </div>
        )}

        {/* Charts row */}
        {!loading && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Hourly order rotation */}
            <div className="card">
              <h3 className="font-semibold text-lg mb-4">
                Rotacion de mesas por hora
              </h3>
              <div className="h-64 md:h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.hourlyOrderCounts}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis
                      dataKey="hour"
                      tick={{ fontSize: 12 }}
                      tickFormatter={(h) => `${h}hs`}
                    />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip labelFormatter={(h) => `${h}:00 hs`} />
                    <Legend />
                    <Bar
                      dataKey="palermo"
                      name="Palermo"
                      fill="#2E6DA4"
                      radius={[2, 2, 0, 0]}
                    />
                    <Bar
                      dataKey="belgrano"
                      name="Belgrano"
                      fill="#10B981"
                      radius={[2, 2, 0, 0]}
                    />
                    <Bar
                      dataKey="puerto"
                      name="Puerto Madero"
                      fill="#8B5CF6"
                      radius={[2, 2, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Canceled items donut */}
            <div className="card">
              <h3 className="font-semibold text-lg mb-4">
                Tasa de cancelacion
              </h3>
              <div className="h-64 md:h-80 flex flex-col items-center justify-center">
                {data.totalItems > 0 ? (
                  <>
                    <ResponsiveContainer width="100%" height="80%">
                      <PieChart>
                        <Pie
                          data={canceledData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={90}
                          paddingAngle={2}
                          dataKey="value"
                          label={({ name, percent }) =>
                            `${name} ${(percent * 100).toFixed(1)}%`
                          }
                        >
                          {canceledData.map((_, index) => (
                            <Cell
                              key={`cell-${index}`}
                              fill={canceledColors[index]}
                            />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                    <p className="text-sm text-gray-500 mt-2">
                      {data.canceledItems} de {data.totalItems} items cancelados
                      ({(data.canceledItemsRate * 100).toFixed(1)}%)
                    </p>
                  </>
                ) : (
                  <p className="text-gray-400">Sin datos de items</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* People distribution */}
        {!loading && data.peopleDistribution.length > 0 && (
          <div className="card">
            <h3 className="font-semibold text-lg mb-4">
              Distribucion de comensales por mesa
            </h3>
            <div className="h-64 md:h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.peopleDistribution}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis
                    dataKey="people"
                    tick={{ fontSize: 12 }}
                    label={{
                      value: "Comensales",
                      position: "insideBottom",
                      offset: -5,
                      fontSize: 12,
                    }}
                  />
                  <YAxis
                    tick={{ fontSize: 12 }}
                    label={{
                      value: "Ordenes",
                      angle: -90,
                      position: "insideLeft",
                      fontSize: 12,
                    }}
                  />
                  <Tooltip
                    formatter={(value: number) => [
                      `${value} ordenes`,
                      "Cantidad",
                    ]}
                  />
                  <Bar
                    dataKey="count"
                    name="Ordenes"
                    fill="#2E6DA4"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </main>

      <footer className="text-center py-6 text-xs text-gray-400">
        Masunori Dashboard v1.0
      </footer>
    </div>
  );
}
