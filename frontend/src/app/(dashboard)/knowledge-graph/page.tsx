"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import axios from "axios";
import {
  Building2, Users, FileText, HelpCircle, DollarSign, ClipboardCheck,
  AlertTriangle, Target, X, Sparkles, UploadCloud, HardHat, Truck,
  ClipboardList, FileCheck, ShieldCheck, Boxes, Filter, Loader2, RefreshCw,
} from "lucide-react";

// ─── Node/edge model — shared shape for both the sample demo graph and the
// real per-project graph fetched from the backend, so one layout/render
// pipeline drives both. ──────────────────────────────────────────────────────

type NodeType =
  | "project" | "party" | "document" | "rfi" | "change_order" | "obligation" | "risk" | "milestone"
  | "worker" | "vendor" | "task" | "incident" | "submittal" | "permit" | "category";

interface GNode {
  id: string;
  type: NodeType;
  label: string;
  detail?: string;
  status?: string;
  parentId?: string;
  relation?: string;
}

// ─── Sample data model ──────────────────────────────────────────────────────
// This taxonomy (Party/Document/Change Order/Obligation/Risk/Milestone) has no
// backing tables in the database — confirmed earlier (no milestones,
// change_orders, obligations, or risks tables exist, contracts is empty).
// This is deliberately a self-contained demo dataset, exactly like the
// reference tool's own "Demo graph — upload documents to see your project"
// behavior: realistic sample content standing in until a document-extraction
// pipeline could populate it for real.

const SAMPLE_DATA: GNode[] = [
  { id: "project", type: "project", label: "Lakeside Commercial Center", detail: "$8.2M · Mar 2026", status: "At Risk" },

  { id: "party-owner", type: "party", label: "Meridian Property Group", detail: "Owner", status: "Active", parentId: "project", relation: "contractual" },
  { id: "party-gc",    type: "party", label: "Coastline Builders Inc", detail: "General Contractor", status: "Active", parentId: "project", relation: "contractual" },
  { id: "party-arch",  type: "party", label: "Vantage Architecture Studio", detail: "Architect of Record", status: "Active", parentId: "project", relation: "contractual" },
  { id: "party-mep",   type: "party", label: "ProTech Mechanical Systems", detail: "MEP Subcontractor", status: "Active", parentId: "project", relation: "contractual" },

  { id: "doc-contract", type: "document", label: "Prime Contract", detail: "Lump Sum · 5% retention", status: "Active", parentId: "party-owner", relation: "ownership" },
  { id: "doc-struct",   type: "document", label: "Structural Drawings", detail: "Rev 4 · 28 sheets", status: "Active", parentId: "party-arch", relation: "ownership" },
  { id: "doc-spec",     type: "document", label: "Project Specifications", detail: "CSI MasterFormat", status: "Active", parentId: "party-arch", relation: "ownership" },

  { id: "ms-foundation", type: "milestone", label: "Foundation Complete", detail: "Target: Mar 28, 2026", status: "At Risk", parentId: "doc-spec", relation: "milestone" },
  { id: "ms-topping",    type: "milestone", label: "Structural Topping Out", detail: "Target: Jun 15, 2026", status: "Active", parentId: "party-mep", relation: "milestone" },

  { id: "rfi-rebar",  type: "rfi", label: "Rebar Spec Clarification", detail: "Grid C4 · Structural", status: "Open", parentId: "doc-struct", relation: "rfi_reference" },
  { id: "rfi-water",  type: "rfi", label: "Waterproofing Detail", detail: "Basement Level", status: "Overdue", parentId: "doc-spec", relation: "rfi_reference" },
  { id: "rfi-hvac",   type: "rfi", label: "HVAC Duct Routing", detail: "Level 3 Coordination", status: "Open", parentId: "ms-foundation", relation: "rfi_reference" },

  { id: "co-rock",  type: "change_order", label: "Rock Excavation", detail: "$45,000", status: "Approved", parentId: "doc-spec", relation: "change_order_link" },
  { id: "co-water", type: "change_order", label: "Waterproofing Upgrade", detail: "$34,500", status: "Pending", parentId: "ms-topping", relation: "change_order_link" },

  { id: "ob-delay",  type: "obligation", label: "Notice of Delay", detail: "Within 48h of event", status: "Active", parentId: "rfi-rebar", relation: "obligation" },
  { id: "ob-report", type: "obligation", label: "Monthly Progress Report", detail: "Due 1st of each month", status: "Active", parentId: "rfi-water", relation: "obligation" },
  { id: "ob-retain", type: "obligation", label: "Retention Release", detail: "On practical completion", status: "Active", parentId: "co-rock", relation: "obligation" },

  { id: "risk-lds", type: "risk", label: "Liquidated Damages Exposure", detail: "$2,000/day · 2 days behind", status: "High", parentId: "co-water", relation: "risk_link" },
  { id: "risk-rfi", type: "risk", label: "RFI Delay Claim", detail: "3 RFIs overdue 14+ days", status: "High", parentId: "rfi-hvac", relation: "risk_link" },
];

