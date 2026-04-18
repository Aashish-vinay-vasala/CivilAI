"use client";

import { motion } from "framer-motion";
import dynamic from "next/dynamic";
import {
  Activity,
  Building2,
  Thermometer,
  Users,
  AlertTriangle,
  Cpu,
  Wifi,
} from "lucide-react";
import ModuleChat from "@/components/shared/ModuleChat";

const DigitalTwin3D = dynamic(
  () => import("@/components/bim/DigitalTwin3D"),
  { ssr: false }
);

export default function DigitalTwinPage() {
  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-3xl font-bold text-foreground">Digital Twin</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Live 3D building simulation with real-time sensor data
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs text-emerald-400 font-medium">Live Simulation</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-blue-500/10 border border-blue-500/20">
            <Wifi className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-xs text-blue-400 font-medium">IoT Connected</span>
          </div>
        </div>
      </motion.div>

      {/* Feature Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Sensor Zones", value: "16", icon: Cpu, color: "border-blue-500/20 bg-blue-500/5", iconColor: "text-blue-400" },
          { label: "Equipment Tracked", value: "5", icon: Building2, color: "border-emerald-500/20 bg-emerald-500/5", iconColor: "text-emerald-400" },
          { label: "Update Interval", value: "3s", icon: Activity, color: "border-purple-500/20 bg-purple-500/5", iconColor: "text-purple-400" },
          { label: "Data Points", value: "64/min", icon: Wifi, color: "border-orange-500/20 bg-orange-500/5", iconColor: "text-orange-400" },
        ].map((kpi, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            whileHover={{ y: -2 }}
            className={`rounded-2xl border p-5 ${kpi.color}`}
          >
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-muted-foreground">{kpi.label}</p>
              <kpi.icon className={`w-4 h-4 ${kpi.iconColor}`} />
            </div>
            <p className="text-2xl font-bold text-foreground">{kpi.value}</p>
          </motion.div>
        ))}
      </div>

      {/* Digital Twin Viewer */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-card border border-border rounded-2xl p-6"
      >
        <div className="flex items-center gap-2 mb-4">
          <Building2 className="w-5 h-5 text-blue-400" />
          <h3 className="font-semibold text-foreground">Live 3D Building Model</h3>
          <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400">
            Three.js + IoT Simulation
          </span>
        </div>
        <DigitalTwin3D />
      </motion.div>

      {/* How it works */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="bg-card border border-border rounded-2xl p-6"
      >
        <h3 className="font-semibold text-foreground mb-4">Digital Twin Capabilities</h3>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {[
            {
              icon: Thermometer,
              title: "Environmental Monitoring",
              desc: "Real-time temperature, humidity, CO₂ and air quality tracking per zone",
              color: "text-orange-400 bg-orange-500/10",
            },
            {
              icon: Users,
              title: "Occupancy Analytics",
              desc: "Live occupancy tracking per floor and zone with capacity alerts",
              color: "text-blue-400 bg-blue-500/10",
            },
            {
              icon: Cpu,
              title: "Equipment Tracking",
              desc: "Real-time equipment location, health scores and maintenance alerts",
              color: "text-emerald-400 bg-emerald-500/10",
            },
            {
              icon: AlertTriangle,
              title: "Smart Alerts",
              desc: "AI-powered anomaly detection with instant visual alerts on 3D model",
              color: "text-red-400 bg-red-500/10",
            },
            {
              icon: Activity,
              title: "Progress Tracking",
              desc: "Construction progress visualization per zone and floor in real-time",
              color: "text-purple-400 bg-purple-500/10",
            },
            {
              icon: Building2,
              title: "BIM Integration",
              desc: "Direct integration with IFC BIM models for accurate 3D representation",
              color: "text-cyan-400 bg-cyan-500/10",
            },
          ].map((item, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 + i * 0.08 }}
              className="flex items-start gap-3 p-4 rounded-xl bg-secondary/40"
            >
              <div className={`w-9 h-9 rounded-xl ${item.color} flex items-center justify-center flex-shrink-0`}>
                <item.icon className="w-4 h-4" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">{item.title}</p>
                <p className="text-xs text-muted-foreground mt-1">{item.desc}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>

      <ModuleChat
        context="Digital Twin"
        placeholder="Ask about sensors, occupancy, equipment..."
        pageSummaryData={{
          sensorZones: 16,
          equipmentTracked: 5,
          updateInterval: "3s",
        }}
      />
    </div>
  );
}