// Builds a formatted PDF transcript of a chat conversation — shared by the
// ModuleChat widget and the AI Copilot page's "Download PDF" action. jsPDF has
// no rich-text support, so bold/link tokens are flattened into individually
// styled "pieces" (one per word) and word-wrapped by hand.

import jsPDF from "jspdf";
import { parseInlineTokens, faviconProxyUrl, type InlineToken } from "@/lib/chatTokenize";
import type { ChatMessage as Message } from "@/lib/stores/chatWidgetStore";

interface PdfPiece {
  text: string;
  bold: boolean;
  url?: string;
  iconFirst?: boolean; // true on the first word of a link, so the favicon is only drawn once
}

function tokensToPieces(tokens: InlineToken[]): PdfPiece[] {
  const pieces: PdfPiece[] = [];
  for (const tok of tokens) {
    if (tok.type === "link") {
      tok.content.split(" ").filter(Boolean).forEach((w, i) =>
        pieces.push({ text: w, bold: false, url: tok.url, iconFirst: i === 0 }));
    } else if (tok.type === "navlink") {
      // Absolute so the link still works when the PDF is opened later/elsewhere.
      const absoluteUrl = typeof window !== "undefined" ? `${window.location.origin}${tok.href}` : tok.href;
      tok.content.split(" ").filter(Boolean).forEach(w =>
        pieces.push({ text: w, bold: false, url: absoluteUrl }));
    } else {
      tok.content.split(" ").filter(Boolean).forEach(w =>
        pieces.push({ text: w, bold: tok.type === "bold" }));
    }
  }
  return pieces;
}

