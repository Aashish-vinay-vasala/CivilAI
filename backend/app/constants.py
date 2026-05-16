MONTH_NAMES = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]

INVOICE_STATUSES = ("received", "pending", "overdue")

# Chart time windows
CHART_LOOKBACK_MONTHS = 6
CHART_FORECAST_MONTHS = 6

# Invoice list page size returned by the GET /invoices endpoint
INVOICE_LIST_LIMIT = 20

# KPI / scoring
SAFETY_SCORE_INCIDENT_PENALTY = 5    # points deducted per incident
BUDGET_MONTHS = 12                    # months used to spread annual budget
DEFAULT_AVG_DURATION_MONTHS = 12      # fallback when no project dates exist

# Cash-flow projection
BURN_RATE_MULTIPLIER = 0.85           # future outflow = recent avg * this

# Activity log
ALERT_LIMIT = 8                       # max alerts returned by /alerts

# Time formatting thresholds (seconds)
SECONDS_PER_HOUR = 3600
SECONDS_PER_DAY = 86400

# Maps module keywords → alert severity displayed on the dashboard
MODULE_ALERT_TYPE: dict[str, str] = {
    "cost":       "warning",
    "budget":     "warning",
    "safety":     "error",
    "incident":   "error",
    "permit":     "success",
    "compliance": "success",
}