// ─── Real-data fetch + transform ────────────────────────────────────────────
// backend/app/api/v1/routes/knowledge_graph.py returns a flat graph — every
// item connects directly to its project, no genuine multi-level depth like
// the sample data has. Connecting 9 workers + tasks + RFIs all straight to
// one project card is the "wire tangle" this page had earlier; grouping them
// under a synthetic category node per type (real data, real relation, just
// drawn via one extra hop) keeps the same real relationships while reading
// as a tree instead of a hairball — same fix as the live-data-only version,
// generalized to share this page's layout/render pipeline.

interface RawNode {
  id: string; label: string; type: string; status?: string;
  role?: string; vendor_type?: string; delay_days?: number; severity?: string;
  priority?: string; submittal_type?: string; permit_type?: string;
}
interface RawEdge { source: string; target: string; relation: string }

const REAL_CATEGORY_ORDER: NodeType[] = ["worker", "vendor", "task", "rfi", "submittal", "permit", "incident"];

function realDetail(n: RawNode): string | undefined {
  switch (n.type) {
    case "worker": return n.role;
    case "vendor": return n.vendor_type;
    case "task": return n.delay_days ? `${n.delay_days}d delay` : undefined;
    case "incident": return n.severity ? `Severity: ${n.severity}` : undefined;
    case "rfi": return n.priority ? `Priority: ${n.priority}` : undefined;
    case "submittal": return n.submittal_type;
    case "permit": return n.permit_type;
    default: return undefined;
  }
}

function buildRealGraph(nodes: RawNode[], edges: RawEdge[], projectId: string): GNode[] {
  const project = nodes.find((n) => n.id === projectId);
  if (!project) return [];
  const result: GNode[] = [{ id: project.id, type: "project", label: project.label, status: project.status }];
  const byType: Record<string, RawNode[]> = {};
  const relationOf = new Map<string, string>();
  for (const e of edges) {
    if (e.source !== projectId) continue;
    const child = nodes.find((n) => n.id === e.target);
    if (!child) continue;
    (byType[child.type] ??= []).push(child);
    relationOf.set(child.id, e.relation);
  }
  for (const type of REAL_CATEGORY_ORDER) {
    const items = byType[type];
    if (!items?.length) continue;
    const catId = `cat:${type}`;
    result.push({ id: catId, type: "category", label: `${NODE_STYLE[type].label} · ${items.length}`, parentId: project.id, relation: "groups" });
    for (const item of items) {
      result.push({
        id: item.id, type: item.type as NodeType, label: item.label,
        detail: realDetail(item), status: item.status,
        parentId: catId, relation: relationOf.get(item.id),
      });
    }
  }
  return result;
}

// ─── Style tables ───────────────────────────────────────────────────────────
// Sample-only and real-only types never render in the same graph at once, so
// color slots are freely reused across the two sets without visual clash.

