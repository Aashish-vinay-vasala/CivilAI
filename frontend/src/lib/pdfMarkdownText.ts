import type jsPDF from "jspdf";

interface DrawMarkdownOptions {
  fontSize?: number;
  lineHeight?: number;
  fontName?: string;
  color?: [number, number, number];
}

/**
 * Draws text containing `**bold**` markdown as real bold jsPDF runs (not literal asterisks),
 * with word-wrapping to maxWidth and automatic page breaks. Returns the y position after the
 * last line drawn, so callers can continue laying out content below it.
 */
export function drawMarkdownText(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  opts: DrawMarkdownOptions = {},
): number {
  const fontName   = opts.fontName ?? "helvetica";
  const fontSize   = opts.fontSize ?? 10;
  const lineHeight = opts.lineHeight ?? fontSize * 0.52;
  const pageHeight = doc.internal.pageSize.getHeight();
  const bottomMargin = 20;

  doc.setFontSize(fontSize);
  if (opts.color) doc.setTextColor(...opts.color);

  let curY = y;
  let curX = x;

  const newLine = () => {
    curY += lineHeight;
    curX = x;
    if (curY > pageHeight - bottomMargin) {
      doc.addPage();
      curY = 20;
    }
  };

  const paragraphs = text.split(/\n+/);
  for (const para of paragraphs) {
    if (!para.trim()) { newLine(); continue; }

    // Split into bold (**...**) and plain runs, preserving order.
    const segments = para.split(/(\*\*[^*]+\*\*)/g).filter((s) => s.length > 0);

    for (const seg of segments) {
      const isBold  = seg.startsWith("**") && seg.endsWith("**") && seg.length > 3;
      const content = isBold ? seg.slice(2, -2) : seg;
      doc.setFont(fontName, isBold ? "bold" : "normal");

      const words = content.split(/(\s+)/);
      for (const word of words) {
        if (word === "") continue;
        if (/^\s+$/.test(word)) {
          curX += doc.getTextWidth(word);
          continue;
        }
        const wWidth = doc.getTextWidth(word);
        if (curX + wWidth > x + maxWidth) newLine();
        doc.text(word, curX, curY);
        curX += wWidth;
      }
    }
    newLine();
  }

  doc.setFont(fontName, "normal");
  return curY;
}
