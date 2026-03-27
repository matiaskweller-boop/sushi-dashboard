"use client";

import { SucursalKPIs } from "@/types";
import { formatMoney } from "@/lib/format";
import { useCurrency } from "@/lib/CurrencyContext";

interface Props {
  data: SucursalKPIs[];
  loading: boolean;
}

export default function SucursalCards({ data, loading }: Props) {
  const { currency, getRate } = useCurrency();
  const rate = getRate();

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
      {data.map((s) => (
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
              <span className="font-semibold">{s.totalOrders}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500 text-sm">Ticket promedio</span>
              <span className="font-semibold">{formatMoney(s.avgTicket, currency, rate)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500 text-sm">Pago principal</span>
              <span className="font-semibold text-sm">{s.mainPaymentMethod}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
