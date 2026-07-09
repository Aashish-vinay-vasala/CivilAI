"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle, Upload, Loader2, Plus, Pencil, Trash2, Check, X, RefreshCw,
} from "lucide-react";
import axios from "axios";
import { toast } from "sonner";
import GlassModal from "@/components/shared/GlassModal";
import { ACCENT, glassInputClass, glassInputStyle, gradientButtonStyle, glassButtonStyle } from "@/lib/theme";

const API = process.env.NEXT_PUBLIC_API_URL;

interface PriceEntry {
  id: string;
  material: string;
  price: number;
  unit: string;
  change_pct: number;
  source: "manual" | "ai_extracted" | "structured_parse" | "live_sync";
  // "quote" = a real $/unit price (manual entry or document extraction).
  // "index" = a live market index point from FRED — a different scale entirely,
  // never comparable to a quote for the same material. A material can have both
  // rows at once; they're rendered as separate lines, never merged.
  basis: "quote" | "index";
  fetched_at: string;
  notes?: string | null;
}

interface ExtractedRow {
  _id: number;
  material: string;
  price: number;
  unit: string;
  notes?: string | null;
  approved: boolean;
}

// Materials sync every 24h by default (backend MATERIAL_PRICE_SYNC_INTERVAL_HOURS) —
// used only to decide whether to still call a live_sync entry "Live" or "Stale".
const SYNC_FRESHNESS_HOURS = 30;

