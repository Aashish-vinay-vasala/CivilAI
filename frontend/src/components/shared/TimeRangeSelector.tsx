"use client";

import { pillStyle, glassInputClass, glassInputStyle, type AccentKey } from "@/lib/theme";

export type RangePreset = "1m" | "3m" | "6m" | "1y" | "5y" | "10y" | "custom";

export interface TimeRange {
  preset: RangePreset;
  start?: string; // YYYY-MM-DD, only used when preset === "custom"
  end?: string;   // YYYY-MM-DD, only used when preset === "custom"
}

const PRESETS: { key: RangePreset; label: string; months?: number }[] = [
  { key: "1m",  label: "1M",  months: 1 },
  { key: "3m",  label: "3M",  months: 3 },
  { key: "6m",  label: "6M",  months: 6 },
  { key: "1y",  label: "1Y",  months: 12 },
  { key: "5y",  label: "5Y",  months: 60 },
  { key: "10y", label: "10Y", months: 120 },
  { key: "custom", label: "Custom" },
];

// Converts a TimeRange into the query params the /charts/costs and /charts/cashflow
// endpoints expect. Returns {} for an incomplete custom range so the caller falls
// back to the endpoint's own default window rather than sending a malformed request.
export function rangeToParams(range: TimeRange): Record<string, string> {
  if (range.preset === "custom") {
    return range.start && range.end ? { start_date: range.start, end_date: range.end } : {};
  }
  const months = PRESETS.find((p) => p.key === range.preset)?.months;
  return months ? { months: String(months) } : {};
}

export default function TimeRangeSelector({
  value,
  onChange,
  accent = "cyan",
}: {
  value: TimeRange;
  onChange: (range: TimeRange) => void;
  accent?: AccentKey;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap justify-end">
      <div className="flex gap-0.5 p-0.5 rounded-lg" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
        {PRESETS.map((p) => (
          <button
            key={p.key}
            onClick={() => onChange(p.key === "custom" ? { preset: "custom", start: value.start, end: value.end } : { preset: p.key })}
            className="px-2.5 py-1 rounded-md text-[11px] font-medium whitespace-nowrap transition-colors"
            style={pillStyle(value.preset === p.key, accent)}
          >
            {p.label}
          </button>
        ))}
      </div>
      {value.preset === "custom" && (
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={value.start || ""}
            onChange={(e) => onChange({ preset: "custom", start: e.target.value, end: value.end })}
            className={glassInputClass + " w-auto py-1 text-[11px]"}
            style={glassInputStyle}
          />
          <span className="text-white/25 text-[11px]">to</span>
          <input
            type="date"
            value={value.end || ""}
            onChange={(e) => onChange({ preset: "custom", start: value.start, end: e.target.value })}
            className={glassInputClass + " w-auto py-1 text-[11px]"}
            style={glassInputStyle}
          />
        </div>
      )}
    </div>
  );
}