const NODE_STYLE: Record<NodeType, { color: string; icon: typeof Building2; label: string }> = {
  project:      { color: "#4f9dff", icon: Building2,     label: "Project" },
  party:        { color: "#1fe0a0", icon: Users,          label: "Party / Stakeholder" },
  document:     { color: "#a78bfa", icon: FileText,       label: "Document" },
  rfi:          { color: "#ffb020", icon: HelpCircle,     label: "Request for Information (RFI)" },
  change_order: { color: "#ff5c93", icon: DollarSign,     label: "Change Order" },
  obligation:   { color: "#f5d90a", icon: ClipboardCheck, label: "Obligation" },
  risk:         { color: "#ff4757", icon: AlertTriangle,  label: "Risk" },
  milestone:    { color: "#22d3ee", icon: Target,         label: "Milestone" },
  worker:       { color: "#ff7a3d", icon: HardHat,        label: "Worker" },
  vendor:       { color: "#14b8a6", icon: Truck,          label: "Vendor" },
  task:         { color: "#f5d90a", icon: ClipboardList,  label: "Schedule Task" },
  incident:     { color: "#ff4757", icon: AlertTriangle,  label: "Safety Incident" },
  submittal:    { color: "#a78bfa", icon: FileCheck,      label: "Submittal" },
  permit:       { color: "#22d3ee", icon: ShieldCheck,    label: "Permit" },
  category:     { color: "#8b93a7", icon: Boxes,          label: "Category" },
};

const RELATION_STYLE: Record<string, { color: string; label: string; dashed?: boolean }> = {
  contractual:       { color: "#1fe0a0", label: "Contractual relationship" },
  ownership:         { color: "#a78bfa", label: "Document ownership" },
  rfi_reference:     { color: "#ffb020", label: "RFI reference" },
  change_order_link: { color: "#ff5c93", label: "Change order link" },
  obligation:        { color: "#f5d90a", label: "Obligation" },
  risk_link:         { color: "#ff4757", label: "Risk link" },
  milestone:         { color: "#22d3ee", label: "Milestone", dashed: true },
  works_on:          { color: "#ff7a3d", label: "Works on" },
  supplies:          { color: "#14b8a6", label: "Supplies" },
  part_of:           { color: "#f5d90a", label: "Part of" },
  occurred_on:       { color: "#ff4757", label: "Occurred on" },
  raised_on:         { color: "#ffb020", label: "Raised on" },
  submitted_for:     { color: "#a78bfa", label: "Submitted for" },
  required_for:      { color: "#22d3ee", label: "Required for" },
  groups:            { color: "#8b93a7", label: "Groups" },
};

const STATUS_COLOR: Record<string, string> = {
  active: "#0ca30c", approved: "#0ca30c", "on track": "#0ca30c", resolved: "#0ca30c",
  done: "#0ca30c", closed: "#0ca30c", low: "#0ca30c",
  "at risk": "#f5b400", pending: "#f5b400", open: "#f5b400", onleave: "#f5b400",
  atrisk: "#f5b400", medium: "#f5b400", approved_with_comments: "#f5b400",
  inprogress: "#4f9dff", under_review: "#4f9dff",
  inactive: "#8b93a7",
  overdue: "#e0342f", high: "#e0342f", critical: "#e0342f", delayed: "#e0342f", rejected: "#e0342f",
};

function statusColor(status?: string): string {
  if (!status) return "#8b93a7";
  return STATUS_COLOR[status.toLowerCase()] ?? "#8b93a7";
}

// ─── Layout — BFS depth from the root, with each level's nodes grouped by
// parent and wrapped into rows of at most MAX_ROW_ITEMS. Grouping-by-parent
// (not a single global wrap) keeps one category's items from bleeding into
// a neighboring category's row when a level has a lot of nodes (e.g. 9
// workers alongside 2 tasks and 4 RFIs, all at the same depth). ────────────

const CARD_W = 236;
const CARD_H = 108;
const GAP_X = 28;
const ROW_GAP = 22;
const LEVEL_GAP = 74;
const PAD = 60;
const MAX_ROW_ITEMS = 5;

interface LayoutResult {
  positions: Map<string, { x: number; y: number }>;
  width: number;
  height: number;
}

