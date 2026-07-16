// Shared text tokenizer for chat message content — turns **bold**, markdown
// [links](url), and recognized module keywords (e.g. "3 open RFIs") into
// structured tokens that both the floating ModuleChat widget and the AI
// Copilot page render identically (and that the PDF export re-flows by hand,
// since jsPDF has no rich-text support of its own).

const API = process.env.NEXT_PUBLIC_API_URL ?? "";

export type InlineToken =
  | { type: "text"; content: string }
  | { type: "bold"; content: string }
  | { type: "link"; content: string; url: string }
  | { type: "navlink"; content: string; href: string };

// Recognized module keywords → internal route, for turning plain mentions like
// "3 open RFIs" into an in-app link. Ordered roughly most- to least-specific;
// first match wins at each position so more specific phrases beat generic ones.
const MODULE_LINKS: { re: RegExp; href: string }[] = [
  { re: /\bRFIs?\b/i,                                   href: "/rfis" },
  { re: /\bsafety incidents?\b/i,                       href: "/safety" },
  { re: /\bsafety score\b/i,                            href: "/safety" },
  { re: /\bcost overruns?\b/i,                          href: "/cost" },
  { re: /\bbudget\b/i,                                  href: "/cost" },
  { re: /\b(?:EVM|earned value management|CPI|SPI)\b/,  href: "/evm" },
  { re: /\bcritical path\b/i,                           href: "/scheduling" },
  { re: /\bschedul(?:e|ing|ed) (?:tasks?|delays?)\b/i,   href: "/scheduling" },
  { re: /\bworkforce\b/i,                                href: "/workforce" },
  { re: /\bequipment\b/i,                                href: "/equipment" },
  { re: /\bchange orders?\b/i,                           href: "/contracts" },
  { re: /\bcontracts?\b/i,                                href: "/contracts" },
  { re: /\bpermits?\b/i,                                  href: "/compliance" },
  { re: /\bpurchase orders?\b/i,                          href: "/procurement" },
  { re: /\bvendors?\b/i,                                  href: "/vendors" },
  { re: /\binvoices?\b/i,                                 href: "/payments" },
  { re: /\bpayments?\b/i,                                 href: "/payments" },
  { re: /\bsubmittals?\b/i,                               href: "/documents" },
  { re: /\bdaily reports?\b/i,                            href: "/daily-reports" },
  { re: /\bmeetings?\b/i,                                 href: "/meetings" },
  { re: /\banomal(?:y|ies)\b/i,                           href: "/anomaly" },
  { re: /\bsupport tickets?\b/i,                          href: "/support" },
];

// Splits a plain-text run into text/navlink pieces by finding the earliest
// MODULE_LINKS match and recursing on the remainder.
export function linkifyModules(text: string): InlineToken[] {
  let earliest: { index: number; length: number; href: string } | null = null;
  for (const { re, href } of MODULE_LINKS) {
    const m = re.exec(text);
    if (m && (earliest === null || m.index < earliest.index)) {
      earliest = { index: m.index, length: m[0].length, href };
    }
  }
  if (!earliest) return text ? [{ type: "text", content: text }] : [];
  const before = text.slice(0, earliest.index);
  const match   = text.slice(earliest.index, earliest.index + earliest.length);
  const after   = text.slice(earliest.index + earliest.length);
  const tokens: InlineToken[] = [];
  if (before) tokens.push({ type: "text", content: before });
  tokens.push({ type: "navlink", content: match, href: earliest.href });
  tokens.push(...linkifyModules(after));
  return tokens;
}

// Splits message text into plain / **bold** / [markdown link](url) segments, in
// order, then further expands plain-text runs into recognized module deep-links.
export function parseInlineTokens(text: string): InlineToken[] {
  const rawTokens: InlineToken[] = [];
  const re = /(\*\*[^*]+\*\*)|(\[[^\]]+\]\(https?:\/\/[^\s)]+\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) rawTokens.push({ type: "text", content: text.slice(lastIndex, match.index) });
    if (match[1]) {
      rawTokens.push({ type: "bold", content: match[1].slice(2, -2) });
    } else if (match[2]) {
      const linkMatch = match[2].match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
      if (linkMatch) rawTokens.push({ type: "link", content: linkMatch[1], url: linkMatch[2] });
    }
    lastIndex = re.lastIndex;
  }
  if (lastIndex < text.length) rawTokens.push({ type: "text", content: text.slice(lastIndex) });

  const tokens: InlineToken[] = [];
  for (const tok of rawTokens) {
    if (tok.type === "text") tokens.push(...linkifyModules(tok.content));
    else tokens.push(tok);
  }
  return tokens;
}

// Proxied through our own backend (not called directly) — the favicon provider
// sends no CORS headers, so a raw <img src="https://www.google.com/s2/favicons...">
// would display fine but couldn't be read as pixel data for the PDF export.
export function faviconProxyUrl(pageUrl: string): string {
  return `${API}/api/v1/copilot/favicon?url=${encodeURIComponent(pageUrl)}`;
}
