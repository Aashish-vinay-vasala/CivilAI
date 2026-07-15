import * as XLSX from "xlsx";
import { DownloadEntriesOptions } from "./types";

export function downloadExcel({ mode, kpis, columns, rows, filenameBase }: DownloadEntriesOptions) {
  const wb = XLSX.utils.book_new();
  if (mode === "summary") {
    const sheetRows = kpis.map((k) => ({ Metric: k.label, Value: k.value }));
    const ws = XLSX.utils.json_to_sheet(sheetRows);
    XLSX.utils.book_append_sheet(wb, ws, "Summary");
  } else {
    const sheetRows = rows.map((row) => {
      const out: Record<string, any> = {};
      for (const c of columns) out[c.label] = row[c.key];
      return out;
    });
    const ws = XLSX.utils.json_to_sheet(sheetRows);
    XLSX.utils.book_append_sheet(wb, ws, "Entries");
  }
  XLSX.writeFile(wb, `${filenameBase}.xlsx`);
}
