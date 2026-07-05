"use client";

import { useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";

export interface BarDatum {
  label: string;
  value: number;  // 0 – 100
  color: string;
}

function Bar3D({ datum, index, total }: { datum: BarDatum; index: number; total: number }) {
  const meshRef    = useRef<THREE.Mesh>(null);
  const glowRef    = useRef<THREE.Mesh>(null);
  const currentH   = useRef(0);
  const targetH    = datum.value / 100 * 2.2; // max height 2.2 units

  const spacing = 1.0;
  const xOffset = (index - (total - 1) / 2) * spacing;

  useFrame((state, delta) => {
    currentH.current += (targetH - currentH.current) * Math.min(delta * 2.0, 1);
    const h = Math.max(currentH.current, 0.02);

    if (meshRef.current) {
      meshRef.current.scale.y = h;
      meshRef.current.position.y = h / 2 - 1.1;
    }
    if (glowRef.current) {
      glowRef.current.scale.y = h + 0.1;
      glowRef.current.position.y = h / 2 - 1.1;
      const t = state.clock.getElapsedTime();
      (glowRef.current.material as THREE.MeshBasicMaterial).opacity =
        0.06 + Math.sin(t * 1.5 + index) * 0.02;
    }
  });

  return (
    <group position={[xOffset, 0, 0]}>
      {/* Glow column */}
      <mesh ref={glowRef}>
        <boxGeometry args={[0.38, 1, 0.38]} />
        <meshBasicMaterial color={datum.color} transparent opacity={0.06} depthWrite={false} />
      </mesh>

      {/* Main bar */}
      <mesh ref={meshRef}>
        <boxGeometry args={[0.28, 1, 0.28]} />
        <meshStandardMaterial
          color={datum.color}
          emissive={datum.color}
          emissiveIntensity={0.55}
          roughness={0.15}
          metalness={0.4}
        />
      </mesh>

      {/* Label */}
      <Html center position={[0, -1.28, 0]} style={{ pointerEvents: "none" }}>
        <div style={{
          fontSize: 9, color: "#475569", whiteSpace: "nowrap",
          textAlign: "center", fontFamily: "Inter, system-ui, sans-serif",
        }}>
          {datum.label}
          <br />
          <span style={{ color: datum.color, fontWeight: 700 }}>{datum.value}%</span>
        </div>
      </Html>
    </group>
  );
}

interface FloatingBars3DProps {
  data:    BarDatum[];
  height?: number;  // canvas height in px (default 180)
}

export default function FloatingBars3D({ data, height = 180 }: FloatingBars3DProps) {
  if (!data || data.length === 0) return null;

  const camZ = 1.5 + data.length * 0.55;

  return (
    <div style={{ width: "100%", height }}>
      <Canvas
        camera={{ position: [0, 0, camZ], fov: 55 }}
        gl={{ antialias: true }}
        style={{ background: "transparent" }}
      >
        <ambientLight intensity={0.2} />
        <pointLight position={[0,  3, 3]} intensity={1.2} color="#3b82f6" />
        <pointLight position={[0, -2, 2]} intensity={0.6} color="#8b5cf6" />

        {data.map((d, i) => (
          <Bar3D key={i} datum={d} index={i} total={data.length} />
        ))}

        {/* Floor grid glow */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.1, 0]}>
          <planeGeometry args={[data.length * 1.4, 3]} />
          <meshBasicMaterial color="#3b82f6" transparent opacity={0.03} />
        </mesh>
      </Canvas>
    </div>
  );
}
