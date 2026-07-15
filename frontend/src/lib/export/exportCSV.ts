import { DownloadEntriesOptions } from "./types";

function triggerDownload(content: BlobPart, mimeType: string, filename: string) {
  const blobUrl = URL.createObjectURL(new Blob([content], { type: mimeType }));
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
}

const escapeCSV = (v: unknown) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function downloadCSV({ mode, kpis, columns, rows, filenameBase }: DownloadEntriesOptions) {
  const lines: string[] = [];
  if (mode === "summary") {
    lines.push(["Metric", "Value"].join(","));
    for (const kpi of kpis) lines.push([kpi.label, kpi.value].map(escapeCSV).join(","));
  } else {
    lines.push(columns.map((c) => c.label).map(escapeCSV).join(","));
    for (const row of rows) lines.push(columns.map((c) => escapeCSV(row[c.key])).join(","));
  }
  triggerDownload(lines.join("\n"), "text/csv;charset=utf-8;", `${filenameBase}.csv`);
}
