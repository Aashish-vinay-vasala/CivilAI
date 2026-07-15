"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { QrCode, Plus, X, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import ModuleChat from "@/components/shared/ModuleChat";
import { glassInputClass, glassInputStyle, gradientButtonStyle } from "@/lib/theme";

interface QRItem {
  id: string;
  name: string;
  category: "equipment" | "material" | "tool" | "area";
  location?: string;
  status: "active" | "maintenance" | "retired";
  notes?: string;
  qr_data: string;
  created_at: string;
}

const DEMO_ITEMS: QRItem[] = [
  { id: "1", name: "Tower Crane TC-01",  category: "equipment", location: "Zone A", status: "active",      qr_data: "civilai:equipment:TC-01", created_at: "2025-04-01" },
  { id: "2", name: "Concrete Pump CP-02",category: "equipment", location: "Zone B", status: "maintenance", qr_data: "civilai:equipment:CP-02", created_at: "2025-04-05" },
  { id: "3", name: "Rebar Stock R-500",  category: "material",  location: "Yard",   status: "active",      qr_data: "civilai:material:R-500",  created_at: "2025-04-10" },
  { id: "4", name: "Safety Kit SK-10",   category: "tool",      location: "Store",  status: "active",      qr_data: "civilai:tool:SK-10",      created_at: "2025-04-12" },
];

const CATEGORY_STYLES = {
  equipment: "bg-blue-500/10 text-blue-400",
  material:  "bg-orange-500/10 text-orange-400",
  tool:      "bg-emerald-500/10 text-emerald-400",
  area:      "bg-cyan-500/10 text-cyan-400",
};

const STATUS_STYLES = {
  active:      "bg-emerald-500/10 text-emerald-400",
  maintenance: "bg-amber-500/10 text-amber-400",
  retired:     "bg-white/10 text-white/40",
};

function QRCanvas({ data, size = 120 }: { data: string; size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Simple visual QR placeholder — in production use a QR library
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = "#0f172a";

    // Draw finder patterns
    const drawFinder = (x: number, y: number) => {
      ctx.fillRect(x, y, 21, 21);
      ctx.fillStyle = "white";
      ctx.fillRect(x + 3, y + 3, 15, 15);
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(x + 6, y + 6, 9, 9);
    };
    const scale = size / 60;
    ctx.scale(scale, scale);
    drawFinder(3, 3);
    drawFinder(36, 3);
    drawFinder(3, 36);

    // Data dots based on hash of qr_data
    ctx.fillStyle = "#0f172a";
    let hash = 0;
    for (let i = 0; i < data.length; i++) hash = (hash * 31 + data.charCodeAt(i)) | 0;
    for (let row = 0; row < 42; row++) {
      for (let col = 0; col < 42; col++) {
        if (row < 9 && (col < 9 || col > 32)) continue;
        if (row > 32 && col < 9) continue;
        const bit = ((hash ^ (row * 7 + col * 13)) >> ((row + col) % 16)) & 1;
        if (bit) ctx.fillRect(col + 9, row + 9, 1, 1);
      }
    }
  }, [data, size]);

  return <canvas ref={canvasRef} width={size} height={size} className="rounded" />;
}

