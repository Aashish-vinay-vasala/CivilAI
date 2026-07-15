import { Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun, HeadingLevel, WidthType } from "docx";
import { DownloadEntriesOptions } from "./types";

function labelValueRow(label: string, value: string) {
  return new TableRow({
    children: [
      new TableCell({
        width: { size: 50, type: WidthType.PERCENTAGE },
        children: [new Paragraph({ children: [new TextRun({ text: label, bold: true })] })],
      }),
      new TableCell({
        width: { size: 50, type: WidthType.PERCENTAGE },
        children: [new Paragraph(value)],
      }),
    ],
  });
}

export async function downloadDocx({ mode, title, subtitle, kpis, columns, rows, filenameBase }: DownloadEntriesOptions) {
  const children: (Paragraph | Table)[] = [
    new Paragraph({ text: title, heading: HeadingLevel.HEADING_1 }),
  ];
  if (subtitle) children.push(new Paragraph({ text: subtitle }));

  if (kpis.length > 0) {
    children.push(new Paragraph({ text: "Summary", heading: HeadingLevel.HEADING_2, spacing: { before: 200 } }));
    children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: kpis.map((k) => labelValueRow(k.label, k.value)) }));
  }

  if (mode === "full" && rows.length > 0) {
    children.push(new Paragraph({ text: "Entries", heading: HeadingLevel.HEADING_2, spacing: { before: 300 } }));
    const headerRow = new TableRow({
      children: columns.map((c) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: c.label, bold: true })] })] })),
    });
    const dataRows = rows.map((row) => new TableRow({
      children: columns.map((c) => new TableCell({ children: [new Paragraph(String(row[c.key] ?? "—"))] })),
    }));
    children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [headerRow, ...dataRows] }));
  }

  const doc = new Document({ sections: [{ children }] });
  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filenameBase}.docx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