async function fetchFaviconDataUrl(pageUrl: string): Promise<string | null> {
  try {
    // cache: "no-store" avoids a Chromium quirk where a favicon already loaded via
    // an <img> tag (no-cors, opaque) can shadow this cors fetch() to the same URL.
    const res = await fetch(faviconProxyUrl(pageUrl), { cache: "no-store" });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function collectLinkUrls(messages: Message[]): string[] {
  const urls = new Set<string>();
  for (const m of messages) {
    for (const tok of parseInlineTokens(m.content)) {
      if (tok.type === "link") urls.add(tok.url);
    }
    (m.sources ?? []).forEach(s => urls.add(s.url));
  }
  return [...urls];
}

const PDF_MARGIN = 14;
const PDF_BOTTOM = 282;
const PDF_LINE_H = 5;

interface PdfCursor { y: number; }

function pdfNewPageIfNeeded(doc: jsPDF, cursor: PdfCursor, need = PDF_LINE_H) {
  if (cursor.y + need > PDF_BOTTOM) {
    doc.addPage();
    cursor.y = 20;
  }
}

// Word-wraps `text` (with **bold** / [link](url) tokens already resolved) onto the
// page, drawing real bold glyphs and real clickable+favicon-tagged links instead of
// literal markdown syntax.
function drawRichParagraph(
  doc: jsPDF,
  text: string,
  x: number,
  maxWidth: number,
  cursor: PdfCursor,
  faviconMap: Map<string, string>,
) {
  const iconSize = 3.2;
  for (const rawPara of text.split("\n")) {
    const para = rawPara.trim();
    if (!para) { cursor.y += PDF_LINE_H * 0.6; continue; }

    const bulletMatch = para.match(/^[-•]\s+(.*)$/);
    const paraX   = bulletMatch ? x + 4 : x;
    const paraW   = bulletMatch ? maxWidth - 4 : maxWidth;
    const pieces  = tokensToPieces(parseInlineTokens(bulletMatch ? `•  ${bulletMatch[1]}` : para));

    let cx = paraX;
    let firstOnLine = true;
    pdfNewPageIfNeeded(doc, cursor);

    for (const p of pieces) {
      doc.setFont("helvetica", p.bold ? "bold" : "normal");
      if (p.url) doc.setTextColor(37, 130, 210);
      else       doc.setTextColor(60, 60, 60);

      const hasIcon = !!(p.iconFirst && p.url && faviconMap.get(p.url));
      const iconW   = hasIcon ? iconSize + 1 : 0;
      const sepW    = firstOnLine ? 0 : doc.getTextWidth(" ");
      const textW   = doc.getTextWidth(p.text);

      if (!firstOnLine && cx + sepW + iconW + textW > paraX + paraW) {
        cursor.y += PDF_LINE_H;
        pdfNewPageIfNeeded(doc, cursor);
        cx = paraX;
        firstOnLine = true;
      }

      let drawX = cx + (firstOnLine ? 0 : sepW);
      if (hasIcon) {
        try { doc.addImage(faviconMap.get(p.url!)!, "PNG", drawX, cursor.y - iconSize + 0.9, iconSize, iconSize); } catch { /* skip malformed icon */ }
        drawX += iconW;
      }

      doc.text(p.text, drawX, cursor.y);
      if (p.url) doc.link(drawX, cursor.y - 3.3, textW, 4, { url: p.url });

      cx = drawX + textW;
      firstOnLine = false;
    }
    cursor.y += PDF_LINE_H;
  }
}

/** Builds a jsPDF document of the conversation — caller decides whether to .save() it, upload it, or both. */
export async function buildChatPdf(messages: Message[], opts: { context: string }): Promise<jsPDF> {
  // Preload every referenced favicon as a data URL up front — jsPDF.addImage
  // needs actual pixel data in hand, it can't fetch asynchronously mid-draw.
  const urls = collectLinkUrls(messages);
  const faviconMap = new Map<string, string>();
  await Promise.all(urls.map(async u => {
    const dataUrl = await fetchFaviconDataUrl(u);
    if (dataUrl) faviconMap.set(u, dataUrl);
  }));

  const doc = new jsPDF();
  const pw    = doc.internal.pageSize.getWidth();
  const bodyW = pw - PDF_MARGIN * 2;
  const cursor: PdfCursor = { y: 20 };

  // ── Cover header ──
  doc.setFontSize(18); doc.setTextColor(20, 20, 20);
  doc.setFont("helvetica", "bold");
  doc.text("CivilAI Assistant Conversation", pw / 2, cursor.y, { align: "center" });
  cursor.y += 7;
  doc.setFontSize(9); doc.setTextColor(120, 120, 120);
  doc.setFont("helvetica", "normal");
  doc.text(`${opts.context} · ${new Date().toLocaleString()}`, pw / 2, cursor.y, { align: "center" });
  cursor.y += 5;
  doc.setDrawColor(0, 180, 220);
  doc.setLineWidth(0.6);
  doc.line(PDF_MARGIN, cursor.y, pw - PDF_MARGIN, cursor.y);
  cursor.y += 10;

  for (const m of messages) {
    pdfNewPageIfNeeded(doc, cursor, 12);

    // Role tag — small colored pill
    const isUser = m.role === "user";
    const tag    = isUser ? "You" : "CivilAI Assistant";
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    const tagW = doc.getTextWidth(tag) + 6;
    doc.setFillColor(isUser ? 230 : 210, isUser ? 240 : 235, isUser ? 250 : 255);
    doc.roundedRect(PDF_MARGIN, cursor.y - 4, tagW, 6, 1.5, 1.5, "F");
    doc.setTextColor(isUser ? 30 : 20, isUser ? 100 : 110, isUser ? 180 : 190);
    doc.text(tag, PDF_MARGIN + 3, cursor.y);
    cursor.y += 7;

    // Body text — real bold, real clickable+favicon links, bullet indents
    doc.setFontSize(10);
    drawRichParagraph(doc, m.content, PDF_MARGIN, bodyW, cursor, faviconMap);

    // Sources mini-list (web-search citations), mirrors the chat UI's chips
    if (m.sources && m.sources.length > 0) {
      cursor.y += 1;
      pdfNewPageIfNeeded(doc, cursor, 6);
      doc.setFontSize(8); doc.setFont("helvetica", "bold"); doc.setTextColor(140, 140, 140);
      doc.text("SOURCES", PDF_MARGIN, cursor.y);
      cursor.y += 4.5;
      for (const s of m.sources) {
        pdfNewPageIfNeeded(doc, cursor, 5);
        const icon = faviconMap.get(s.url);
        let sx = PDF_MARGIN;
        if (icon) {
          try { doc.addImage(icon, "PNG", sx, cursor.y - 3, 3.2, 3.2); } catch { /* skip */ }
          sx += 4.2;
        }
        doc.setFontSize(8.5); doc.setFont("helvetica", "normal"); doc.setTextColor(37, 130, 210);
        const label = doc.splitTextToSize(s.title, pw - PDF_MARGIN - sx)[0] as string;
        doc.text(label, sx, cursor.y);
        doc.link(sx, cursor.y - 3, doc.getTextWidth(label), 4, { url: s.url });
        cursor.y += 4.5;
      }
    }

    // Divider between turns
    cursor.y += 3;
    pdfNewPageIfNeeded(doc, cursor, 4);
    doc.setDrawColor(230, 230, 230);
    doc.setLineWidth(0.2);
    doc.line(PDF_MARGIN, cursor.y - 2, pw - PDF_MARGIN, cursor.y - 2);
    cursor.y += 4;
  }

  // Page numbers
  const pageCount = doc.internal.pages.length - 1;
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setFontSize(8); doc.setTextColor(160, 160, 160); doc.setFont("helvetica", "normal");
    doc.text(`Page ${p} of ${pageCount}`, pw / 2, 292, { align: "center" });
  }

  return doc;
}
