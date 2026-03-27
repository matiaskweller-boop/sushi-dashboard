"use client";

import { PeriodFilter as PeriodFilterType } from "@/types";

interface Props {
  selected: PeriodFilterType;
  onSelect: (period: PeriodFilterType) => void;
  customFrom: string;
  customTo: string;
  onCustomFromChange: (val: string) => void;
  onCustomToChange: (val: string) => void;
}

const PERIODS: { value: PeriodFilterType; label: string }[] = [
  { value: "today", label: "Hoy" },
  { value: "7days", label: "7 dias" },
  { value: "30days", label: "30 dias" },
  { value: "custom", label: "Personalizado" },
];

export default function PeriodFilter({
  selected,
  onSelect,
  customFrom,
  customTo,
  onCustomFromChange,
  onCustomToChange,
}: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {PERIODS.map((p) => (
        <button
          key={p.value}
          onClick={() => onSelect(p.value)}
          className={`pill ${selected === p.value ? "active" : ""}`}
        >
          {p.label}
        </button>
      ))}

      {selected === "custom" && (
        <div className="flex items-center gap-2 ml-2">
          <input
            type="date"
            value={customFrom}
            onChange={(e) => onCustomFromChange(e.target.value)}
            className="px-2 py-1 border border-card-border rounded-lg text-sm"
          />
          <span className="text-gray-400">—</span>
          <input
            type="date"
            value={customTo}
            onChange={(e) => onCustomToChange(e.target.value)}
            className="px-2 py-1 border border-card-border rounded-lg text-sm"
          />
        </div>
      )}
    </div>
  );
}