export default function QRTrackerPage() {
  const [items, setItems] = useState<QRItem[]>(DEMO_ITEMS);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedItem, setSelectedItem] = useState<QRItem | null>(null);
  const [filterCat, setFilterCat] = useState("all");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", category: "equipment" as QRItem["category"], location: "", notes: "", status: "active" as QRItem["status"] });

  const filtered = items.filter((i) => filterCat === "all" || i.category === filterCat);

  const handleCreate = async () => {
    if (!form.name) { toast.error("Name is required"); return; }
    setSaving(true);
    try {
      const id = crypto.randomUUID();
      const newItem: QRItem = {
        ...form,
        id,
        qr_data: `civilai:${form.category}:${id.slice(0, 8)}`,
        created_at: new Date().toISOString().split("T")[0],
      };
      setItems((prev) => [newItem, ...prev]);
      setShowCreate(false);
      setForm({ name: "", category: "equipment", location: "", notes: "", status: "active" });
      toast.success("QR item created");
    } finally { setSaving(false); }
  };

  const downloadQR = (item: QRItem) => {
    const canvas = document.querySelector<HTMLCanvasElement>(`#qr-${item.id}`);
    if (!canvas) return;
    const a = document.createElement("a");
    a.download = `${item.name}-QR.png`;
    a.href = canvas.toDataURL();
    a.click();
  };

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-4xl font-bold text-white tracking-tight">QR Code Tracker</h1>
          <p className="text-white/35 text-[13px] mt-1">Track equipment, materials &amp; tools with QR codes</p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white whitespace-nowrap transition-all hover:scale-105"
          style={gradientButtonStyle}>
          <Plus className="w-4 h-4" /> New QR Item
        </button>
      </motion.div>

      {/* Filter */}
      <div className="flex gap-0.5 p-1 rounded-xl w-fit flex-wrap"
        style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
        {["all","equipment","material","tool","area"].map((cat) => (
          <button key={cat} onClick={() => setFilterCat(cat)}
            className="px-3.5 py-1.5 rounded-lg text-[13px] font-medium capitalize whitespace-nowrap transition-colors"
            style={filterCat === cat
              ? { background: "rgba(0,212,255,0.15)", border: "1px solid rgba(0,212,255,0.3)", color: "#00D4FF" }
              : { border: "1px solid transparent", color: "rgba(255,255,255,0.4)" }}>
            {cat}
          </button>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filtered.map((item, i) => (
          <motion.div key={item.id} initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.04 }}
            className="glass-card p-4 cursor-pointer hover:border-cyan-500/30 transition-all"
            onClick={() => setSelectedItem(item)}>
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="text-sm font-medium text-white">{item.name}</p>
                {item.location && <p className="text-xs text-white/35 mt-0.5">{item.location}</p>}
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full ${CATEGORY_STYLES[item.category]}`}>{item.category}</span>
            </div>
            <div className="flex items-center justify-between">
              <canvas id={`qr-${item.id}`} style={{ display: "none" }} />
              <QRCanvas data={item.qr_data} size={64} />
              <div className="text-right">
                <span className={`text-xs px-2 py-0.5 rounded-full block mb-2 ${STATUS_STYLES[item.status]}`}>{item.status}</span>
                <button onClick={(e) => { e.stopPropagation(); downloadQR(item); }}
                  className="text-xs text-white/35 hover:text-white flex items-center gap-1 transition-colors">
                  <Download className="w-3 h-3" /> Save QR
                </button>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Item Detail Modal */}
      <AnimatePresence>
        {selectedItem && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-md z-50 flex items-center justify-center p-4"
            onClick={() => setSelectedItem(null)}>
            <motion.div initial={{ scale: 0.94, opacity: 0, y: 12 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.94, opacity: 0, y: 12 }}
              transition={{ type: "spring", stiffness: 300, damping: 28 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-2xl p-6"
              style={{
                background: "rgba(4,11,25,0.92)",
                border: "1px solid rgba(0,212,255,0.15)",
                boxShadow: "0 0 60px rgba(0,0,0,0.7), 0 0 30px rgba(0,212,255,0.06)",
                backdropFilter: "blur(32px)",
              }}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-white text-[15px]">{selectedItem.name}</h3>
                <button onClick={() => setSelectedItem(null)} className="text-white/25 hover:text-white/60 transition-colors"><X className="w-4 h-4" /></button>
              </div>
              <div className="flex justify-center mb-4">
                <QRCanvas data={selectedItem.qr_data} size={160} />
              </div>
              <div className="space-y-2 text-sm mb-4">
                <div className="flex justify-between"><span className="text-white/35">Category</span><span className={`text-xs px-2 py-0.5 rounded-full ${CATEGORY_STYLES[selectedItem.category]}`}>{selectedItem.category}</span></div>
                <div className="flex justify-between"><span className="text-white/35">Status</span><span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_STYLES[selectedItem.status]}`}>{selectedItem.status}</span></div>
                {selectedItem.location && <div className="flex justify-between"><span className="text-white/35">Location</span><span className="text-white">{selectedItem.location}</span></div>}
                <div className="flex justify-between"><span className="text-white/35">QR Data</span><span className="text-xs font-mono text-white/35 truncate ml-4">{selectedItem.qr_data}</span></div>
              </div>
              <button onClick={() => downloadQR(selectedItem)}
                className="w-full py-2 rounded-xl text-white text-sm flex items-center justify-center gap-2 transition-colors hover:bg-white/6"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <Download className="w-4 h-4" /> Download QR Code
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Create Modal */}
      <AnimatePresence>
        {showCreate && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.94, opacity: 0, y: 12 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.94, opacity: 0, y: 12 }}
              transition={{ type: "spring", stiffness: 300, damping: 28 }}
              className="w-full max-w-sm rounded-2xl p-6"
              style={{
                background: "rgba(4,11,25,0.92)",
                border: "1px solid rgba(0,212,255,0.15)",
                boxShadow: "0 0 60px rgba(0,0,0,0.7), 0 0 30px rgba(0,212,255,0.06)",
                backdropFilter: "blur(32px)",
              }}>
              <div className="flex items-center justify-between mb-5">
                <h3 className="font-semibold text-white text-[15px]">New QR Item</h3>
                <button onClick={() => setShowCreate(false)} className="text-white/25 hover:text-white/60 transition-colors"><X className="w-4 h-4" /></button>
              </div>
              <div className="space-y-3">
                <div><label className="text-xs text-white/35 mb-1 block">Name *</label><input className={glassInputClass} style={glassInputStyle} placeholder="e.g. Excavator EX-01" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></div>
                <div><label className="text-xs text-white/35 mb-1 block">Category</label>
                  <select className={glassInputClass} style={glassInputStyle} value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as QRItem["category"] }))}>
                    {["equipment","material","tool","area"].map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div><label className="text-xs text-white/35 mb-1 block">Location</label><input className={glassInputClass} style={glassInputStyle} placeholder="e.g. Site Zone A" value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} /></div>
                <div><label className="text-xs text-white/35 mb-1 block">Notes</label><textarea className={glassInputClass} style={glassInputStyle} rows={2} placeholder="Additional notes…" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} /></div>
              </div>
              <div className="flex gap-3 mt-5">
                <button onClick={() => setShowCreate(false)}
                  className="flex-1 py-2 rounded-xl text-white/70 hover:text-white text-sm transition-colors"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}>Cancel</button>
                <button onClick={handleCreate} disabled={saving}
                  className="flex-1 py-2 rounded-xl text-white text-sm flex items-center justify-center gap-2 transition-all hover:scale-105 disabled:opacity-50 disabled:hover:scale-100"
                  style={gradientButtonStyle}>
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <QrCode className="w-4 h-4" />} Generate QR
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <ModuleChat context="QR Tracker" placeholder="Where is equipment TC-01? What needs maintenance?" pageSummaryData={{ total: items.length }} />
    </div>
  );
}
