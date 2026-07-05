"use client";

import { useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";

export interface OrbItem {
  label: string;
  value: number;   // 0 – 100 (size + brightness)
  color: string;
}

function pseudoRandom(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function Orb({ item, index, total }: { item: OrbItem; index: number; total: number }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);

  // Deterministic position in a loose ellipse
  const angle  = (index / total) * Math.PI * 2;
  const rx     = Math.min(total * 0.38, 2.2);
  const ry     = rx * 0.55;
  const baseX  = Math.cos(angle) * rx;
  const baseY  = Math.sin(angle) * ry;
  const baseZ  = (pseudoRandom(index) - 0.5) * 0.8;
  const radius = 0.1 + (item.value / 100) * 0.22;

  useFrame((state, delta) => {
    const t = state.clock.getElapsedTime();
    const phase = index * 1.1;

    if (meshRef.current) {
      meshRef.current.position.y = baseY + Math.sin(t * 0.9 + phase) * 0.12;
      const pulse = 1 + Math.sin(t * 1.4 + phase) * 0.07;
      meshRef.current.scale.setScalar(pulse);
    }
    if (glowRef.current) {
      glowRef.current.position.y = baseY + Math.sin(t * 0.9 + phase) * 0.12;
      const gp = 1.8 + Math.sin(t * 1.4 + phase) * 0.25;
      glowRef.current.scale.setScalar(gp);
    }
  });

  return (
    <group position={[baseX, baseY, baseZ]}>
      {/* Glow halo */}
      <mesh ref={glowRef}>
        <sphereGeometry args={[radius, 10, 10]} />
        <meshBasicMaterial color={item.color} transparent opacity={0.08} depthWrite={false} />
      </mesh>

      {/* Main orb */}
      <mesh ref={meshRef}>
        <sphereGeometry args={[radius, 24, 24]} />
        <meshStandardMaterial
          color={item.color}
          emissive={item.color}
          emissiveIntensity={0.8}
          roughness={0.1}
          metalness={0.5}
        />
      </mesh>

      {/* Label */}
      <Html distanceFactor={6} center style={{ pointerEvents: "none" }}>
        <div style={{
          fontSize: 8.5, color: "#475569", whiteSpace: "nowrap",
          textAlign: "center", marginTop: 22,
          fontFamily: "Inter, system-ui, sans-serif",
          textShadow: "0 1px 4px #000a",
        }}>
          {item.label.length > 12 ? item.label.slice(0, 10) + "…" : item.label}
          <br />
          <span style={{ color: item.color, fontWeight: 700 }}>{item.value}%</span>
        </div>
      </Html>
    </group>
  );
}

interface OrbCluster3DProps {
  items:   OrbItem[];
  height?: number;
}

export default function OrbCluster3D({ items, height = 160 }: OrbCluster3DProps) {
  if (!items || items.length === 0) return null;
  const camZ = 1.8 + items.length * 0.22;

  return (
    <div style={{ width: "100%", height }}>
      <Canvas
        camera={{ position: [0, 0, camZ], fov: 58 }}
        gl={{ antialias: true }}
        style={{ background: "transparent" }}
      >
        <ambientLight intensity={0.2} />
        <pointLight position={[3,  3, 3]}  intensity={0.9} color="#3b82f6" />
        <pointLight position={[-3,-3, 3]}  intensity={0.6} color="#8b5cf6" />
        <fog attach="fog" args={["#020817", 8, 16]} />

        {items.map((item, i) => (
          <Orb key={i} item={item} index={i} total={items.length} />
        ))}
      </Canvas>
    </div>
  );
}
