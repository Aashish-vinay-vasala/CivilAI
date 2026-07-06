"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X, GripVertical, Eye, EyeOff, RotateCcw, SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useWidgetStore, WidgetId } from "@/lib/stores/widgetStore";
import { Button } from "@/components/ui/button";

function SortableRow({ id, title, visible, onToggle }: {
  id: WidgetId; title: string; visible: boolean; onToggle: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${
        isDragging ? "bg-blue-500/10 border-blue-500/30 shadow-lg" : "bg-secondary/40 border-border"
      }`}
    >
      <button {...listeners} {...attributes} className="text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing">
        <GripVertical className="w-4 h-4" />
      </button>
      <span className={`text-sm flex-1 ${visible ? "text-foreground" : "text-muted-foreground line-through"}`}>
        {title}
      </span>
      <button onClick={onToggle} className={visible ? "text-blue-400 hover:text-blue-300" : "text-muted-foreground hover:text-foreground"}>
        {visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
      </button>
    </div>
  );
}

export default function WidgetCustomizer() {
  const [open, setOpen] = useState(false);
  const { widgets, toggleVisibility, reorder, reset } = useWidgetStore();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = widgets.findIndex((w) => w.id === active.id);
    const newIndex = widgets.findIndex((w) => w.id === over.id);
    reorder(oldIndex, newIndex);
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="gap-2 text-xs"
        onClick={() => setOpen(true)}
      >
        <SlidersHorizontal className="w-3.5 h-3.5" />
        Customize
      </Button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
              onClick={() => setOpen(false)}
            />
            <motion.div
              initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 26, stiffness: 220 }}
              className="fixed right-0 top-0 h-screen w-80 bg-card border-l border-border z-50 flex flex-col shadow-2xl"
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                <div className="flex items-center gap-2">
                  <SlidersHorizontal className="w-4 h-4 text-blue-400" />
                  <span className="font-semibold text-foreground text-sm">Customize Dashboard</span>
                </div>
                <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <p className="px-5 py-3 text-xs text-muted-foreground border-b border-border">
                Drag to reorder · click eye to show/hide
              </p>

              <div className="flex-1 overflow-y-auto p-5">
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={widgets.map((w) => w.id)} strategy={verticalListSortingStrategy}>
                    <div className="space-y-2">
                      {widgets.map((w) => (
                        <SortableRow
                          key={w.id}
                          id={w.id}
                          title={w.title}
                          visible={w.visible}
                          onToggle={() => toggleVisibility(w.id)}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              </div>

              <div className="p-5 border-t border-border">
                <Button variant="ghost" size="sm" className="w-full gap-2 text-xs text-muted-foreground" onClick={reset}>
                  <RotateCcw className="w-3.5 h-3.5" /> Reset to default
                </Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
