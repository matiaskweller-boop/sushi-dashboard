"use client";

import { useState, useEffect, useCallback } from "react";
import { DashboardData, PeriodFilter as PeriodFilterType } from "@/types";
import Header from "./Header";
import PeriodFilter from "./PeriodFilter";
import KPICards from "./KPICards";
import SucursalCards from "./SucursalCards";
import HourlySalesChart from "./HourlySalesChart";
import PaymentMethodsChart from "./PaymentMethodsChart";
import TopProductsTable from "./TopProductsTable";
import ErrorBanner from "./ErrorBanner";
import Navigation from "./Navigation";
import { format } from "date-fns";

const EMPTY_DATA: DashboardData = {
  kpis: {
    totalSales: 0,
    totalOrders: 0,
    avgTicket: 0,
    prevTotalSales: 0,
    prevTotalOrders: 0,
    prevAvgTicket: 0,
  },
  sucursalKPIs: [],
  hourlySales: [],
  paymentMethods: [],
  topProducts: { all: [], palermo: [], belgrano: [], puerto: [] },
  errors: [],
  lastUpdated: "",
};

export default function Dashboard() {
  const [data, setData] = useState<DashboardData>(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<PeriodFilterType>("today");
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

      const res = await fetch(`/api/fudo?${params}`);

      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }

      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
    } finally {
      setLoading(false);
    }
  }, [period, customFrom, customTo]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh cada 5 minutos
  useEffect(() => {
    const interval = setInterval(fetchData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const connectedCount = data.sucursalKPIs.filter((s) => !s.error).length || 3;

  return (
    <div className="min-h-screen bg-bg-main">
      <Header connectedCount={connectedCount} errors={data.errors} />
      <Navigation />

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Filtro de período + última actualización */}
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

        {/* Errores */}
        <ErrorBanner errors={data.errors} />

        {/* KPIs principales */}
        <KPICards kpis={data.kpis} loading={loading} />

        {/* Comparativo por sucursal */}
        <SucursalCards data={data.sucursalKPIs} loading={loading} />

        {/* Gráficos: lado a lado en desktop, stacked en mobile */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <HourlySalesChart data={data.hourlySales} loading={loading} />
          <PaymentMethodsChart data={data.paymentMethods} loading={loading} />
        </div>

        {/* Top productos */}
        <TopProductsTable data={data.topProducts} loading={loading} />
      </main>

      {/* Footer */}
      <footer className="text-center py-6 text-xs text-gray-400">
        Masunori Dashboard v1.0
      </footer>
    </div>
  );
}
