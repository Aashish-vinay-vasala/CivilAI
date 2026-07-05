"use client";

import { useRef, useEffect } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";

// 48 dot-segments around a circle, two instanced meshes (active/inactive)
function GaugeDots({
  value, color, count = 48,
}: { value: number; color: string; count?: number }) {
  const activeRef   = useRef<THREE.InstancedMesh>(null);
  const inactiveRef = useRef<THREE.InstancedMesh>(null);
  const progressRef = useRef(0);
  const matrix      = useRef(new THREE.Matrix4());
  const groupRef    = useRef<THREE.Group>(null);

  // Animate progress toward value
  useFrame((state, delta) => {
    if (groupRef.current) groupRef.current.rotation.z -= delta * 0.25;

    progressRef.current += (value - progressRef.current) * Math.min(delta * 2.2, 1);
    const activated = Math.round(progressRef.current * count);

    if (!activeRef.current || !inactiveRef.current) return;
    const R = 0.78;

    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
      const x = Math.cos(angle) * R;
      const y = Math.sin(angle) * R;
      matrix.current.setPosition(x, y, 0);
      if (i < activated) {
        activeRef.current.setMatrixAt(i, matrix.current);
        inactiveRef.current.setMatrixAt(i, new THREE.Matrix4().setPosition(999, 999, 999)); // hide
      } else {
        inactiveRef.current.setMatrixAt(i, matrix.current);
        activeRef.current.setMatrixAt(i, new THREE.Matrix4().setPosition(999, 999, 999)); // hide
      }
    }
    activeRef.current.instanceMatrix.needsUpdate   = true;
    inactiveRef.current.instanceMatrix.needsUpdate = true;
  });

  const geo = <sphereGeometry args={[0.058, 8, 8]} />;

  return (
    <group ref={groupRef}>
      <instancedMesh ref={activeRef} args={[undefined, undefined, count]}>
        {geo}
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.9} roughness={0.1} />
      </instancedMesh>
      <instancedMesh ref={inactiveRef} args={[undefined, undefined, count]}>
        {geo}
        <meshStandardMaterial color="#1e293b" roughness={0.8} />
      </instancedMesh>
    </group>
  );
}

interface GaugeRing3DProps {
  value?: number;   // 0.0 – 1.0
  color?: string;
  size?:  number;   // canvas px
  label?: string;
}

export default function GaugeRing3D({
  value = 0.75,
  color = "#3b82f6",
  size  = 120,
  label,
}: GaugeRing3DProps) {
  const pct = Math.round(value * 100);

  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <Canvas
        camera={{ position: [0, 0, 2.4], fov: 48 }}
        gl={{ antialias: true }}
        style={{ background: "transparent" }}
      >
        <ambientLight intensity={0.25} />
        <pointLight position={[0, 0, 2]} intensity={1.2} color={color} />
        <GaugeDots value={value} color={color} />
      </Canvas>

      {/* Centre overlay */}
      <div style={{
        position: "absolute", inset: 0,
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        pointerEvents: "none",
      }}>
        <span style={{
          fontSize: size * 0.16, fontWeight: 700, color: "#f1f5f9",
          fontFamily: "Inter, system-ui, sans-serif",
          textShadow: `0 0 12px ${color}`,
        }}>
          {pct}%
        </span>
        {label && (
          <span style={{
            fontSize: size * 0.08, color: "#475569", marginTop: 2,
            fontFamily: "Inter, system-ui, sans-serif",
          }}>
            {label}
          </span>
        )}
      </div>
    </div>
  );
}
