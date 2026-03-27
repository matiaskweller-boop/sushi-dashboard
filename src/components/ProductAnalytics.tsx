"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from "recharts";
import { ProductAnalyticsData, SucursalId } from "@/types";
import { formatMoney, formatMoneyShort } from "@/lib/format";
import { useCurrency } from "@/lib/CurrencyContext";

const COLORS = [
  "#1B2A4A",
  "#2E6DA4",
  "#10B981",
  "#8B5CF6",
  "#F59E0B",
  "#EF4444",
  "#EC4899",
  "#6366F1",
  "#14B8A6",
  "#78716C",
];

type FilterTab = "all" | SucursalId;
type MetricToggle = "revenue" | "quantity";

const TABS: { value: FilterTab; label: string; color?: string }[] = [
  { value: "all", label: "Todas" },
  { value: "palermo", label: "Palermo", color: "#2E6DA4" },
  { value: "belgrano", label: "Belgrano", color: "#10B981" },
  { value: "puerto", label: "Puerto Madero", color: "#8B5CF6" },
];

interface Props {
  period: string;
  customFrom?: string;
  customTo?: string;
}

export default function ProductAnalytics({ period, customFrom, customTo }: Props) {
  const [data, setData] = useState<ProductAnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [metric, setMetric] = useState<MetricToggle>("revenue");
  const { currency, getRate } = useCurrency();
  const rate = getRate();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ period });
      if (period === "custom" && customFrom) params.set("from", customFrom);
      if (period === "custom" && customTo) params.set("to", customTo);
      const res = await fetch(`/api/fudo/products?${params}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (error) {
      console.error("Error fetching product analytics:", error);
    } finally {
      setLoading(false);
    }
  }, [period, customFrom, customTo]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="card">
          <div className="skeleton h-5 w-48 mb-4" />
          <div className="skeleton h-64 w-full" />
        </div>
      </div>
    );
  }

  if (!data) return null;

  const categories = activeTab === "all" ? data.categories : data.bySucursal[activeTab] || [];
  const pieData = categories.slice(0, 8).map((c) => ({
    name: c.categoryName,
    value: metric === "revenue" ? c.revenue : c.quantity,
  }));

  // Bar chart: categories by sucursal (top 6)
  const barCategories = data.categories.slice(0, 6);
  const barData = barCategories.map((cat) => ({
    name: cat.categoryName.length > 15 ? cat.categoryName.substring(0, 15) + "..." : cat.categoryName,
    palermo: metric === "revenue" ? cat.bySucursal.palermo.revenue : cat.bySucursal.palermo.quantity,
    belgrano: metric === "revenue" ? cat.bySucursal.belgrano.revenue : cat.bySucursal.belgrano.quantity,
    puerto: metric === "revenue" ? cat.bySucursal.puerto.revenue : cat.bySucursal.puerto.quantity,
  }));

  return (
    <div className="space-y-6">
      {/* Sucursal filter tabs + metric toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setActiveTab(tab.value)}
              className={`pill ${activeTab === tab.value ? "active" : ""}`}
              style={
                activeTab === tab.value && tab.color
                  ? { backgroundColor: tab.color }
                  : {}
              }
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-full p-0.5">
          <button
            onClick={() => setMetric("revenue")}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              metric === "revenue" ? "bg-navy text-white" : "text-gray-600"
            }`}
          >
            Por ingresos
          </button>
          <button
            onClick={() => setMetric("quantity")}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              metric === "quantity" ? "bg-navy text-white" : "text-gray-600"
            }`}
          >
            Por cantidad
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pie chart: category distribution */}
        <div className="card">
          <h3 className="font-semibold text-lg mb-4">
            Distribucion por categoria
          </h3>
          {pieData.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-gray-400">
              Sin datos para este periodo
            </div>
          ) : (
            <div className="h-64 md:h-80">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={85}
                    paddingAngle={2}
                    dataKey="value"
                    label={({ name, percent }) =>
                      `${name} ${(percent * 100).toFixed(0)}%`
                    }
                    labelLine={false}
                  >
                    {pieData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number) =>
                      metric === "revenue"
                        ? formatMoney(value, currency, rate)
                        : `${value} unidades`
                    }
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Horizontal bar chart: categories by sucursal */}
        <div className="card">
          <h3 className="font-semibold text-lg mb-4">
            Categorias por sucursal
          </h3>
          {barData.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-gray-400">
              Sin datos
            </div>
          ) : (
            <div className="h-64 md:h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) =>
                      metric === "revenue" ? formatMoneyShort(v, currency, rate) : String(v)
                    }
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={100}
                    tick={{ fontSize: 11 }}
                  />
                  <Tooltip
                    formatter={(value: number) =>
                      metric === "revenue"
                        ? formatMoney(value, currency, rate)
                        : `${value} unidades`
                    }
                  />
                  <Legend />
                  <Bar dataKey="palermo" name="Palermo" fill="#2E6DA4" stackId="a" />
                  <Bar dataKey="belgrano" name="Belgrano" fill="#10B981" stackId="a" />
                  <Bar dataKey="puerto" name="Puerto Madero" fill="#8B5CF6" stackId="a" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* Time slot star products */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {data.timeSlots.map((ts) => (
          <div key={ts.slot} className="card">
            <h4 className="text-sm text-gray-500 mb-1">Producto estrella</h4>
            <p className="font-semibold text-lg mb-2">{ts.slot}</p>
            {ts.starProduct ? (
              <>
                <p className="text-navy font-bold text-sm truncate">{ts.starProduct}</p>
                <p className="text-xs text-gray-500 mt-1">
                  {formatMoney(ts.starProductRevenue, currency, rate)} &middot; {ts.orders} ordenes
                </p>
              </>
            ) : (
              <p className="text-gray-400 text-sm">Sin datos</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
