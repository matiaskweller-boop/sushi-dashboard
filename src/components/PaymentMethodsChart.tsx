"use client";

import { memo, useState, useEffect } from "react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
} from "recharts";
import { PaymentMethodData } from "@/types";
import { formatMoney } from "@/lib/format";
import { useCurrency } from "@/lib/CurrencyContext";

const COLORS = [
  "#2E6DA4",
  "#10B981",
  "#8B5CF6",
  "#F59E0B",
  "#EF4444",
  "#EC4899",
  "#6366F1",
  "#14B8A6",
];

interface Props {
  data: PaymentMethodData[];
  loading: boolean;
}

export default memo(function PaymentMethodsChart({ data, loading }: Props) {
  const { currency, getRate } = useCurrency();
  const rate = getRate();
  const [hasAnimated, setHasAnimated] = useState(false);
  useEffect(() => {
    if (!loading && data.length > 0) setHasAnimated(true);
  }, [loading, data]);

  if (loading) {
    return (
      <div className="card">
        <div className="skeleton h-5 w-40 mb-4" />
        <div className="skeleton h-64 w-full rounded-full mx-auto max-w-[250px]" />
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="card">
        <h3 className="font-semibold text-lg mb-4">Metodos de pago</h3>
        <div className="h-64 flex items-center justify-center text-gray-400">
          Sin datos para este periodo
        </div>
      </div>
    );
  }

  return (
    <div className="card animate-in">
      <h3 className="font-semibold text-lg mb-4">Metodos de pago</h3>
      <div className="h-64 md:h-80">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={90}
              paddingAngle={3}
              dataKey="amount"
              nameKey="method"
              label={({ method, percentage }) => `${method} ${percentage}%`}
              labelLine={false}
              isAnimationActive={!hasAnimated}
            >
              {data.map((_, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={COLORS[index % COLORS.length]}
                />
              ))}
            </Pie>
            <Tooltip
              formatter={(value: number) => formatMoney(value, currency, rate)}
            />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
})
