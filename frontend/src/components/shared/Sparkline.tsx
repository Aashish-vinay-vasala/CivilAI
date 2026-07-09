"use client";

import { useId } from "react";
import { LineChart, Line, AreaChart, Area, BarChart, Bar, ResponsiveContainer, Tooltip } from "recharts";

export type SparklineType = "line" | "area" | "bar";

function defaultFormat(v: number) {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
  return v.toFixed(v % 1 === 0 ? 0 : 1);
}

function MiniTooltip({ active, payload, color, valueFormatter }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div
      className="px-2 py-1 rounded-lg text-[10px] leading-tight whitespace-nowrap"
      style={{ background: "rgba(4,11,25,0.95)", border: `1px solid ${color}40`, color: "#e2e8f0" }}
    >
      {p.label && <div className="text-white/40">{p.label}</div>}
      <div className="font-semibold" style={{ color }}>{valueFormatter(p.v)}</div>
    </div>
  );
}

export default function Sparkline({
  data, color, type = "line", labels, valueFormatter = defaultFormat,
}: {
  data: number[]; color: string; type?: SparklineType;
  labels?: (string | number)[]; valueFormatter?: (v: number) => string;
}) {
  const gradientId = useId();
  if (data.length < 2) return null;
  const points = data.map((v, i) => ({ i, v, label: labels?.[i] }));
  const tooltipContent = <MiniTooltip color={color} valueFormatter={valueFormatter} />;
  // Recharts' default Tooltip cursor is a flat gray rect/line — override per chart type so the
  // hover highlight is tinted with the card's own accent color instead of looking like a theme break.
  const barCursor = { fill: color, fillOpacity: 0.12 };
  const lineCursor = { stroke: color, strokeOpacity: 0.3, strokeWidth: 1 };

  return (
    <div>
      <ResponsiveContainer width="100%" height={28}>
        {type === "area" ? (
          <AreaChart data={points} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.35} />
                <stop offset="95%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <Tooltip content={tooltipContent} cursor={lineCursor} wrapperStyle={{ zIndex: 50 }} />
            <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} fill={`url(#${gradientId})`} dot={false} isAnimationActive={false} />
          </AreaChart>
        ) : type === "bar" ? (
          <BarChart data={points} margin={{ top: 2, right: 2, bottom: 2, left: 2 }} barGap={2}>
            <Tooltip content={tooltipContent} cursor={barCursor} wrapperStyle={{ zIndex: 50 }} />
            <Bar dataKey="v" fill={color} radius={[1, 1, 0, 0]} isAnimationActive={false} />
          </BarChart>
        ) : (
          <LineChart data={points} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
            <Tooltip content={tooltipContent} cursor={lineCursor} wrapperStyle={{ zIndex: 50 }} />
            <Line type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} dot={false} isAnimationActive={false} />
          </LineChart>
        )}
      </ResponsiveContainer>
      {labels && labels.length >= 2 && (
        <div className="flex justify-between text-[9px] text-white/25 mt-0.5 px-0.5">
          <span>{labels[0]}</span>
          <span>{labels[labels.length - 1]}</span>
        </div>
      )}
    </div>
  );
}
