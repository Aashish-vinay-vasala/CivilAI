"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { PenLine, Trash2, Download, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DigitalSignatureProps {
  onSave?: (dataUrl: string) => void;
  label?: string;
  width?: number;
  height?: number;
}

export default function DigitalSignature({
  onSave,
  label = "Sign here",
  width = 480,
  height = 160,
}: DigitalSignatureProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [isEmpty, setIsEmpty] = useState(true);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "transparent";
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "var(--foreground, #f8fafc)";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ("touches" in e) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY,
      };
    }
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  };

  const startDraw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx) return;
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    setDrawing(true);
    setIsEmpty(false);
    setSaved(false);
  }, []);

  const draw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!drawing) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx) return;
    const pos = getPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  }, [drawing]);

  const endDraw = useCallback(() => setDrawing(false), []);

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx || !canvas) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setIsEmpty(true);
    setSaved(false);
  };

  const save = () => {
    const canvas = canvasRef.current;
    if (!canvas || isEmpty) return;
    const dataUrl = canvas.toDataURL("image/png");
    onSave?.(dataUrl);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const download = () => {
    const canvas = canvasRef.current;
    if (!canvas || isEmpty) return;
    const a = document.createElement("a");
    a.download = "signature.png";
    a.href = canvas.toDataURL("image/png");
    a.click();
  };

  return (
    <div className="space-y-2">
      {label && <p className="text-xs text-muted-foreground">{label}</p>}
      <div className="relative border-2 border-dashed border-border rounded-2xl overflow-hidden bg-secondary/20 hover:border-blue-500/50 transition-colors">
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          className="w-full touch-none cursor-crosshair block"
          style={{ height: height }}
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={endDraw}
        />
        {isEmpty && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="flex items-center gap-2 text-muted-foreground/50">
              <PenLine className="w-5 h-5" />
              <span className="text-sm">Draw your signature</span>
            </div>
          </div>
        )}
        {/* Baseline */}
        <div className="absolute bottom-8 left-6 right-6 border-b border-border/50 pointer-events-none" />
      </div>

      <div className="flex gap-2 justify-end">
        <Button variant="ghost" size="sm" onClick={clear} disabled={isEmpty} className="gap-1.5 text-xs text-muted-foreground">
          <Trash2 className="w-3.5 h-3.5" /> Clear
        </Button>
        <Button variant="ghost" size="sm" onClick={download} disabled={isEmpty} className="gap-1.5 text-xs text-muted-foreground">
          <Download className="w-3.5 h-3.5" /> Download
        </Button>
        {onSave && (
          <Button size="sm" onClick={save} disabled={isEmpty}
            className={`gap-1.5 text-xs transition-colors ${saved ? "bg-emerald-600 hover:bg-emerald-600 text-white border-0" : "gradient-blue text-white border-0"}`}>
            {saved ? <><Check className="w-3.5 h-3.5" /> Saved</> : "Apply Signature"}
          </Button>
        )}
      </div>
    </div>
  );
}