function computeLayout(nodes: GNode[]): LayoutResult {
  if (nodes.length === 0) return { positions: new Map(), width: CARD_W + PAD * 2, height: CARD_H + PAD * 2 };
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const childrenOf = new Map<string, GNode[]>();
  for (const n of nodes) {
    if (n.parentId) {
      const list = childrenOf.get(n.parentId) ?? [];
      list.push(n);
      childrenOf.set(n.parentId, list);
    }
  }
  const root = nodes.find((n) => !n.parentId)!;

  const depth = new Map<string, number>([[root.id, 0]]);
  const queue = [root.id];
  while (queue.length) {
    const id = queue.shift()!;
    const d = depth.get(id)!;
    for (const kid of childrenOf.get(id) ?? []) {
      depth.set(kid.id, d + 1);
      queue.push(kid.id);
    }
  }
  const maxDepth = Math.max(...Array.from(depth.values()));

  const rowsPerLevel: string[][][] = [];
  for (let lvl = 0; lvl <= maxDepth; lvl++) {
    const idsAtLevel = nodes.filter((n) => depth.get(n.id) === lvl).map((n) => n.id);
    if (lvl === 0) { rowsPerLevel[0] = [idsAtLevel]; continue; }
    const byParent = new Map<string, string[]>();
    for (const id of idsAtLevel) {
      const p = byId.get(id)!.parentId!;
      const list = byParent.get(p) ?? [];
      list.push(id);
      byParent.set(p, list);
    }
    const rows: string[][] = [];
    for (const ids of byParent.values()) {
      for (let i = 0; i < ids.length; i += MAX_ROW_ITEMS) rows.push(ids.slice(i, i + MAX_ROW_ITEMS));
    }
    rowsPerLevel[lvl] = rows;
  }

  let maxWidth = CARD_W;
  for (const rows of rowsPerLevel) {
    for (const row of rows) maxWidth = Math.max(maxWidth, row.length * CARD_W + (row.length - 1) * GAP_X);
  }
  const width = maxWidth + PAD * 2;

  const positions = new Map<string, { x: number; y: number }>();
  let cursorY = PAD;
  rowsPerLevel.forEach((rows) => {
    rows.forEach((row) => {
      const rowWidth = row.length * CARD_W + (row.length - 1) * GAP_X;
      const startX = (width - rowWidth) / 2;
      row.forEach((id, i) => positions.set(id, { x: startX + i * (CARD_W + GAP_X), y: cursorY }));
      cursorY += CARD_H + ROW_GAP;
    });
    cursorY += LEVEL_GAP - ROW_GAP;
  });
  const height = cursorY;

  return { positions, width, height };
}

// ─── Card ───────────────────────────────────────────────────────────────────

