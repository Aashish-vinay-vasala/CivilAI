import React from "react";

function parseInline(text: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**"))
      return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>;
    if (part.startsWith("*") && part.endsWith("*"))
      return <em key={i}>{part.slice(1, -1)}</em>;
    return part;
  });
}

export function MarkdownText({ text, className }: { text: string; className?: string }) {
  if (!text) return null;

  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let listItems: React.ReactNode[] = [];
  let listType: "ul" | "ol" | null = null;

  const flushList = () => {
    if (!listItems.length) return;
    const Tag = listType === "ol" ? "ol" : "ul";
    elements.push(
      <Tag
        key={`list-${elements.length}`}
        className={listType === "ol" ? "list-decimal list-inside my-1 ml-2 space-y-0.5" : "list-disc list-inside my-1 ml-2 space-y-0.5"}
      >
        {listItems}
      </Tag>
    );
    listItems = [];
    listType = null;
  };

  lines.forEach((line, i) => {
    const t = line.trim();

    if (t.startsWith("### ")) {
      flushList();
      elements.push(<p key={i} className="font-semibold mt-2 mb-0.5">{parseInline(t.slice(4))}</p>);
    } else if (t.startsWith("## ")) {
      flushList();
      elements.push(<p key={i} className="font-semibold mt-3 mb-1">{parseInline(t.slice(3))}</p>);
    } else if (t.startsWith("# ")) {
      flushList();
      elements.push(<p key={i} className="font-bold mt-3 mb-1">{parseInline(t.slice(2))}</p>);
    } else if (/^[-•*]\s/.test(t)) {
      if (listType !== "ul") { flushList(); listType = "ul"; }
      listItems.push(<li key={i}>{parseInline(t.replace(/^[-•*]\s/, ""))}</li>);
    } else if (/^\d+[.)]\s/.test(t)) {
      if (listType !== "ol") { flushList(); listType = "ol"; }
      listItems.push(<li key={i}>{parseInline(t.replace(/^\d+[.)]\s/, ""))}</li>);
    } else if (t === "") {
      flushList();
      if (elements.length > 0) elements.push(<div key={`sp-${i}`} className="h-1" />);
    } else {
      flushList();
      elements.push(<p key={i}>{parseInline(t)}</p>);
    }
  });

  flushList();
  return <div className={className}>{elements}</div>;
}
