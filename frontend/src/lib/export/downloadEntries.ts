import { downloadCSV } from "./exportCSV";
import { downloadExcel } from "./exportExcel";
import { downloadEntriesPDF } from "./exportEntriesPDF";
import { downloadDocx } from "./exportDocx";
import { DownloadEntriesOptions } from "./types";

export * from "./types";

export async function downloadEntries(options: DownloadEntriesOptions) {
  switch (options.format) {
    case "csv":
      return downloadCSV(options);
    case "xlsx":
      return downloadExcel(options);
    case "pdf":
      return downloadEntriesPDF(options);
    case "docx":
      return downloadDocx(options);
  }
}