function riskFromChange(changePct: number) {
  return Math.min(Math.round(Math.abs(changePct) * 10), 100);
}

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const hours = diffMs / 3_600_000;
  if (hours < 1) return "just now";
  if (hours < 24) return `${Math.round(hours)}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export default function MaterialPricesPanel() {
  const [prices, setPrices] = useState<PriceEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ price: "", unit: "", notes: "" });
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [manualOpen, setManualOpen] = useState(false);
  const [manualForm, setManualForm] = useState({ material: "", price: "", unit: "unit", notes: "" });
  const [savingManual, setSavingManual] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewSource, setReviewSource] = useState("");
  const [reviewRows, setReviewRows] = useState<ExtractedRow[]>([]);
  const [confirming, setConfirming] = useState(false);

  const fetchPrices = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/api/v1/material-prices/`);
      setPrices(res.data.prices || []);
    } catch {
      toast.error("Failed to load material prices");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPrices(); }, [fetchPrices]);

  const latestLiveSync = prices
    .filter((p) => p.source === "live_sync")
    .sort((a, b) => new Date(b.fetched_at).getTime() - new Date(a.fetched_at).getTime())[0];
  const liveIsFresh = latestLiveSync
    && (Date.now() - new Date(latestLiveSync.fetched_at).getTime()) / 3_600_000 < SYNC_FRESHNESS_HOURS;

  const handleSyncNow = async () => {
    setSyncing(true);
    try {
      const res = await axios.post(`${API}/api/v1/material-prices/sync`);
      const { updated = [], skipped = [] } = res.data;
      if (updated.length > 0) toast.success(`Synced ${updated.length} material${updated.length !== 1 ? "s" : ""} from live market data`);
      if (skipped.length > 0) toast.error(`Could not sync: ${skipped.join(", ")} — check FRED_API_KEY is configured`);
      fetchPrices();
    } catch (err) {
      const detail = axios.isAxiosError(err) ? err.response?.data?.detail : undefined;
      toast.error(detail || "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const startEdit = (p: PriceEntry) => {
    setEditingId(p.id);
    setEditForm({ price: String(p.price), unit: p.unit, notes: p.notes || "" });
  };

  const saveEdit = async (id: string) => {
    setSavingEdit(true);
    try {
      await axios.patch(`${API}/api/v1/material-prices/${id}`, {
        price: parseFloat(editForm.price) || undefined,
        unit: editForm.unit || undefined,
        notes: editForm.notes || undefined,
      });
      toast.success("Price updated");
      setEditingId(null);
      fetchPrices();
    } catch {
      toast.error("Failed to update price");
    } finally {
      setSavingEdit(false);
    }
  };

  const deleteEntry = async (id: string, material: string) => {
    if (!confirm(`Delete this ${material} price entry?`)) return;
    setDeletingId(id);
    try {
      await axios.delete(`${API}/api/v1/material-prices/${id}`);
      toast.success("Entry deleted");
      fetchPrices();
    } catch {
      toast.error("Failed to delete entry");
    } finally {
      setDeletingId(null);
    }
  };

  const submitManual = async () => {
    if (!manualForm.material.trim() || !manualForm.price) {
      toast.error("Material and price are required");
      return;
    }
    setSavingManual(true);
    try {
      await axios.post(`${API}/api/v1/material-prices/`, {
        material: manualForm.material.trim(),
        price: parseFloat(manualForm.price),
        unit: manualForm.unit || "unit",
        notes: manualForm.notes || undefined,
      });
      toast.success("Price added");
      setManualOpen(false);
      setManualForm({ material: "", price: "", unit: "unit", notes: "" });
      fetchPrices();
    } catch {
      toast.error("Failed to add price");
    } finally {
      setSavingManual(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await axios.post(`${API}/api/v1/material-prices/extract`, formData);
      const data = res.data;
      const rows: ExtractedRow[] = (data.items || []).map((it: any, i: number) => ({
        _id: i,
        material: it.material,
        price: it.price,
        unit: it.unit || "unit",
        notes: it.notes || it.as_of_date || null,
        approved: true,
      }));
      setReviewRows(rows);
      setReviewSource(data.source || "");
      setReviewOpen(true);
      toast.success(rows.length > 0
        ? `Found ${rows.length} price${rows.length !== 1 ? "s" : ""} — review below`
        : "No prices found in document");
    } catch (err) {
      const detail = axios.isAxiosError(err) ? err.response?.data?.detail : undefined;
      toast.error(detail || "Failed to analyze document");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const toggleRow = (id: number) =>
    setReviewRows((rows) => rows.map((r) => (r._id === id ? { ...r, approved: !r.approved } : r)));
  const toggleAllRows = (val: boolean) =>
    setReviewRows((rows) => rows.map((r) => ({ ...r, approved: val })));

  const approvedRows = reviewRows.filter((r) => r.approved);

  const confirmImport = async () => {
    if (approvedRows.length === 0) { toast.error("Select at least one item to add"); return; }
    setConfirming(true);
    try {
      const fd = new FormData();
      fd.append("items", JSON.stringify(approvedRows.map(({ material, price, unit, notes }) => ({ material, price, unit, notes }))));
      fd.append("source", reviewSource === "structured_parse" ? "structured_parse" : "ai_extracted");
      const res = await axios.post(`${API}/api/v1/material-prices/import`, fd);
      toast.success(`Added ${res.data.imported_rows} price entr${res.data.imported_rows === 1 ? "y" : "ies"}`);
      setReviewOpen(false);
      setReviewRows([]);
      fetchPrices();
    } catch {
      toast.error("Failed to import prices");
    } finally {
      setConfirming(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.5 }}
      className="glass-card p-6"
    >
      <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-400" />
          <h3 className="font-semibold text-white text-[14px]">Material Price Risk</h3>
          {latestLiveSync ? (
            <span className="text-[11px] px-2 py-0.5 rounded-full"
              style={liveIsFresh
                ? { background: ACCENT.green.bg, border: `1px solid ${ACCENT.green.border}`, color: ACCENT.green.text }
                : { background: ACCENT.amber.bg, border: `1px solid ${ACCENT.amber.border}`, color: ACCENT.amber.text }}>
              {liveIsFresh ? "Live Market Data" : "Live data (stale)"} · synced {timeAgo(latestLiveSync.fetched_at)}
            </span>
          ) : (
            <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.5)" }}>
              Manual / Estimated
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={() => setManualOpen(true)}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-white/70 transition-colors" style={glassButtonStyle} title="Add price manually">
            <Plus className="w-3.5 h-3.5" />
          </button>
          <input ref={fileInputRef} type="file" className="hidden" accept=".pdf,.docx,.csv,.xlsx" onChange={handleFileUpload} />
          <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-white/70 transition-colors" style={glassButtonStyle} title="Upload document">
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
          </button>
          <button onClick={handleSyncNow} disabled={syncing}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-white/70 transition-colors" style={glassButtonStyle} title="Sync live market data now">
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-5 h-5 animate-spin text-cyan-400" />
        </div>
      ) : prices.length === 0 ? (
        <div className="text-center py-8 text-white/30 text-[12px]">
          No material prices yet — add one manually, upload a document, or sync live data.
        </div>
      ) : (
        <div className="space-y-3">
          {prices.map((p) => {
            const risk = riskFromChange(p.change_pct);
            const isEditing = editingId === p.id;
            return (
              <div key={p.id} className="group">
                {isEditing ? (
                  <div className="flex items-center gap-2 p-2 rounded-xl" style={{ background: "rgba(255,255,255,0.03)" }}>
                    <span className="text-[13px] text-white/70 w-20 shrink-0 truncate">{p.material}</span>
                    <input type="number" value={editForm.price} onChange={(e) => setEditForm((f) => ({ ...f, price: e.target.value }))}
                      className="w-24 px-2 py-1 text-xs bg-[rgba(255,255,255,0.05)] border border-cyan-500/40 rounded-lg text-white outline-none" />
                    <input type="text" value={editForm.unit} onChange={(e) => setEditForm((f) => ({ ...f, unit: e.target.value }))}
                      className="w-16 px-2 py-1 text-xs bg-[rgba(255,255,255,0.05)] border border-cyan-500/40 rounded-lg text-white outline-none" />
                    <input type="text" placeholder="notes" value={editForm.notes} onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
                      className="flex-1 min-w-0 px-2 py-1 text-xs bg-[rgba(255,255,255,0.05)] border border-cyan-500/40 rounded-lg text-white outline-none placeholder:text-white/30" />
                    <button onClick={() => saveEdit(p.id)} disabled={savingEdit} className="p-1 rounded-lg hover:bg-emerald-500/20 text-emerald-400 shrink-0">
                      {savingEdit ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    </button>
                    <button onClick={() => setEditingId(null)} className="p-1 rounded-lg hover:bg-red-500/20 text-red-400 shrink-0"><X className="w-3.5 h-3.5" /></button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <div className="w-24 shrink-0 min-w-0">
                      <p className="text-[13px] text-white/70 truncate" title={p.material}>{p.material}</p>
                      <span className="text-[9px] uppercase tracking-wide"
                        style={{ color: p.basis === "index" ? ACCENT.blue.text : "rgba(255,255,255,0.3)" }}>
                        {p.basis === "index" ? "market index" : "quoted"}
                      </span>
                    </div>
                    <div className="flex-1 h-2 rounded-full" style={{ background: "rgba(255,255,255,0.06)" }}>
                      <motion.div
                        initial={{ width: 0 }} animate={{ width: `${risk}%` }} transition={{ duration: 0.8 }}
                        className="h-2 rounded-full"
                        style={{ background: risk > 80 ? ACCENT.red.text : risk > 60 ? ACCENT.amber.text : ACCENT.green.text }}
                      />
                    </div>
                    <span className="text-[11px] text-white/35 w-8 text-right shrink-0">{risk}%</span>
                    <span className="text-[11px] font-medium text-white/70 w-24 text-right shrink-0">
                      {p.basis === "index" ? `${Number(p.price).toFixed(1)} idx` : `$${Number(p.price).toFixed(2)}/${p.unit}`}
                    </span>
                    <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => startEdit(p)} className="p-1 rounded-lg hover:bg-cyan-500/20 text-cyan-400"><Pencil className="w-3.5 h-3.5" /></button>
                      <button onClick={() => deleteEntry(p.id, p.material)} disabled={deletingId === p.id} className="p-1 rounded-lg hover:bg-red-500/20 text-red-400">
                        {deletingId === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Manual entry */}
      <GlassModal open={manualOpen} onClose={() => setManualOpen(false)} title="Add Material Price" subtitle="Enter a price manually">
        <div className="space-y-3">
          <input placeholder="Material (e.g. Steel)" value={manualForm.material}
            onChange={(e) => setManualForm((f) => ({ ...f, material: e.target.value }))}
            className={glassInputClass} style={glassInputStyle} />
          <div className="grid grid-cols-2 gap-3">
            <input type="number" placeholder="Price" value={manualForm.price}
              onChange={(e) => setManualForm((f) => ({ ...f, price: e.target.value }))}
              className={glassInputClass} style={glassInputStyle} />
            <input placeholder="Unit (e.g. ton)" value={manualForm.unit}
              onChange={(e) => setManualForm((f) => ({ ...f, unit: e.target.value }))}
              className={glassInputClass} style={glassInputStyle} />
          </div>
          <input placeholder="Notes (optional)" value={manualForm.notes}
            onChange={(e) => setManualForm((f) => ({ ...f, notes: e.target.value }))}
            className={glassInputClass} style={glassInputStyle} />
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={() => setManualOpen(false)}
            className="flex-1 px-4 py-2 rounded-xl text-sm text-white/50 hover:text-white/80 transition-colors"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
            Cancel
          </button>
          <button onClick={submitManual} disabled={savingManual}
            className="flex-1 px-4 py-2 rounded-xl text-sm font-medium text-white flex items-center justify-center gap-2 transition-all hover:scale-105"
            style={gradientButtonStyle}>
            {savingManual ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Add Price
          </button>
        </div>
      </GlassModal>

      {/* Upload -> extract -> review -> confirm */}
      <GlassModal
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        title={`Review extracted prices${reviewSource === "structured_parse" ? " — column match" : " — AI extracted"}`}
        subtitle="Pick which prices to add — nothing is saved until you confirm"
        maxWidth="max-w-lg"
      >
        {reviewRows.length === 0 ? (
          <p className="text-sm text-white/50">No prices could be extracted from this document.</p>
        ) : (
          <>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[11px] text-white/35">{approvedRows.length} of {reviewRows.length} selected</p>
              <div className="flex gap-3">
                <button onClick={() => toggleAllRows(true)} className="text-[11px] text-cyan-400 hover:underline">Select all</button>
                <button onClick={() => toggleAllRows(false)} className="text-[11px] text-white/40 hover:underline">Select none</button>
              </div>
            </div>
            <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-1">
              {reviewRows.map((row) => (
                <label key={row._id}
                  className="flex items-start gap-3 p-3 rounded-xl cursor-pointer transition-colors"
                  style={{
                    background: row.approved ? "rgba(0,212,255,0.05)" : "rgba(255,255,255,0.02)",
                    border: row.approved ? "1px solid rgba(0,212,255,0.2)" : "1px solid rgba(255,255,255,0.06)",
                  }}>
                  <input type="checkbox" checked={row.approved} onChange={() => toggleRow(row._id)}
                    className="mt-1 w-4 h-4 accent-cyan-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[13px] text-white/85 truncate">{row.material}</p>
                      <p className="text-[13px] font-semibold text-white shrink-0">${Number(row.price).toFixed(2)}/{row.unit}</p>
                    </div>
                    {row.notes && <p className="text-[11px] text-white/30 mt-1">{row.notes}</p>}
                  </div>
                </label>
              ))}
            </div>
            <div className="flex items-center justify-end gap-2 mt-5">
              <button onClick={() => setReviewOpen(false)} className="px-4 py-2 rounded-xl text-sm text-white/50 hover:text-white/80 transition-colors">
                Discard all
              </button>
              <button onClick={confirmImport} disabled={confirming || approvedRows.length === 0}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white transition-all hover:scale-105 disabled:opacity-40"
                style={gradientButtonStyle}>
                {confirming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Add {approvedRows.length} item{approvedRows.length !== 1 ? "s" : ""}
              </button>
            </div>
          </>
        )}
      </GlassModal>
    </motion.div>
  );
}
