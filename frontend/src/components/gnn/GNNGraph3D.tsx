"use client";

import { useRef, useMemo, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Html, Line } from "@react-three/drei";
import * as THREE from "three";

// ─── Types ────────────────────────────────────────────────────────
interface GNNNode {
  id: number;
  label: string;
  type: string;
  risk_score: number;
  direct_risk: number;
}

interface GNNEdge {
  source: number;
  target: number;
  weight: number;
}

interface GNNGraphData {
  nodes: GNNNode[];
  edges: GNNEdge[];
}

interface GNNGraph3DProps {
  graph?: GNNGraphData;
  height?: number;
}

// ─── Helpers ─────────────────────────────────────────────────────
function getRiskColor(risk: number): string {
  if (risk < 0.2) return "#10b981";
  if (risk < 0.5) return "#f59e0b";
  if (risk < 0.7) return "#f97316";
  return "#ef4444";
}

function pseudoRandom(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453123;
  return x - Math.floor(x);
}

const TYPE_CLUSTER: Record<string, [number, number, number]> = {
  task:      [0,    2,    0],
  equipment: [2.8, -0.5,  1],
  safety:    [-2.8, -0.5, 1],
  cost:      [1,   -2.2, -1],
  schedule:  [-1,  -2.2, -1],
};

function computePositions(nodes: GNNNode[]): THREE.Vector3[] {
  const countByType: Record<string, number> = {};
  const indexByType: Record<string, number> = {};
  nodes.forEach(n => { countByType[n.type] = (countByType[n.type] || 0) + 1; });

  return nodes.map((n, i) => {
    const center = TYPE_CLUSTER[n.type] ?? [0, 0, 0];
    const idx = indexByType[n.type] ?? 0;
    indexByType[n.type] = idx + 1;
    const count = countByType[n.type];
    const angle = (idx / Math.max(count, 1)) * Math.PI * 2;
    const spread = Math.min(1.4, count * 0.18);
    return new THREE.Vector3(
      center[0] + Math.cos(angle) * spread,
      center[1] + Math.sin(angle) * spread,
      center[2] + (pseudoRandom(i) - 0.5) * 0.8,
    );
  });
}

// ─── Node sphere ─────────────────────────────────────────────────
function NodeSphere({
  node, position, isHovered, onHover, onLeave,
}: {
  node: GNNNode;
  position: THREE.Vector3;
  isHovered: boolean;
  onHover: () => void;
  onLeave: () => void;
}) {
  const meshRef  = useRef<THREE.Mesh>(null);
  const glowRef  = useRef<THREE.Mesh>(null);
  const isCrit   = node.risk_score >= 0.7;
  const color    = getRiskColor(node.risk_score);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    const speed  = isCrit ? 2.8 : 1.4;
    const offset = position.x * 1.7;
    const pulse  = 1 + Math.sin(t * speed + offset) * (isCrit ? 0.18 : 0.08);
    if (meshRef.current)  meshRef.current.scale.setScalar(isHovered ? 1.4 : pulse);
    if (glowRef.current)  glowRef.current.scale.setScalar(
      isHovered ? 2.4 : 1.7 + Math.sin(t * speed + offset) * 0.35,
    );
  });

  return (
    <group position={position}>
      {/* Outer halo */}
      <mesh ref={glowRef}>
        <sphereGeometry args={[0.28, 14, 14]} />
        <meshBasicMaterial color={color} transparent opacity={0.07} depthWrite={false} />
      </mesh>

      {/* Mid halo */}
      <mesh>
        <sphereGeometry args={[0.21, 14, 14]} />
        <meshBasicMaterial color={color} transparent opacity={0.12} depthWrite={false} />
      </mesh>

      {/* Critical ring */}
      {isCrit && (
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.26, 0.016, 8, 48]} />
          <meshBasicMaterial color="#ef4444" transparent opacity={0.8} />
        </mesh>
      )}

      {/* Main sphere */}
      <mesh
        ref={meshRef}
        onPointerOver={(e) => { e.stopPropagation(); onHover(); }}
        onPointerOut={onLeave}
      >
        <sphereGeometry args={[0.14, 32, 32]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={isCrit ? 1.4 : 0.8}
          roughness={0.1}
          metalness={0.5}
        />
      </mesh>

      {/* Label below node */}
      <Html distanceFactor={9} center style={{ pointerEvents: "none" }}>
        <div style={{
          fontSize: 9,
          color: "#64748b",
          whiteSpace: "nowrap",
          textAlign: "center",
          marginTop: 28,
          textShadow: "0 1px 6px #000a",
          fontFamily: "Inter, system-ui, sans-serif",
        }}>
          {node.label.length > 14 ? node.label.slice(0, 12) + "…" : node.label}
          <br />
          <span style={{ color, fontWeight: 700, fontSize: 9 }}>
            {Math.round(node.risk_score * 100)}%
          </span>
        </div>
      </Html>

      {/* Hover tooltip */}
      {isHovered && (
        <Html distanceFactor={9} center style={{ pointerEvents: "none" }}>
          <div style={{
            background: "rgba(2,8,23,0.96)",
            border: `1px solid ${color}55`,
            borderRadius: 10,
            padding: "8px 12px",
            fontSize: 11,
            color: "#f1f5f9",
            whiteSpace: "nowrap",
            marginTop: -90,
            boxShadow: `0 0 24px ${color}30, 0 4px 20px #0008`,
            fontFamily: "Inter, system-ui, sans-serif",
            minWidth: 140,
          }}>
            <div style={{ fontWeight: 700, marginBottom: 5, fontSize: 12 }}>{node.label}</div>
            <div style={{ color: "#64748b", marginBottom: 2 }}>
              Type: <span style={{ color: "#94a3b8" }}>{node.type}</span>
            </div>
            <div style={{ color: "#64748b", marginBottom: 2 }}>
              Direct risk: <span style={{ color, fontWeight: 600 }}>
                {Math.round(node.direct_risk * 100)}%
              </span>
            </div>
            <div style={{ color: "#64748b" }}>
              Propagated: <span style={{ color, fontWeight: 700, fontSize: 13 }}>
                {Math.round(node.risk_score * 100)}%
              </span>
            </div>
          </div>
        </Html>
      )}
    </group>
  );
}

