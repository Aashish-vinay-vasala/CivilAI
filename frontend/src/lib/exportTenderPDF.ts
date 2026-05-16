import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface GapResult {
  covered: { item: string; trade: string }[];
  missing: { item: string; trade: string; risk: string; reason: string }[];
  ambiguous: { item: string; trade: string; note: string }[];
  risk_score: number;
  risk_summary: string;
}

interface ProjectSummary {
  project_name?: string;
  client?: string;
  location?: string;
  project_type?: string;
  contract_type?: string;
  estimated_value?: string;
}

export function exportGapCheckPDF(result: GapResult, summary?: ProjectSummary) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 18;

  // ── Header bar ──────────────────────────────────────────────────────────
  doc.setFillColor(29, 78, 216); // blue-700
  doc.rect(0, 0, pageW, 28, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("Estimate Gap Check Report", margin, 12);

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text(`Generated ${new Date().toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })}`, margin, 19);
  doc.text("CivilAI — Pre-Construction", pageW - margin, 19, { align: "right" });

  let y = 38;

  // ── Project info ────────────────────────────────────────────────────────
  if (summary?.project_name) {
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text(summary.project_name, margin, y);
    y += 6;

    const meta = [
      summary.client && `Client: ${summary.client}`,
      summary.location && `Location: ${summary.location}`,
      summary.project_type && `Type: ${summary.project_type}`,
      summary.estimated_value && `Est. Value: ${summary.estimated_value}`,
    ].filter(Boolean).join("   |   ");

    if (meta) {
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100, 116, 139);
      doc.text(meta, margin, y);
      y += 8;
    }
  }

  // ── Risk score box ──────────────────────────────────────────────────────
  const scoreColor: [number, number, number] =
    result.risk_score >= 70 ? [239, 68, 68]
    : result.risk_score >= 40 ? [234, 179, 8]
    : [34, 197, 94];

  doc.setFillColor(...scoreColor);
  doc.roundedRect(margin, y, 40, 22, 3, 3, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.text(String(result.risk_score), margin + 20, y + 13, { align: "center" });
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.text("RISK SCORE", margin + 20, y + 19, { align: "center" });

  doc.setTextColor(15, 23, 42);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  const summaryLines = doc.splitTextToSize(result.risk_summary, pageW - margin * 2 - 50);
  doc.text(summaryLines, margin + 46, y + 8);

  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `${result.covered.length} covered   ${result.missing.length} missing   ${result.ambiguous.length} ambiguous`,
    margin + 46, y + 18
  );

  y += 30;

  // ── Missing items ────────────────────────────────────────────────────────
  if (result.missing.length > 0) {
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(239, 68, 68);
    doc.text(`Missing Items (${result.missing.length})`, margin, y);
    y += 4;

    autoTable(doc, {
      startY: y,
      head: [["Item", "Trade", "Risk", "Why it matters"]],
      body: result.missing.map(m => [m.item, m.trade, m.risk.toUpperCase(), m.reason]),
      margin: { left: margin, right: margin },
      headStyles: { fillColor: [239, 68, 68], textColor: 255, fontSize: 8, fontStyle: "bold" },
      bodyStyles: { fontSize: 7.5, textColor: [30, 41, 59] },
      alternateRowStyles: { fillColor: [254, 242, 242] },
      columnStyles: { 2: { cellWidth: 16, halign: "center" }, 1: { cellWidth: 28 } },
      didParseCell: (data) => {
        if (data.column.index === 2 && data.section === "body") {
          const risk = String(data.cell.raw).toLowerCase();
          data.cell.styles.textColor =
            risk === "high" ? [239, 68, 68] : risk === "medium" ? [161, 98, 7] : [21, 128, 61];
          data.cell.styles.fontStyle = "bold";
        }
      },
    });

    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  }

  // ── Ambiguous items ──────────────────────────────────────────────────────
  if (result.ambiguous.length > 0) {
    if (y > 240) { doc.addPage(); y = 20; }

    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(161, 98, 7);
    doc.text(`Ambiguous Items (${result.ambiguous.length})`, margin, y);
    y += 4;

    autoTable(doc, {
      startY: y,
      head: [["Item", "Trade", "Note"]],
      body: result.ambiguous.map(a => [a.item, a.trade, a.note]),
      margin: { left: margin, right: margin },
      headStyles: { fillColor: [234, 179, 8], textColor: 255, fontSize: 8, fontStyle: "bold" },
      bodyStyles: { fontSize: 7.5, textColor: [30, 41, 59] },
      alternateRowStyles: { fillColor: [254, 252, 232] },
      columnStyles: { 1: { cellWidth: 28 } },
    });

    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  }

  // ── Covered items ────────────────────────────────────────────────────────
  if (result.covered.length > 0) {
    if (y > 240) { doc.addPage(); y = 20; }

    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(21, 128, 61);
    doc.text(`Covered Items (${result.covered.length})`, margin, y);
    y += 4;

    autoTable(doc, {
      startY: y,
      head: [["Item", "Trade"]],
      body: result.covered.map(c => [c.item, c.trade]),
      margin: { left: margin, right: margin },
      headStyles: { fillColor: [34, 197, 94], textColor: 255, fontSize: 8, fontStyle: "bold" },
      bodyStyles: { fontSize: 7.5, textColor: [30, 41, 59] },
      alternateRowStyles: { fillColor: [240, 253, 244] },
      columnStyles: { 1: { cellWidth: 28 } },
    });
  }

  // ── Footer on every page ─────────────────────────────────────────────────
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `Page ${i} of ${pageCount}   |   CivilAI Pre-Construction   |   Confidential`,
      pageW / 2, doc.internal.pageSize.getHeight() - 8,
      { align: "center" }
    );
  }

  const filename = summary?.project_name
    ? `gap-check-${summary.project_name.replace(/[^a-z0-9]/gi, "-").toLowerCase()}.pdf`
    : "gap-check-report.pdf";

  doc.save(filename);
}
