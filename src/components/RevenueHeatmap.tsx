"use client";

import React, { useState } from "react";
import { formatMoney } from "@/lib/format";
import { useCurrency } from "@/lib/CurrencyContext";

interface HeatmapCell {
  dayOfWeek: number;
  hour: number;
  revenue: number;
}

interface Props {
  data: HeatmapCell[];
}

const DAY_NAMES = ["Dom", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab"];
// Restaurant hours: 12-23, 0 (midnight)
const HOURS = [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 0];
// Reorder days: Mon-Sun
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

function getIntensityColor(value: number, max: number): string {
  if (max === 0 || value === 0) return "#F8FAFC";
  const intensity = value / max;
  // White (#F8FAFC) to Navy (#1B2A4A)
  const r = Math.round(248 - intensity * (248 - 27));
  const g = Math.round(250 - intensity * (250 - 42));
  const b = Math.round(252 - intensity * (252 - 74));
  return `rgb(${r}, ${g}, ${b})`;
}

export default function RevenueHeatmap({ data }: Props) {
  const [tooltip, setTooltip] = useState<{ day: string; hour: string; revenue: number; x: number; y: number } | null>(null);
  const { currency, getRate } = useCurrency();
  const rate = getRate();

  // Build lookup
  const lookup: Record<string, number> = {};
  let maxRevenue = 0;
  data.forEach((cell) => {
    const key = `${cell.dayOfWeek}-${cell.hour}`;
    lookup[key] = (lookup[key] || 0) + cell.revenue;
    if (lookup[key] > maxRevenue) maxRevenue = lookup[key];
  });

  return (
    <div className="card">
      <h3 className="font-semibold text-lg mb-4">Mapa de calor de ingresos</h3>
      <div className="overflow-x-auto">
        <div
          className="inline-grid gap-px"
          style={{
            gridTemplateColumns: `60px repeat(${HOURS.length}, minmax(36px, 1fr))`,
            gridTemplateRows: `auto repeat(${DAY_ORDER.length}, 36px)`,
            minWidth: `${60 + HOURS.length * 40}px`,
          }}
        >
          {/* Header row */}
          <div className="text-xs text-gray-400 flex items-end justify-center pb-1" />
          {HOURS.map((h) => (
            <div
              key={`h-${h}`}
              className="text-xs text-gray-400 flex items-end justify-center pb-1"
            >
              {h}hs
            </div>
          ))}

          {/* Data rows */}
          {DAY_ORDER.map((dayIdx) => (
            <React.Fragment key={`row-${dayIdx}`}>
              <div
                className="text-xs font-medium text-gray-600 flex items-center pr-2 justify-end"
              >
                {DAY_NAMES[dayIdx]}
              </div>
              {HOURS.map((hour) => {
                const key = `${dayIdx}-${hour}`;
                const value = lookup[key] || 0;
                const color = getIntensityColor(value, maxRevenue);
                const textColor = value / maxRevenue > 0.5 ? "white" : "#1B2A4A";
                return (
                  <div
                    key={`cell-${dayIdx}-${hour}`}
                    className="rounded-sm cursor-pointer transition-transform hover:scale-110 flex items-center justify-center"
                    style={{ backgroundColor: color, minHeight: "32px" }}
                    onMouseEnter={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      setTooltip({
                        day: DAY_NAMES[dayIdx],
                        hour: `${hour}:00`,
                        revenue: value,
                        x: rect.left + rect.width / 2,
                        y: rect.top - 8,
                      });
                    }}
                    onMouseLeave={() => setTooltip(null)}
                  >
                    {value > 0 && maxRevenue > 0 && value / maxRevenue > 0.15 && (
                      <span className="text-[9px] font-medium" style={{ color: textColor }}>
                        {value >= 1000000
                          ? `${(value / 1000000).toFixed(1)}M`
                          : value >= 1000
                          ? `${(value / 1000).toFixed(0)}K`
                          : ""}
                      </span>
                    )}
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 bg-navy text-white text-xs rounded-lg px-3 py-2 shadow-lg pointer-events-none"
          style={{
            left: tooltip.x,
            top: tooltip.y,
            transform: "translate(-50%, -100%)",
          }}
        >
          <p className="font-medium">{tooltip.day} {tooltip.hour}</p>
          <p>{formatMoney(tooltip.revenue, currency, rate)}</p>
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-2 mt-4 text-xs text-gray-500">
        <span>Menor</span>
        <div className="flex gap-px">
          {[0, 0.2, 0.4, 0.6, 0.8, 1].map((intensity) => (
            <div
              key={intensity}
              className="w-5 h-3 rounded-sm"
              style={{ backgroundColor: getIntensityColor(intensity * 100, 100) }}
            />
          ))}
        </div>
        <span>Mayor</span>
      </div>
    </div>
  );
}