function NodeCard({
  node, x, y, dimmed, highlighted, onSelect, onDragStart, onHover,
}: {
  node: GNode; x: number; y: number; dimmed: boolean; highlighted: boolean;
  onSelect: (n: GNode) => void;
  onDragStart: (id: string, e: React.PointerEvent) => void;
  onHover: (id: string | null) => void;
}) {
  const style = NODE_STYLE[node.type];
  const Icon = style.icon;
  const isRoot = node.type === "project";
  const isCategory = node.type === "category";

  const dragHandlers = {
    onPointerDown: (e: React.PointerEvent) => { e.stopPropagation(); onDragStart(node.id, e); },
    onClick: (e: React.MouseEvent) => { e.stopPropagation(); onSelect(node); },
    onPointerEnter: () => onHover(node.id),
    onPointerLeave: () => onHover(null),
  };

  if (isCategory) {
    return (
      <div
        {...dragHandlers}
        className="absolute rounded-full flex items-center justify-center gap-2 px-4 cursor-grab active:cursor-grabbing select-none transition-all duration-150"
        style={{
          left: x, top: y, width: CARD_W, height: 42,
          background: `linear-gradient(90deg, ${style.color}70, ${style.color}30)`,
          border: `1.5px solid ${style.color}`,
          boxShadow: highlighted ? `0 0 22px ${style.color}90` : `0 0 12px ${style.color}50`,
          opacity: dimmed ? 0.28 : 1,
        }}
      >
        <Icon className="w-3.5 h-3.5 shrink-0 text-white" />
        <span className="text-[11px] font-bold uppercase tracking-wider truncate text-white">{node.label}</span>
      </div>
    );
  }

  return (
    <div
      {...dragHandlers}
      className="absolute rounded-[10px] p-3.5 flex flex-col gap-1.5 overflow-hidden cursor-grab active:cursor-grabbing select-none transition-all duration-150"
      style={{
        left: x, top: y,
        width: isRoot ? CARD_W * 1.15 : CARD_W,
        height: isRoot ? CARD_H * 1.1 : CARD_H,
        background: `linear-gradient(135deg, ${style.color}26, ${style.color}0a)`,
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        border: `1px solid ${style.color}`,
        boxShadow: highlighted ? `0 0 20px ${style.color}70` : `0 0 13px ${style.color}40`,
        opacity: dimmed ? 0.28 : 1,
      }}
    >
      <div className="flex items-center gap-1.5">
        <Icon className="w-3.5 h-3.5 shrink-0" style={{ color: style.color }} strokeWidth={1.75} />
        <span className="text-[11px] font-bold tracking-wider uppercase truncate" style={{ color: style.color }}>
          {style.label.split(" / ")[0].split(" (")[0]}
        </span>
      </div>
      <p className="text-white text-[14px] font-semibold leading-snug" title={node.label}>{node.label}</p>
      {node.detail && <p className="text-[#8b93a7] text-[11px] leading-snug">{node.detail}</p>}
      {node.status && (
        <span
          className="mt-auto self-start text-[11px] font-semibold px-2 py-0.5 rounded-full"
          style={{ background: statusColor(node.status) + "26", color: statusColor(node.status) }}
        >
          {node.status}
        </span>
      )}
    </div>
  );
}

// ─── Minimap ────────────────────────────────────────────────────────────────

