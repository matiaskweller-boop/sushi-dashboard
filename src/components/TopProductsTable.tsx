"use client";

import { useState } from "react";
import { TopProduct, SucursalId } from "@/types";

function formatMoney(amount: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

type FilterTab = "all" | SucursalId;

const TABS: { value: FilterTab; label: string; color?: string }[] = [
  { value: "all", label: "Todas" },
  { value: "palermo", label: "Palermo", color: "#2E6DA4" },
  { value: "belgrano", label: "Belgrano", color: "#10B981" },
  { value: "puerto", label: "Puerto Madero", color: "#8B5CF6" },
];

interface Props {
  data: {
    all: TopProduct[];
    palermo: TopProduct[];
    belgrano: TopProduct[];
    puerto: TopProduct[];
  };
  loading: boolean;
}

export default function TopProductsTable({ data, loading }: Props) {
  const [activeTab, setActiveTab] = useState<FilterTab>("all");

  if (loading) {
    return (
      <div className="card">
        <div className="skeleton h-5 w-48 mb-4" />
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="skeleton h-10 w-full" />
          ))}
        </div>
      </div>
    );
  }

  const products = data[activeTab] || [];
  const maxQuantity = products.length > 0 ? products[0].quantity : 1;

  return (
    <div className="card">
      <h3 className="font-semibold text-lg mb-4">Top 10 productos</h3>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 mb-4">
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

      {products.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          Sin datos para este periodo
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-card-border">
                <th className="text-left py-2 pr-2 text-sm text-gray-500 font-medium w-10">
                  #
                </th>
                <th className="text-left py-2 pr-2 text-sm text-gray-500 font-medium">
                  Producto
                </th>
                <th className="text-right py-2 pr-2 text-sm text-gray-500 font-medium w-20">
                  Cant.
                </th>
                <th className="text-right py-2 text-sm text-gray-500 font-medium w-28">
                  Ingresos
                </th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr
                  key={product.rank}
                  className="border-b border-card-border last:border-0"
                >
                  <td className="py-3 pr-2 text-sm text-gray-400 font-mono">
                    {product.rank}
                  </td>
                  <td className="py-3 pr-2">
                    <div className="font-medium text-sm">{product.name}</div>
                    <div className="mt-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${(product.quantity / maxQuantity) * 100}%`,
                          backgroundColor:
                            TABS.find((t) => t.value === activeTab)?.color ||
                            "#1B2A4A",
                        }}
                      />
                    </div>
                  </td>
                  <td className="py-3 pr-2 text-right text-sm font-semibold">
                    {product.quantity}
                  </td>
                  <td className="py-3 text-right text-sm font-semibold">
                    {formatMoney(product.revenue)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