// ─── Edge with flowing particle ───────────────────────────────────
function EdgeWithParticle({
  from, to, weight, offset,
}: {
  from: THREE.Vector3;
  to: THREE.Vector3;
  weight: number;
  offset: number;
}) {
  const particleRef = useRef<THREE.Mesh>(null);
  const progress    = useRef(offset % 1);
  const speed       = 0.28 + weight * 0.45;
  const points      = useMemo(() => [from.clone(), to.clone()], []);

  useFrame((_, delta) => {
    if (!particleRef.current) return;
    progress.current = (progress.current + delta * speed) % 1;
    particleRef.current.position.lerpVectors(from, to, progress.current);
  });

  return (
    <>
      <Line
        points={points}
        color="#3b82f6"
        lineWidth={Math.max(0.4, weight * 1.8)}
        transparent
        opacity={0.2 + weight * 0.18}
      />
      <mesh ref={particleRef}>
        <sphereGeometry args={[0.032, 8, 8]} />
        <meshBasicMaterial color="#93c5fd" />
      </mesh>
    </>
  );
}

// ─── Live graph scene ─────────────────────────────────────────────
function LiveScene({ graph }: { graph: GNNGraphData }) {
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const positions = useMemo(() => computePositions(graph.nodes), [graph.nodes]);

  return (
    <>
      <OrbitControls enablePan={false} minDistance={4} maxDistance={18} autoRotate autoRotateSpeed={0.4} />

      {graph.edges.map((edge, i) => {
        const from = positions[edge.source];
        const to   = positions[edge.target];
        if (!from || !to) return null;
        return (
          <EdgeWithParticle
            key={i}
            from={from}
            to={to}
            weight={edge.weight}
            offset={pseudoRandom(i)}
          />
        );
      })}

      {graph.nodes.map((node, i) => (
        <NodeSphere
          key={node.id}
          node={node}
          position={positions[i]}
          isHovered={hoveredId === node.id}
          onHover={() => setHoveredId(node.id)}
          onLeave={() => setHoveredId(null)}
        />
      ))}
    </>
  );
}

// ─── Idle demo scene ─────────────────────────────────────────────
const DEMO_NODES = [
  { pos: [0, 0, 0]      as [number, number, number], color: "#3b82f6", size: 0.17, speed: 1.1 },
  { pos: [2.2, 1.2, 0.4]  as [number, number, number], color: "#10b981", size: 0.12, speed: 0.9 },
  { pos: [-2.2, 1.2,-0.4] as [number, number, number], color: "#f59e0b", size: 0.12, speed: 1.5 },
  { pos: [2.2,-1.2,-0.4]  as [number, number, number], color: "#ef4444", size: 0.14, speed: 2.1 },
  { pos: [-2.2,-1.2, 0.4] as [number, number, number], color: "#8b5cf6", size: 0.12, speed: 1.0 },
  { pos: [0,  2.5, -0.8]  as [number, number, number], color: "#f97316", size: 0.11, speed: 1.6 },
  { pos: [0, -2.5,  0.8]  as [number, number, number], color: "#06b6d4", size: 0.11, speed: 1.3 },
  { pos: [1.2, 0.2, 2.2]  as [number, number, number], color: "#10b981", size: 0.10, speed: 0.8 },
  { pos: [-1.2,-0.2,-2.2] as [number, number, number], color: "#ef4444", size: 0.13, speed: 1.8 },
  { pos: [0.5, 1.8, 1.8]  as [number, number, number], color: "#a78bfa", size: 0.10, speed: 1.2 },
  { pos: [-0.5,-1.8,-1.8] as [number, number, number], color: "#34d399", size: 0.10, speed: 0.7 },
];

const DEMO_EDGES: [number, number][] = [
  [0,1],[0,2],[0,3],[0,4],[1,5],[2,6],[3,7],[4,8],[0,9],[0,10],[1,3],[2,4],[5,9],[6,10],
];

