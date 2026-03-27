"use client";

import { useState, useEffect, useMemo } from "react";
import Header from "@/components/Header";
import Navigation from "@/components/Navigation";
import { SucursalId } from "@/types";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

interface MonthData {
  totalSales: number;
  totalOrders: number;
  totalPeople: number;
  avgTicket: number;
  avgPeoplePerOrder: number;
  avgDurationMinutes: number;
  daysWithData: number;
  peakHour: number;
  hourlyRevenue: Record<string, number>;
  hourlyCounts: Record<string, number>;
  weekdayRevenue: Record<string, number>;
  weekdayOrders: Record<string, number>;
}

type HistoricoData = Record<string, Record<string, MonthData>>;

type SortKey =
  | "month"
  | "sucursal"
  | "orders"
  | "sales"
  | "ticket"
  | "duration"
  | "people";
type SortDir = "asc" | "desc";

const SUCURSAL_COLORS: Record<string, string> = {
  palermo: "#2E6DA4",
  belgrano: "#10B981",
  puerto: "#8B5CF6",
};

const SUCURSAL_NAMES: Record<string, string> = {
  palermo: "Palermo",
  belgrano: "Belgrano",
  puerto: "Puerto Madero",
};

const WEEKDAY_NAMES = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miercoles",
  "Jueves",
  "Viernes",
  "Sabado",
];

import { formatMoney as _formatMoney, formatMoneyShort as _formatMoneyShort } from "@/lib/format";
import { useCurrency } from "@/lib/CurrencyContext";

function formatMonth(ym: string): string {
  const [year, month] = ym.split("-");
  const months = [
    "Ene",
    "Feb",
    "Mar",
    "Abr",
    "May",
    "Jun",
    "Jul",
    "Ago",
    "Sep",
    "Oct",
    "Nov",
    "Dic",
  ];
  return `${months[parseInt(month) - 1]} ${year}`;
}

