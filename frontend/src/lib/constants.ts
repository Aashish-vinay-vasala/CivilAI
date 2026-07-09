// Invoice statuses — single source of truth for frontend
export const INVOICE_STATUSES = ["received", "pending", "overdue"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

// Chart colours keyed by invoice/payment status
export const STATUS_COLORS: Record<InvoiceStatus, string> = {
  received: "#10b981",
  pending:  "#f59e0b",
  overdue:  "#ef4444",
};

// Tailwind badge classes keyed by status
export const STATUS_BADGE: Record<InvoiceStatus, string> = {
  received: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
  pending:  "bg-amber-500/10 text-amber-400 border border-amber-500/20",
  overdue:  "bg-red-500/10 text-red-400 border border-red-500/20",
};

// Recharts tooltip style — shared across all pages
export const CHART_TOOLTIP_STYLE: React.CSSProperties = {
  backgroundColor: "rgba(4,11,25,0.95)",
  border:          "1px solid rgba(0,212,255,0.15)",
  borderRadius:    "12px",
  color:           "#e2e8f0",
  fontSize:        "12px",
  boxShadow:       "0 8px 32px rgba(0,0,0,0.5)",
};

// Burn-rate chart colours (budget line = blue, actual spend = amber)
export const BURN_CHART_COLORS = {
  budget: "#3b82f6",
  actual: "#f59e0b",
} as const;

// Cash-flow chart colours (inflow = green, outflow = red)
export const CASHFLOW_CHART_COLORS = {
  inflow:  STATUS_COLORS.received,
  outflow: STATUS_COLORS.overdue,
} as const;

// Chart windows
export const CHART_LOOKBACK_MONTHS  = 6;
export const CHART_FORECAST_MONTHS  = 6;

// ML / cost-overrun model defaults used when DB values are unavailable
export const DEFAULT_PROJECT_TYPE         = "Commercial";
export const DEFAULT_TEAM_SIZE            = 20;
export const DEFAULT_AVG_DURATION_MONTHS  = 12;
