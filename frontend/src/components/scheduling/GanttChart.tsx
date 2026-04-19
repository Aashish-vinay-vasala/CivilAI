"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";

interface Task {
  id: string;
  task_name: string;
  planned_start: string;
  planned_end: string;
  actual_progress: number;
  status: string;
  assignee: string;
  phase: string;
}

interface GanttChartProps {
  tasks: Task[];
  projectName?: string;
}

export default function GanttChart({ tasks, projectName }: GanttChartProps) {
  const today = new Date();

  // Build months range
  const getMonthRange = () => {
    if (tasks.length === 0) return [];
    const dates = tasks
      .filter(t => t.planned_start && t.planned_end)
      .flatMap(t => [new Date(t.planned_start), new Date(t.planned_end)]);
    if (dates.length === 0) return [];
    const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
    const maxDate = new Date(Math.max(...dates.map(d => d.getTime())));
    minDate.setDate(1);
    maxDate.setMonth(maxDate.getMonth() + 1);
    maxDate.setDate(1);

    const months = [];
    const cur = new Date(minDate);
    while (cur < maxDate) {
      months.push(new Date(cur));
      cur.setMonth(cur.getMonth() + 1);
    }
    return months;
  };

  const months = getMonthRange();
  const colWidth = 80;

  if (!months.length) return null;

  const startDate = months[0];
  const endDate = new Date(months[months.length - 1]);
  endDate.setMonth(endDate.getMonth() + 1);
  const totalDays = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
  const totalWidth = months.length * colWidth;

  const getBarStyle = (task: Task) => {
    if (!task.planned_start || !task.planned_end) return null;
    const start = new Date(task.planned_start);
    const end = new Date(task.planned_end);
    const left = ((start.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) / totalDays * totalWidth;
    const width = ((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) / totalDays * totalWidth;
    return { left: Math.max(0, left), width: Math.max(20, width) };
  };

  const getTodayPosition = () => {
    if (today < startDate || today > endDate) return null;
    return ((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) / totalDays * totalWidth;
  };

  const getBarColor = (status: string, progress: number) => {
    if (status === "done" || status === "completed") return "bg-emerald-500";
    if (status === "delayed") return "bg-red-500";
    if (status === "atrisk") return "bg-orange-500";
    if (progress > 0) return "bg-blue-500";
    return "bg-slate-500";
  };

  const todayPos = getTodayPosition();

  const groupedByPhase = tasks.reduce((acc: any, task) => {
    const phase = task.phase || "General";
    if (!acc[phase]) acc[phase] = [];
    acc[phase].push(task);
    return acc;
  }, {});

  return (
    <div className="space-y-2">
      {/* Legend */}
      <div className="flex flex-wrap gap-4 mb-2">
        {[
          { color: "bg-emerald-500", label: "Completed" },
          { color: "bg-blue-500", label: "In Progress" },
          { color: "bg-orange-500", label: "At Risk" },
          { color: "bg-red-500", label: "Delayed" },
          { color: "bg-slate-500", label: "Pending" },
        ].map(l => (
          <div key={l.label} className="flex items-center gap-1.5">
            <div className={`w-3 h-3 rounded-sm ${l.color}`} />
            <span className="text-xs text-muted-foreground">{l.label}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <div className="w-0.5 h-3 bg-yellow-400" />
          <span className="text-xs text-muted-foreground">Today</span>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <div className="flex min-w-max">
          {/* Left panel - task names */}
          <div className="w-56 flex-shrink-0 border-r border-border bg-card">
            {/* Header */}
            <div className="h-10 px-4 flex items-center border-b border-border bg-secondary/50">
              <span className="text-xs font-medium text-muted-foreground">Task / Phase</span>
            </div>
            {/* Tasks grouped by phase */}
            {Object.entries(groupedByPhase).map(([phase, phaseTasks]: any) => (
              <div key={phase}>
                {/* Phase header */}
                <div className="h-8 px-4 flex items-center bg-blue-500/5 border-b border-border">
                  <span className="text-xs font-semibold text-blue-400">{phase}</span>
                </div>
                {/* Tasks */}
                {phaseTasks.map((task: Task) => (
                  <div key={task.id} className="h-10 px-4 flex items-center border-b border-border/50 hover:bg-secondary/30 transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{task.task_name}</p>
                      <p className="text-xs text-muted-foreground truncate">{task.assignee}</p>
                    </div>
                    <span className="text-xs text-muted-foreground ml-2">{task.actual_progress}%</span>
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* Right panel - Gantt bars */}
          <div className="flex-1 relative bg-card">
            {/* Month headers */}
            <div className="h-10 flex border-b border-border bg-secondary/50 sticky top-0 z-10">
              {months.map((month, i) => (
                <div key={i} className="border-r border-border/50 flex items-center justify-center"
                  style={{ width: colWidth, flexShrink: 0 }}>
                  <span className="text-xs text-muted-foreground font-medium">
                    {month.toLocaleDateString("en", { month: "short", year: "2-digit" })}
                  </span>
                </div>
              ))}
            </div>

            {/* Grid + Bars */}
            <div className="relative" style={{ width: totalWidth }}>
              {/* Vertical grid lines */}
              {months.map((_, i) => (
                <div key={i} className="absolute top-0 bottom-0 border-r border-border/30"
                  style={{ left: i * colWidth }} />
              ))}

              {/* Today line */}
              {todayPos !== null && (
                <div className="absolute top-0 bottom-0 w-0.5 bg-yellow-400 z-10"
                  style={{ left: todayPos }}>
                  <div className="absolute -top-0 -left-1 w-2 h-2 rounded-full bg-yellow-400" />
                </div>
              )}

              {/* Task rows */}
              {Object.entries(groupedByPhase).map(([phase, phaseTasks]: any) => (
                <div key={phase}>
                  {/* Phase spacer */}
                  <div className="h-8 bg-blue-500/5 border-b border-border" />
                  {/* Task bars */}
                  {phaseTasks.map((task: Task) => {
                    const barStyle = getBarStyle(task);
                    return (
                      <div key={task.id} className="h-10 flex items-center border-b border-border/50 relative">
                        {barStyle && (
                          <div className="absolute" style={{ left: barStyle.left, width: barStyle.width }}>
                            {/* Background bar */}
                            <div className="h-5 rounded-full bg-secondary/80 relative overflow-hidden mx-0.5">
                              {/* Progress fill */}
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${task.actual_progress}%` }}
                                transition={{ duration: 0.8 }}
                                className={`absolute left-0 top-0 h-full rounded-full ${getBarColor(task.status, task.actual_progress)}`}
                                style={{ opacity: 0.85 }}
                              />
                              {/* Label */}
                              {barStyle.width > 40 && (
                                <span className="absolute inset-0 flex items-center justify-center text-xs text-white font-medium z-10 truncate px-2">
                                  {task.task_name}
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}