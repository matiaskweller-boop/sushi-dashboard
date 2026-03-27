"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { HourlySalesData } from "@/types";
import { formatMoney, formatMoneyShort } from "@/lib/format";
import { useCurrency } from "@/lib/CurrencyContext";

interface Props {
  data: HourlySalesData[];
  loading: boolean;
}

export default function HourlySalesChart({ data, loading }: Props) {
  const { currency, getRate } = useCurrency();
  const rate = getRate();

  if (loading) {
    return (
      <div className="card">
        <div className="skeleton h-5 w-40 mb-4" />
        <div className="skeleton h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="card">
      <h3 className="font-semibold text-lg mb-4">Ventas por hora</h3>
      <div className="h-64 md:h-80">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
            <XAxis
              dataKey="hour"
              tick={{ fontSize: 12 }}
              tickFormatter={(h) => `${h}hs`}
            />
            <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => formatMoneyShort(v, currency, rate)} />
            <Tooltip
              formatter={(value: number) => formatMoney(value, currency, rate)}
              labelFormatter={(h) => `${h}:00 hs`}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey="palermo"
              name="Palermo"
              stroke="#2E6DA4"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
            <Line
              type="monotone"
              dataKey="belgrano"
              name="Belgrano"
              stroke="#10B981"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
            <Line
              type="monotone"
              dataKey="puerto"
              name="Puerto Madero"
              stroke="#8B5CF6"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