export default function HistoricoPage() {
  const [data, setData] = useState<HistoricoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("month");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const { currency, getRate } = useCurrency();
  const rate = getRate();

  const formatMoney = (amount: number) => _formatMoney(amount, currency, rate);
  const formatMoneyShort = (amount: number) => _formatMoneyShort(amount, currency, rate);

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch("/api/historico");
        if (res.status === 401) {
          window.location.href = "/login";
          return;
        }
        if (res.ok) {
          const json = await res.json();
          setData(json);
        }
      } catch (error) {
        console.error("Error fetching historico:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  // Ticket promedio evolution
  const ticketEvolution = useMemo(() => {
    if (!data) return [];
    const allMonths = new Set<string>();
    Object.values(data).forEach((sucData) =>
      Object.keys(sucData).forEach((m) => allMonths.add(m))
    );
    return Array.from(allMonths)
      .sort()
      .map((month) => ({
        month: formatMonth(month),
        monthRaw: month,
        palermo: data.palermo?.[month]?.avgTicket || 0,
        belgrano: data.belgrano?.[month]?.avgTicket || 0,
        puerto: data.puerto?.[month]?.avgTicket || 0,
      }));
  }, [data]);

  // Revenue evolution (stacked bar)
  const revenueEvolution = useMemo(() => {
    if (!data) return [];
    const allMonths = new Set<string>();
    Object.values(data).forEach((sucData) =>
      Object.keys(sucData).forEach((m) => allMonths.add(m))
    );
    return Array.from(allMonths)
      .sort()
      .map((month) => ({
        month: formatMonth(month),
        monthRaw: month,
        palermo: data.palermo?.[month]?.totalSales || 0,
        belgrano: data.belgrano?.[month]?.totalSales || 0,
        puerto: data.puerto?.[month]?.totalSales || 0,
      }));
  }, [data]);

  // Duration evolution
  const durationEvolution = useMemo(() => {
    if (!data) return [];
    const allMonths = new Set<string>();
    Object.values(data).forEach((sucData) =>
      Object.keys(sucData).forEach((m) => allMonths.add(m))
    );
    return Array.from(allMonths)
      .sort()
      .map((month) => ({
        month: formatMonth(month),
        monthRaw: month,
        palermo: data.palermo?.[month]?.avgDurationMinutes || 0,
        belgrano: data.belgrano?.[month]?.avgDurationMinutes || 0,
        puerto: data.puerto?.[month]?.avgDurationMinutes || 0,
      }));
  }, [data]);

  // Weekday revenue heatmap
  const weekdayData = useMemo(() => {
    if (!data) return [];
    const totals: number[] = [0, 0, 0, 0, 0, 0, 0];
    Object.values(data).forEach((sucData) => {
      Object.values(sucData).forEach((monthData) => {
        Object.entries(monthData.weekdayRevenue || {}).forEach(([day, rev]) => {
          totals[parseInt(day)] += rev;
        });
      });
    });
    const max = Math.max(...totals);
    const min = Math.min(...totals.filter((v) => v > 0));
    return WEEKDAY_NAMES.map((name, i) => ({
      day: name,
      revenue: totals[i],
      isMax: totals[i] === max && max > 0,
      isMin: totals[i] === min && min > 0 && totals[i] > 0,
      intensity: max > 0 ? totals[i] / max : 0,
    }));
  }, [data]);

  // Hourly peak
  const hourlyPeak = useMemo(() => {
    if (!data) return [];
    const totals: Record<number, number> = {};
    Object.values(data).forEach((sucData) => {
      Object.values(sucData).forEach((monthData) => {
        Object.entries(monthData.hourlyRevenue || {}).forEach(([h, rev]) => {
          const hour = parseInt(h);
          totals[hour] = (totals[hour] || 0) + rev;
        });
      });
    });
    return Array.from({ length: 24 }, (_, i) => ({
      hour: i,
      revenue: totals[i] || 0,
    })).filter((d) => d.revenue > 0);
  }, [data]);

  // Sortable table
  const tableData = useMemo(() => {
    if (!data) return [];
    const rows: {
      month: string;
      monthRaw: string;
      sucursal: string;
      sucursalId: string;
      orders: number;
      sales: number;
      ticket: number;
      duration: number;
      people: number;
    }[] = [];
    Object.entries(data).forEach(([sucId, sucData]) => {
      Object.entries(sucData).forEach(([month, mData]) => {
        rows.push({
          month: formatMonth(month),
          monthRaw: month,
          sucursal: SUCURSAL_NAMES[sucId] || sucId,
          sucursalId: sucId,
          orders: mData.totalOrders,
          sales: mData.totalSales,
          ticket: mData.avgTicket,
          duration: mData.avgDurationMinutes,
          people: mData.avgPeoplePerOrder,
        });
      });
    });

    rows.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "month":
          cmp = a.monthRaw.localeCompare(b.monthRaw);
          break;
        case "sucursal":
          cmp = a.sucursal.localeCompare(b.sucursal);
          break;
        case "orders":
          cmp = a.orders - b.orders;
          break;
        case "sales":
          cmp = a.sales - b.sales;
          break;
        case "ticket":
          cmp = a.ticket - b.ticket;
          break;
        case "duration":
          cmp = a.duration - b.duration;
          break;
        case "people":
          cmp = a.people - b.people;
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return rows;
  }, [data, sortKey, sortDir]);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  function SortArrow({ columnKey }: { columnKey: SortKey }) {
    if (sortKey !== columnKey) return null;
    return <span className="ml-1">{sortDir === "asc" ? "▲" : "▼"}</span>;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-bg-main">
        <Header connectedCount={3} errors={[]} />
        <Navigation />
        <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
          <div className="skeleton h-12 w-full rounded-xl" />
          <div className="skeleton h-64 w-full rounded-xl" />
          <div className="skeleton h-64 w-full rounded-xl" />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-main">
      <Header connectedCount={3} errors={[]} />
      <Navigation />

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Info banner */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
          <strong>Datos historicos + actuales:</strong> Palermo (may 2024 - hoy),
          Belgrano (ene 2025 - hoy), Puerto Madero (oct 2025 - hoy).
          Los datos actuales se actualizan cada 30 minutos.
        </div>

        {/* Ticket promedio evolution */}
        <div className="card">
          <h3 className="font-semibold text-lg mb-4">
            Evolucion del ticket promedio
          </h3>
          <div className="h-64 md:h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={ticketEvolution}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 11 }}
                  angle={-45}
                  textAnchor="end"
                  height={60}
                />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={formatMoneyShort} />
                <Tooltip
                  formatter={(value: number) => [formatMoney(value), ""]}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="palermo"
                  name="Palermo"
                  stroke="#2E6DA4"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey="belgrano"
                  name="Belgrano"
                  stroke="#10B981"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey="puerto"
                  name="Puerto Madero"
                  stroke="#8B5CF6"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Revenue evolution */}
        <div className="card">
          <h3 className="font-semibold text-lg mb-4">
            Evolucion de ventas mensuales
          </h3>
          <div className="h-64 md:h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={revenueEvolution}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 11 }}
                  angle={-45}
                  textAnchor="end"
                  height={60}
                />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={formatMoneyShort} />
                <Tooltip
                  formatter={(value: number) => [formatMoney(value), ""]}
                />
                <Legend />
                <Bar
                  dataKey="palermo"
                  name="Palermo"
                  fill="#2E6DA4"
                  stackId="revenue"
                  radius={[0, 0, 0, 0]}
                />
                <Bar
                  dataKey="belgrano"
                  name="Belgrano"
                  fill="#10B981"
                  stackId="revenue"
                />
                <Bar
                  dataKey="puerto"
                  name="Puerto Madero"
                  fill="#8B5CF6"
                  stackId="revenue"
                  radius={[2, 2, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Duration evolution */}
        <div className="card">
          <h3 className="font-semibold text-lg mb-4">
            Tiempo promedio de mesa (minutos)
          </h3>
          <div className="h-64 md:h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={durationEvolution}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 11 }}
                  angle={-45}
                  textAnchor="end"
                  height={60}
                />
                <YAxis
                  tick={{ fontSize: 12 }}
                  tickFormatter={(v) => `${v} min`}
                />
                <Tooltip
                  formatter={(value: number) => [
                    `${value.toFixed(1)} min`,
                    "",
                  ]}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="palermo"
                  name="Palermo"
                  stroke="#2E6DA4"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey="belgrano"
                  name="Belgrano"
                  stroke="#10B981"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey="puerto"
                  name="Puerto Madero"
                  stroke="#8B5CF6"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Weekday heatmap */}
        <div className="card">
          <h3 className="font-semibold text-lg mb-4">
            Ventas por dia de la semana
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-card-border">
                  <th className="text-left py-2 px-3 font-medium text-gray-500">
                    Dia
                  </th>
                  <th className="text-right py-2 px-3 font-medium text-gray-500">
                    Ventas totales
                  </th>
                  <th className="text-left py-2 px-3 font-medium text-gray-500 w-1/2">
                    Intensidad
                  </th>
                </tr>
              </thead>
              <tbody>
                {weekdayData.map((row) => (
                  <tr
                    key={row.day}
                    className={`border-b border-card-border last:border-0 ${
                      row.isMax
                        ? "bg-green-50"
                        : row.isMin
                        ? "bg-red-50"
                        : ""
                    }`}
                  >
                    <td className="py-2.5 px-3 font-medium">
                      {row.day}
                      {row.isMax && (
                        <span className="ml-2 text-xs text-green-600 font-normal">
                          Mejor dia
                        </span>
                      )}
                      {row.isMin && (
                        <span className="ml-2 text-xs text-red-500 font-normal">
                          Peor dia
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono">
                      {formatMoney(row.revenue)}
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="w-full bg-gray-100 rounded-full h-3">
                        <div
                          className="h-3 rounded-full transition-all"
                          style={{
                            width: `${row.intensity * 100}%`,
                            backgroundColor: row.isMax
                              ? "#10B981"
                              : row.isMin
                              ? "#EF4444"
                              : "#2E6DA4",
                          }}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Sortable monthly comparison table */}
        <div className="card">
          <h3 className="font-semibold text-lg mb-4">Comparativo mensual</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-card-border">
                  {[
                    { key: "month" as SortKey, label: "Mes" },
                    { key: "sucursal" as SortKey, label: "Sucursal" },
                    { key: "orders" as SortKey, label: "Ordenes" },
                    { key: "sales" as SortKey, label: "Ventas" },
                    { key: "ticket" as SortKey, label: "Ticket Prom." },
                    { key: "duration" as SortKey, label: "Duracion" },
                    { key: "people" as SortKey, label: "Com./Mesa" },
                  ].map((col) => (
                    <th
                      key={col.key}
                      onClick={() => handleSort(col.key)}
                      className="text-left py-2 px-3 font-medium text-gray-500 cursor-pointer hover:text-navy select-none whitespace-nowrap"
                    >
                      {col.label}
                      <SortArrow columnKey={col.key} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableData.map((row, i) => (
                  <tr
                    key={`${row.monthRaw}-${row.sucursalId}`}
                    className="border-b border-card-border last:border-0 hover:bg-gray-50"
                  >
                    <td className="py-2 px-3">{row.month}</td>
                    <td className="py-2 px-3">
                      <span className="flex items-center gap-1.5">
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{
                            backgroundColor:
                              SUCURSAL_COLORS[row.sucursalId] || "#6B7280",
                          }}
                        />
                        {row.sucursal}
                      </span>
                    </td>
                    <td className="py-2 px-3 font-mono">
                      {row.orders.toLocaleString("es-AR")}
                    </td>
                    <td className="py-2 px-3 font-mono">
                      {formatMoney(row.sales)}
                    </td>
                    <td className="py-2 px-3 font-mono">
                      {formatMoney(row.ticket)}
                    </td>
                    <td className="py-2 px-3 font-mono">
                      {row.duration.toFixed(0)} min
                    </td>
                    <td className="py-2 px-3 font-mono">
                      {row.people.toFixed(1)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Peak hour chart */}
        <div className="card">
          <h3 className="font-semibold text-lg mb-4">
            Hora pico (ventas acumuladas por hora)
          </h3>
          <div className="h-64 md:h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hourlyPeak}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis
                  dataKey="hour"
                  tick={{ fontSize: 12 }}
                  tickFormatter={(h) => `${h}hs`}
                />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={formatMoneyShort} />
                <Tooltip
                  labelFormatter={(h) => `${h}:00 hs`}
                  formatter={(value: number) => [formatMoney(value), "Ventas"]}
                />
                <Bar
                  dataKey="revenue"
                  name="Ventas"
                  fill="#1B2A4A"
                  radius={[4, 4, 0, 0]}
                />
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
