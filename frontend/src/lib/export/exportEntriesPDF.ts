import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { addHeader, addFooter } from "@/lib/exportPDF";
import { DownloadEntriesOptions } from "./types";

export function downloadEntriesPDF({ mode, title, subtitle, kpis, columns, rows, filenameBase }: DownloadEntriesOptions) {
  const doc = new jsPDF();
  addHeader(doc, title, subtitle);

  let y = 48;
  if (kpis.length > 0) {
    const kpiPairs: string[][] = [];
    for (let i = 0; i < kpis.length; i += 2) {
      const a = kpis[i];
      const b = kpis[i + 1];
      kpiPairs.push([a.label, a.value, b?.label ?? "", b?.value ?? ""]);
    }
    autoTable(doc, {
      startY: y,
      body: kpiPairs,
      theme: "grid",
      styles: { fontSize: 10, cellPadding: 4, halign: "center" },
      columnStyles: {
        0: { fontStyle: "bold", fillColor: [241, 245, 249] },
        2: { fontStyle: "bold", fillColor: [241, 245, 249] },
      },
      margin: { left: 14, right: 14 },
    });
    y = (doc as any).lastAutoTable.finalY + 10;
  }

  if (mode === "full" && rows.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [columns.map((c) => c.label)],
      body: rows.map((row) => columns.map((c) => String(row[c.key] ?? "—"))),
      theme: "striped",
      headStyles: { fillColor: [0, 212, 255], textColor: 255, fontSize: 9 },
      styles: { fontSize: 8, cellPadding: 2.5 },
      margin: { left: 14, right: 14 },
    });
  }

  addFooter(doc);
  doc.save(`${filenameBase}.pdf`);
}
