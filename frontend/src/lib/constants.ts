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
  received: "bg-emerald-500/10 text-emerald-400",
  pending:  "bg-orange-500/10 text-orange-400",
  overdue:  "bg-red-500/10 text-red-400",
};

// Recharts tooltip style — shared across all pages
export const CHART_TOOLTIP_STYLE: React.CSSProperties = {
  backgroundColor: "#0f172a",
  border:          "1px solid #1e293b",
  borderRadius:    "12px",
  color:           "#f8fafc",
  fontSize:        "12px",
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
