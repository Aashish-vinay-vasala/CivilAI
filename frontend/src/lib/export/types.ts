export type ExportFormat = "pdf" | "docx" | "csv" | "xlsx";
export type ExportMode = "summary" | "full";

export interface ExportColumn {
  key: string;
  label: string;
}

export interface ExportKPI {
  label: string;
  value: string;
}

export interface DownloadEntriesOptions {
  format: ExportFormat;
  mode: ExportMode;
  title: string;
  subtitle?: string;
  kpis: ExportKPI[];
  columns: ExportColumn[];
  rows: Record<string, any>[];
  filenameBase: string;
}
