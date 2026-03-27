"use client";

import { useState } from "react";
import { SucursalKPIs } from "@/types";
import { formatMoney, formatNumber } from "@/lib/format";
import { useCurrency } from "@/lib/CurrencyContext";

interface Props {
  data: SucursalKPIs[];
  loading: boolean;
}

export default function SucursalCards({ data, loading }: Props) {
  const { currency, getRate } = useCurrency();
  const rate = getRate();
  const [expandedPayments, setExpandedPayments] = useState<Record<string, boolean>>({});

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="card">
            <div className="skeleton h-5 w-32 mb-4" />
            <div className="space-y-3">
              <div className="skeleton h-4 w-full" />
              <div className="skeleton h-4 w-3/4" />
              <div className="skeleton h-4 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {data.map((s) => {
        const isExpanded = expandedPayments[s.sucursalId] || false;
        return (
          <div key={s.sucursalId} className="card relative overflow-hidden">
            {/* Color stripe */}
            <div
              className="absolute top-0 left-0 right-0 h-1"
              style={{ backgroundColor: s.color }}
            />

            {s.error && (
              <div className="bg-yellow-50 text-yellow-700 text-xs px-2 py-1 rounded mb-3">
                Error de conexion
              </div>
            )}

            <h3 className="font-semibold text-lg mb-3" style={{ color: s.color }}>
              {s.name}
            </h3>

            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-500 text-sm">Ventas</span>
                <span className="font-semibold">{formatMoney(s.totalSales, currency, rate)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 text-sm">Ordenes</span>
                <span className="font-semibold">{formatNumber(s.totalOrders)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 text-sm">Comensales</span>
                <span className="font-semibold">{formatNumber(s.totalPax)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 text-sm">Ticket promedio</span>
                <span className="font-semibold">{formatMoney(s.avgTicket, currency, rate)}</span>
              </div>

              {/* Ticket almuerzo/cena */}
              <div className="pt-2 border-t border-gray-100 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-gray-500 text-xs">Ticket almuerzo</span>
                  <span className="font-medium text-sm">{formatMoney(s.avgTicketLunch, currency, rate)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 text-xs">Ticket cena</span>
                  <span className="font-medium text-sm">{formatMoney(s.avgTicketDinner, currency, rate)}</span>
                </div>
                {/* Barra almuerzo vs cena */}
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-amber-600 font-medium">{s.lunchPct}%</span>
                  <div className="flex-1 flex h-2 rounded-full overflow-hidden bg-gray-100">
                    <div
                      className="h-full bg-amber-400 transition-all"
                      style={{ width: `${s.lunchPct}%` }}
                    />
                    <div
                      className="h-full bg-indigo-400 transition-all"
                      style={{ width: `${s.dinnerPct}%` }}
                    />
                  </div>
                  <span className="text-indigo-600 font-medium">{s.dinnerPct}%</span>
                </div>
                <div className="flex justify-between text-[10px] text-gray-400">
                  <span>Almuerzo</span>
                  <span>Cena</span>
                </div>
              </div>

              {/* Medios de pago */}
              <div className="pt-2 border-t border-gray-100">
                <button
                  onClick={() =>
                    setExpandedPayments((prev) => ({
                      ...prev,
                      [s.sucursalId]: !prev[s.sucursalId],
                    }))
                  }
                  className="flex items-center justify-between w-full text-sm text-gray-500 hover:text-gray-700 transition-colors"
                >
                  <span>Medios de pago</span>
                  <svg
                    className={`w-4 h-4 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {isExpanded && s.paymentBreakdown.length > 0 && (
                  <div className="mt-2 space-y-1.5">
                    {s.paymentBreakdown.map((pm) => (
                      <div key={pm.method} className="flex items-center gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between text-xs">
                            <span className="text-gray-600 truncate">{pm.method}</span>
                            <span className="text-gray-500 ml-1">{pm.percentage}%</span>
                          </div>
                          <div className="w-full bg-gray-100 rounded-full h-1.5 mt-0.5">
                            <div
                              className="h-1.5 rounded-full transition-all"
                              style={{
                                width: `${pm.percentage}%`,
                                backgroundColor: s.color,
                                opacity: 0.7,
                              }}
                            />
                          </div>
                        </div>
                        <span className="text-xs font-medium text-gray-700 whitespace-nowrap">
                          {formatMoney(pm.amount, currency, rate)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {isExpanded && s.paymentBreakdown.length === 0 && (
                  <p className="text-xs text-gray-400 mt-2">Sin datos de pago</p>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
