"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
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
    totalPax: 0,
    avgTicket: 0,
    avgTicketLunch: 0,
    avgTicketDinner: 0,
    prevTotalSales: 0,
    prevTotalOrders: 0,
    prevTotalPax: 0,
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
  const [adminBanner, setAdminBanner] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("error") === "admin_only") {
      setAdminBanner(true);
      // Limpiar query param de la URL sin recargar
      params.delete("error");
      const newSearch = params.toString();
      const newUrl = window.location.pathname + (newSearch ? "?" + newSearch : "");
      window.history.replaceState({}, "", newUrl);
    }
  }, []);

  const [data, setData] = useState<DashboardData>(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [period, setPeriod] = useState<PeriodFilterType>("today");
  const [customFrom, setCustomFrom] = useState(
    format(new Date(), "yyyy-MM-dd")
  );
  const [customTo, setCustomTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const hasFetched = useRef(false);
  const fetchingRef = useRef(false);

  const fetchData = useCallback(async (isRefresh = false) => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;

    // Stale-while-revalidate: only show full loading on first fetch
    if (!isRefresh) setLoading(true);
    else setRefreshing(true);

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
      setRefreshing(false);
      fetchingRef.current = false;
    }
  }, [period, customFrom, customTo]);

  // Initial fetch + refetch on period change
  useEffect(() => {
    hasFetched.current = false;
  }, [period, customFrom, customTo]);

  useEffect(() => {
    if (!hasFetched.current) {
      hasFetched.current = true;
      fetchData();
    }
  }, [fetchData]);

  // Auto-refresh cada 5 minutos
  useEffect(() => {
    const interval = setInterval(() => fetchData(true), 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const connectedCount = useMemo(
    () => data.sucursalKPIs.filter((s) => !s.error).length || 3,
    [data.sucursalKPIs]
  );

  const hasData = data.lastUpdated !== "";
  const showLoading = loading && !hasData;

  return (
    <div className="min-h-screen bg-bg-main">
      <Header connectedCount={connectedCount} errors={data.errors} />
      <Navigation />

      {adminBanner && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-3 text-sm text-amber-800 flex items-center justify-between">
          <span>
            ⚠️ <b>Acceso restringido:</b> Solo administradores autorizados pueden acceder a la sección de Administración. Si necesitás acceso, hablá con Matías.
          </span>
          <button onClick={() => setAdminBanner(false)} className="text-amber-600 hover:text-amber-800 ml-3">✕</button>
        </div>
      )}

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
          <div className="flex items-center gap-2 self-end">
            {refreshing && (
              <div className="w-4 h-4 border-2 border-blue-accent border-t-transparent rounded-full animate-spin" />
            )}
            {data.lastUpdated && (
              <button
                onClick={() => fetchData(true)}
                className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
              >
                Actualizado:{" "}
                {new Date(data.lastUpdated).toLocaleTimeString("es-AR")} — Click
                para refrescar
              </button>
            )}
          </div>
        </div>

        {/* Errores */}
        <ErrorBanner errors={data.errors} />

        {/* KPIs principales */}
        <KPICards kpis={data.kpis} loading={showLoading} />

        {/* Comparativo por sucursal */}
        <SucursalCards data={data.sucursalKPIs} loading={showLoading} />

        {/* Gráficos: lado a lado en desktop, stacked en mobile */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <HourlySalesChart data={data.hourlySales} loading={showLoading} />
          <PaymentMethodsChart data={data.paymentMethods} loading={showLoading} />
        </div>

        {/* Top productos */}
        <TopProductsTable data={data.topProducts} loading={showLoading} />
      </main>

      {/* Footer */}
      <footer className="text-center py-6 text-xs text-gray-400">
        Masunori Dashboard v1.0
      </footer>
    </div>
  );
}