function Minimap({
  layout, getPos, view, viewportSize, nodes,
}: {
  layout: LayoutResult; getPos: (id: string) => { x: number; y: number };
  view: { x: number; y: number; scale: number }; viewportSize: { w: number; h: number };
  nodes: GNode[];
}) {
  const MINI_W = 160, MINI_H = 110;
  const scale = Math.min(MINI_W / layout.width, MINI_H / layout.height);
  const visible = {
    x: -view.x / view.scale, y: -view.y / view.scale,
    w: viewportSize.w / view.scale, h: viewportSize.h / view.scale,
  };
  return (
    <div className="absolute right-4 top-16 rounded-lg overflow-hidden"
      style={{ width: MINI_W, height: MINI_H, background: "rgba(10,14,20,0.92)", border: "1px solid rgba(255,255,255,0.1)" }}>
      <svg width={MINI_W} height={MINI_H}>
        {nodes.map((n) => {
          const pos = getPos(n.id);
          return (
            <rect key={n.id} x={pos.x * scale} y={pos.y * scale}
              width={Math.max(3, CARD_W * scale)} height={Math.max(3, CARD_H * scale)}
              rx={1} fill={NODE_STYLE[n.type].color} opacity={0.85} />
          );
        })}
        <rect x={visible.x * scale} y={visible.y * scale} width={visible.w * scale} height={visible.h * scale}
          fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.5)" strokeWidth={1} />
      </svg>
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function KnowledgeGraphPage() {
  const [mode, setMode] = useState("demo");
  const [realNodes, setRealNodes] = useState<RawNode[]>([]);
  const [realEdges, setRealEdges] = useState<RawEdge[]>([]);
  const [loadingReal, setLoadingReal] = useState(true);

  const [selected, setSelected] = useState<GNode | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [dragOverrides, setDragOverrides] = useState<Record<string, { x: number; y: number }>>({});
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 });
  const [viewportSize, setViewportSize] = useState({ w: 0, h: 640 });

  const viewportRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{ id: string; startX: number; startY: number; origin: { x: number; y: number }; moved: boolean } | null>(null);
  const panState = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
  const justDragged = useRef(false);

  const fetchRealData = useCallback(() => {
    setLoadingReal(true);
    return axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/knowledge-graph/data`)
      .then((res) => { setRealNodes(res.data.nodes ?? []); setRealEdges(res.data.edges ?? []); })
      .catch(() => {})
      .finally(() => setLoadingReal(false));
  }, []);

  useEffect(() => { fetchRealData(); }, [fetchRealData]);

  const realProjects = useMemo(() => realNodes.filter((n) => n.type === "project"), [realNodes]);

  const activeData = useMemo(
    () => (mode === "demo" ? SAMPLE_DATA : buildRealGraph(realNodes, realEdges, mode)),
    [mode, realNodes, realEdges]
  );

  const layout = useMemo(() => computeLayout(activeData), [activeData]);
  const byId = useMemo(() => new Map(activeData.map((n) => [n.id, n])), [activeData]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const update = () => setViewportSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setDragOverrides({});
    if (viewportSize.w > 0) {
      setView({ x: Math.max(190, (viewportSize.w - layout.width) / 2), y: 40, scale: 1 });
    }
  }, [layout, viewportSize.w]);

  const getPos = useCallback(
    (id: string) => dragOverrides[id] ?? layout.positions.get(id) ?? { x: 0, y: 0 },
    [dragOverrides, layout]
  );

  const handleDragStart = useCallback((id: string, e: React.PointerEvent) => {
    const pos = getPos(id);
    dragState.current = { id, startX: e.clientX, startY: e.clientY, origin: pos, moved: false };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [getPos]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const d = dragState.current;
    if (d) {
      const dx = (e.clientX - d.startX) / view.scale, dy = (e.clientY - d.startY) / view.scale;
      if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
      setDragOverrides((prev) => ({ ...prev, [d.id]: { x: d.origin.x + dx, y: d.origin.y + dy } }));
      return;
    }
    const p = panState.current;
    if (p) setView((v) => ({ ...v, x: p.originX + (e.clientX - p.startX), y: p.originY + (e.clientY - p.startY) }));
  }, [view.scale]);

  const handlePointerUp = useCallback(() => {
    if (dragState.current?.moved) justDragged.current = true;
    dragState.current = null;
    panState.current = null;
  }, []);

  const handleCanvasPointerDown = useCallback((e: React.PointerEvent) => {
    panState.current = { startX: e.clientX, startY: e.clientY, originX: view.x, originY: view.y };
  }, [view.x, view.y]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setView((v) => ({ ...v, scale: Math.min(2.5, Math.max(0.25, v.scale - e.deltaY * 0.001)) }));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const handleSelect = useCallback((node: GNode) => {
    if (justDragged.current) { justDragged.current = false; return; }
    setSelected(node);
  }, []);

  const highlightedIds = useMemo(() => {
    if (!hoveredId) return null;
    const set = new Set<string>([hoveredId]);
    const node = byId.get(hoveredId);
    if (node?.parentId) set.add(node.parentId);
    for (const n of activeData) if (n.parentId === hoveredId) set.add(n.id);
    return set;
  }, [hoveredId, byId, activeData]);

  const presentTypes = useMemo(
    () => Array.from(new Set(activeData.map((n) => n.type))).filter((t) => t !== "category"),
    [activeData]
  );
  const presentRelations = useMemo(
    () => Array.from(new Set(activeData.map((n) => n.relation).filter((r): r is string => !!r && r !== "groups"))),
    [activeData]
  );

  return (
    <div className="space-y-4" style={{ fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif" }}>
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Knowledge Graph</h1>
          <p className="text-[#8b93a7] text-sm mt-1">Project entities · Relationships · Connected intelligence</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <Filter className="w-3.5 h-3.5 text-white/40" />
            <select value={mode} onChange={(e) => setMode(e.target.value)} className="bg-transparent text-white/70 outline-none">
              <option value="demo" className="bg-slate-900">Demo</option>
              {realProjects.map((p) => (
                <option key={p.id} value={p.id} className="bg-slate-900">{p.label}</option>
              ))}
            </select>
          </div>
          <button
            onClick={() => fetchRealData()}
            disabled={loadingReal}
            title="Refresh project list — new projects won't appear here until you refresh"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-white/50 hover:text-white/80 transition-colors"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            {loadingReal ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Refresh
          </button>
        </div>
      </motion.div>

      <div
        ref={viewportRef}
        className="relative overflow-hidden rounded-2xl"
        style={{
          height: "calc(100vh - 220px)", minHeight: 520, touchAction: "none",
          background: "radial-gradient(ellipse 60% 50% at 50% 35%, rgba(79,157,255,0.06), transparent 70%), #0a0e14",
          border: "1px solid rgba(255,255,255,0.06)",
        }}
        onPointerDown={handleCanvasPointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {mode === "demo" ? (
          <div className="absolute left-1/2 -translate-x-1/2 top-4 flex items-center gap-2 px-4 py-2 rounded-full text-xs text-white/70"
            style={{ background: "rgba(20,25,36,0.9)", border: "1px solid rgba(255,255,255,0.1)" }}>
            <UploadCloud className="w-3.5 h-3.5 text-[#4f9dff]" />
            Demo graph — upload documents to see your project
          </div>
        ) : (
          <div className="absolute left-1/2 -translate-x-1/2 top-4 flex items-center gap-2 px-4 py-2 rounded-full text-xs text-white/70"
            style={{ background: "rgba(20,25,36,0.9)", border: "1px solid rgba(31,224,160,0.3)" }}>
            <span className="w-1.5 h-1.5 rounded-full bg-[#1fe0a0]" style={{ boxShadow: "0 0 6px #1fe0a0" }} />
            Live project data
          </div>
        )}

        {mode !== "demo" && loadingReal && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-[#4f9dff]" />
          </div>
        )}

        {(mode === "demo" || !loadingReal) && (
          <div
            className="absolute cursor-grab active:cursor-grabbing"
            style={{
              left: 0, top: 0, width: layout.width, height: layout.height,
              transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
              transformOrigin: "0 0",
            }}
          >
            <svg className="absolute inset-0" width={layout.width} height={layout.height}>
              <defs>
                <filter id="edge-glow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="1.6" result="blur" />
                  <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
              </defs>
              {activeData.filter((n) => n.parentId).map((n) => {
                const parentPos = getPos(n.parentId!);
                const parent = byId.get(n.parentId!)!;
                const parentIsCategory = parent.type === "category";
                const parentH = parentIsCategory ? 42 : parent.type === "project" ? CARD_H * 1.1 : CARD_H;
                const parentW = parentIsCategory ? CARD_W : parent.type === "project" ? CARD_W * 1.15 : CARD_W;
                const from = { x: parentPos.x + parentW / 2, y: parentPos.y + parentH };
                const to = getPos(n.id);
                const toCenter = { x: to.x + CARD_W / 2, y: to.y };
                const midY = (from.y + toCenter.y) / 2;
                const rel = RELATION_STYLE[n.relation ?? ""] ?? { color: NODE_STYLE[n.type].color, label: n.relation ?? "" };
                const isHi = highlightedIds ? highlightedIds.has(n.id) && highlightedIds.has(n.parentId!) : true;
                return (
                  <g key={n.id} filter="url(#edge-glow)" opacity={isHi ? 1 : 0.15}>
                    <path
                      d={`M ${from.x} ${from.y} C ${from.x} ${midY}, ${toCenter.x} ${midY}, ${toCenter.x} ${toCenter.y}`}
                      fill="none" stroke={rel.color} strokeOpacity={0.8} strokeWidth={1.75}
                      strokeDasharray={rel.dashed ? "4 4" : undefined}
                    />
                    <circle cx={toCenter.x} cy={toCenter.y} r={2} fill={rel.color} />
                  </g>
                );
              })}
            </svg>

            {activeData.map((n) => {
              const pos = getPos(n.id);
              const dimmed = highlightedIds ? !highlightedIds.has(n.id) : false;
              const highlighted = highlightedIds ? highlightedIds.has(n.id) : false;
              return (
                <NodeCard
                  key={n.id} node={n} x={pos.x} y={pos.y}
                  dimmed={dimmed} highlighted={highlighted}
                  onSelect={handleSelect} onDragStart={handleDragStart} onHover={setHoveredId}
                />
              );
            })}
          </div>
        )}

        {/* Node types legend */}
        <div className="absolute left-4 bottom-4 flex flex-col gap-1.5 p-3 rounded-xl"
          style={{ background: "rgba(10,14,20,0.92)", border: "1px solid rgba(255,255,255,0.08)", width: "max-content" }}>
          <p className="text-[11px] uppercase tracking-wider text-[#8b93a7] font-semibold mb-0.5">Node Types</p>
          {presentTypes.map((type) => {
            const style = NODE_STYLE[type];
            const Icon = style.icon;
            return (
              <div key={type} className="flex items-center gap-2 text-[13px] text-white/80 whitespace-nowrap">
                <Icon className="w-3.5 h-3.5 shrink-0" style={{ color: style.color }} />
                {style.label}
              </div>
            );
          })}
        </div>

        {/* Edge types legend */}
        <div className="absolute left-[15.5rem] bottom-4 flex flex-col gap-1.5 p-3 rounded-xl"
          style={{ background: "rgba(10,14,20,0.92)", border: "1px solid rgba(255,255,255,0.08)", width: "max-content" }}>
          <p className="text-[11px] uppercase tracking-wider text-[#8b93a7] font-semibold mb-0.5">Edge Types</p>
          {presentRelations.map((key) => {
            const rel = RELATION_STYLE[key] ?? { color: "#8b93a7", label: key };
            return (
              <div key={key} className="flex items-center gap-2 text-[13px] text-white/80 whitespace-nowrap">
                <svg width="16" height="8"><line x1="0" y1="4" x2="16" y2="4" stroke={rel.color} strokeWidth="2" strokeDasharray={rel.dashed ? "3 3" : undefined} /></svg>
                {rel.label}
              </div>
            );
          })}
        </div>

        <Minimap layout={layout} getPos={getPos} view={view} viewportSize={viewportSize} nodes={activeData} />

        <div className="absolute right-4 top-4 px-2.5 py-1.5 rounded-lg text-[11px] text-white/50 tabular-nums"
          style={{ background: "rgba(10,14,20,0.92)", border: "1px solid rgba(255,255,255,0.08)" }}>
          {Math.round(view.scale * 100)}%
        </div>

        <button
          className="absolute right-5 bottom-5 w-14 h-14 rounded-full flex items-center justify-center"
          style={{
            background: "linear-gradient(135deg, #4f9dff, #1fe0a0)",
            boxShadow: "0 0 0 4px rgba(79,157,255,0.15), 0 0 28px rgba(79,157,255,0.6), 0 8px 20px rgba(0,0,0,0.4)",
          }}
          title="AI Assistant"
        >
          <Sparkles className="w-6 h-6 text-white" />
        </button>
      </div>

      {selected && (
        <motion.div
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="glass-card p-5 relative"
          style={{ borderColor: NODE_STYLE[selected.type].color + "80" }}
        >
          <button onClick={() => setSelected(null)} className="absolute right-4 top-4 text-white/30 hover:text-white/70">
            <X className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2 mb-3">
            {(() => { const Icon = NODE_STYLE[selected.type].icon; return <Icon className="w-4 h-4" style={{ color: NODE_STYLE[selected.type].color }} />; })()}
            <span className="text-xs uppercase tracking-wider text-white/40">{NODE_STYLE[selected.type].label}</span>
          </div>
          <h3 className="text-lg font-semibold text-white mb-3">{selected.label}</h3>
          <div className="flex gap-6 text-sm">
            {selected.detail && <div><p className="text-white/30 text-xs">Detail</p><p className="text-white/80">{selected.detail}</p></div>}
            {selected.status && <div><p className="text-white/30 text-xs">Status</p><p className="text-white/80">{selected.status}</p></div>}
          </div>
        </motion.div>
      )}
    </div>
  );
}
