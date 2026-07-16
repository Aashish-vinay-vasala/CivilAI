"use client";

import { parseInlineTokens, faviconProxyUrl } from "@/lib/chatTokenize";

interface ChatTextProps {
  text: string;
  /** Usually `router.push` — invoked when the user clicks a recognized module deep-link. */
  onNavigate: (href: string) => void;
}

// Renders **bold**, [markdown links](url), and recognized module keywords
// (e.g. "3 open RFIs" → a link to /rfis) — shared by the floating ModuleChat
// widget and the AI Copilot page so both render assistant replies identically.
export default function ChatText({ text, onNavigate }: ChatTextProps) {
  return (
    <>
      {parseInlineTokens(text).map((tok, i) => {
        if (tok.type === "bold") return <strong key={i}>{tok.content}</strong>;
        if (tok.type === "link") {
          return (
            <a
              key={i}
              href={tok.url}
              target="_blank"
              rel="noreferrer"
              onMouseDown={e => e.stopPropagation()}
              className="inline-flex items-center gap-1 text-cyan-400 underline decoration-cyan-400/40 hover:text-cyan-300"
            >
              <img src={faviconProxyUrl(tok.url)} alt="" className="inline-block w-3 h-3 rounded-sm" />
              {tok.content}
            </a>
          );
        }
        if (tok.type === "navlink") {
          return (
            <button
              key={i}
              onMouseDown={e => e.stopPropagation()}
              onClick={() => onNavigate(tok.href)}
              title={`Go to ${tok.href}`}
              className="font-medium text-cyan-400 underline decoration-cyan-400/40 hover:text-cyan-300"
            >
              {tok.content}
            </button>
          );
        }
        return <span key={i}>{tok.content}</span>;
      })}
    </>
  );
}