function DemoNode({ pos, color, size, speed, idx }: typeof DEMO_NODES[0] & { idx: number }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    const p = 1 + Math.sin(t * speed + idx) * 0.11;
    if (meshRef.current) meshRef.current.scale.setScalar(p);
    if (glowRef.current) glowRef.current.scale.setScalar(1.9 + Math.sin(t * speed + idx) * 0.3);
  });
  return (
    <group position={pos}>
      <mesh ref={glowRef}>
        <sphereGeometry args={[size * 2, 12, 12]} />
        <meshBasicMaterial color={color} transparent opacity={0.07} depthWrite={false} />
      </mesh>
      <mesh ref={meshRef}>
        <sphereGeometry args={[size, 24, 24]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.85} roughness={0.1} metalness={0.4} />
      </mesh>
    </group>
  );
}

function DemoEdgeParticle({ a, b }: { a: number; b: number }) {
  const from      = useMemo(() => new THREE.Vector3(...DEMO_NODES[a].pos), []);
  const to        = useMemo(() => new THREE.Vector3(...DEMO_NODES[b].pos), []);
  const points    = useMemo(() => [from.clone(), to.clone()], []);
  const particleRef = useRef<THREE.Mesh>(null);
  const progress    = useRef(pseudoRandom(a * 11 + b));

  useFrame((_, delta) => {
    if (!particleRef.current) return;
    progress.current = (progress.current + delta * 0.38) % 1;
    particleRef.current.position.lerpVectors(from, to, progress.current);
  });

  return (
    <>
      <Line points={points} color="#3b82f6" lineWidth={0.7} transparent opacity={0.18} />
      <mesh ref={particleRef}>
        <sphereGeometry args={[0.028, 8, 8]} />
        <meshBasicMaterial color="#60a5fa" />
      </mesh>
    </>
  );
}

function IdleScene() {
  const groupRef = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    if (!groupRef.current) return;
    groupRef.current.rotation.y += delta * 0.16;
    groupRef.current.rotation.x += delta * 0.035;
  });
  return (
    <group ref={groupRef}>
      {DEMO_NODES.map((n, i) => <DemoNode key={i} {...n} idx={i} />)}
      {DEMO_EDGES.map(([a, b], i) => <DemoEdgeParticle key={i} a={a} b={b} />)}
    </group>
  );
}

// ─── Legend ───────────────────────────────────────────────────────
const LEGEND = [
  { color: "#10b981", label: "Low  < 20%" },
  { color: "#f59e0b", label: "Medium 20–50%" },
  { color: "#f97316", label: "High 50–70%" },
  { color: "#ef4444", label: "Critical > 70%" },
];

// ─── Main export ──────────────────────────────────────────────────
export default function GNNGraph3D({ graph, height = 400 }: GNNGraph3DProps) {
  return (
    <div className="relative w-full rounded-xl overflow-hidden transition-[height] duration-300 ease-out" style={{ height, background: "#020817" }}>
      <Canvas
        camera={{ position: [0, 0, 9], fov: 58 }}
        gl={{ antialias: true }}
        style={{ background: "transparent" }}
      >
        <ambientLight intensity={0.15} />
        <pointLight position={[6,  6,  6]}  intensity={1.1} color="#3b82f6" />
        <pointLight position={[-6,-6,  6]}  intensity={0.8} color="#8b5cf6" />
        <pointLight position={[0,  0, -6]}  intensity={0.6} color="#ef4444" />
        <fog attach="fog" args={["#020817", 14, 22]} />

        {graph ? <LiveScene graph={graph} /> : <IdleScene />}

        {!graph && (
          <Html center position={[0, -3.9, 0]} style={{ pointerEvents: "none" }}>
            <p style={{
              color: "#334155",
              fontSize: 10,
              textAlign: "center",
              fontFamily: "Inter, system-ui, sans-serif",
              letterSpacing: "0.05em",
              textTransform: "uppercase",
            }}>
              Run analysis to visualise live risk propagation
            </p>
          </Html>
        )}
      </Canvas>

      {/* Legend */}
      <div style={{
        position: "absolute", bottom: 12, left: 12,
        background: "rgba(2,8,23,0.82)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 8, padding: "7px 10px",
        display: "flex", flexDirection: "column", gap: 4,
        backdropFilter: "blur(8px)",
      }}>
        {LEGEND.map(l => (
          <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: l.color, boxShadow: `0 0 6px ${l.color}` }} />
            <span style={{ fontSize: 9, color: "#64748b", fontFamily: "Inter, system-ui, sans-serif" }}>{l.label}</span>
          </div>
        ))}
      </div>

      {/* Orbit hint */}
      {graph && (
        <div style={{
          position: "absolute", bottom: 12, right: 12,
          background: "rgba(2,8,23,0.75)",
          border: "1px solid rgba(255,255,255,0.05)",
          borderRadius: 6, padding: "4px 8px",
          backdropFilter: "blur(8px)",
        }}>
          <span style={{ fontSize: 9, color: "#334155", fontFamily: "Inter, system-ui, sans-serif" }}>
            Drag to orbit · Scroll to zoom · Hover nodes
          </span>
        </div>
      )}
    </div>
  );
}
