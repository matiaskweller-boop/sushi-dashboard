"use client";

import { KPIs } from "@/types";

function formatMoney(amount: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatNumber(num: number): string {
  return new Intl.NumberFormat("es-AR").format(num);
}

function ChangeIndicator({
  current,
  previous,
  format: fmt = "percent",
}: {
  current: number;
  previous: number;
  format?: "percent" | "money";
}) {
  if (previous === 0) {
    if (current === 0) return <span className="kpi-change text-gray-400">—</span>;
    return (
      <span className="kpi-change positive">
        <Arrow direction="up" /> Nuevo
      </span>
    );
  }

  const change = ((current - previous) / previous) * 100;
  const isPositive = change >= 0;

  return (
    <span className={`kpi-change ${isPositive ? "positive" : "negative"}`}>
      <Arrow direction={isPositive ? "up" : "down"} />
      {Math.abs(change).toFixed(1)}% vs período anterior
    </span>
  );
}

function Arrow({ direction }: { direction: "up" | "down" }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      className={direction === "down" ? "rotate-180" : ""}
    >
      <path
        d="M6 2.5L10 7.5H2L6 2.5Z"
        fill="currentColor"
      />
    </svg>
  );
}

interface Props {
  kpis: KPIs;
  loading: boolean;
}

export default function KPICards({ kpis, loading }: Props) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="kpi-card">
            <div className="skeleton h-4 w-24 mb-2" />
            <div className="skeleton h-8 w-32 mb-1" />
            <div className="skeleton h-4 w-28" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <div className="kpi-card">
        <span className="kpi-label">Ventas totales</span>
        <span className="kpi-value">{formatMoney(kpis.totalSales)}</span>
        <ChangeIndicator
          current={kpis.totalSales}
          previous={kpis.prevTotalSales}
        />
      </div>

      <div className="kpi-card">
        <span className="kpi-label">Cantidad de ordenes</span>
        <span className="kpi-value">{formatNumber(kpis.totalOrders)}</span>
        <ChangeIndicator
          current={kpis.totalOrders}
          previous={kpis.prevTotalOrders}
        />
      </div>

      <div className="kpi-card">
        <span className="kpi-label">Ticket promedio</span>
        <span className="kpi-value">{formatMoney(kpis.avgTicket)}</span>
        <ChangeIndicator
          current={kpis.avgTicket}
          previous={kpis.prevAvgTicket}
        />
      </div>
    </div>
  );
}
