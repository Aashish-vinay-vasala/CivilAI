"use client";

import { useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";

function Sphere({ color, active }: { color: string; active: boolean }) {
  const groupRef  = useRef<THREE.Group>(null);
  const ringRef1  = useRef<THREE.Mesh>(null);
  const ringRef2  = useRef<THREE.Mesh>(null);
  const coreRef   = useRef<THREE.Mesh>(null);
  const glowRef   = useRef<THREE.Mesh>(null);

  useFrame((state, delta) => {
    const t = state.clock.getElapsedTime();
    const speed = active ? 1.6 : 0.7;

    if (groupRef.current)  groupRef.current.rotation.y  += delta * speed * 0.4;
    if (ringRef1.current)  ringRef1.current.rotation.x  += delta * speed * 0.9;
    if (ringRef2.current)  ringRef2.current.rotation.z  += delta * speed * 0.55;

    // Pulse core
    if (coreRef.current) {
      const p = 1 + Math.sin(t * (active ? 3 : 1.2)) * (active ? 0.12 : 0.05);
      coreRef.current.scale.setScalar(p);
    }
    // Pulse outer glow
    if (glowRef.current) {
      const g = 1.6 + Math.sin(t * (active ? 2.5 : 1)) * 0.25;
      glowRef.current.scale.setScalar(g);
    }
  });

  return (
    <group ref={groupRef}>
      {/* Outer glow halo */}
      <mesh ref={glowRef}>
        <icosahedronGeometry args={[0.65, 1]} />
        <meshBasicMaterial color={color} transparent opacity={0.04} depthWrite={false} wireframe />
      </mesh>

      {/* Wireframe shell */}
      <mesh>
        <icosahedronGeometry args={[0.52, 2]} />
        <meshBasicMaterial color={color} transparent opacity={0.18} wireframe />
      </mesh>

      {/* Solid core */}
      <mesh ref={coreRef}>
        <icosahedronGeometry args={[0.38, 1]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={active ? 1.2 : 0.75}
          roughness={0.1}
          metalness={0.6}
          transparent
          opacity={0.9}
        />
      </mesh>

      {/* Orbiting ring 1 — tilted 60° */}
      <mesh ref={ringRef1} rotation={[Math.PI / 3, 0, 0]}>
        <torusGeometry args={[0.72, 0.018, 8, 80]} />
        <meshBasicMaterial color={color} transparent opacity={0.55} />
      </mesh>

      {/* Orbiting ring 2 — tilted 120° */}
      <mesh ref={ringRef2} rotation={[Math.PI * 0.7, Math.PI / 4, 0]}>
        <torusGeometry args={[0.58, 0.014, 8, 60]} />
        <meshBasicMaterial color={color} transparent opacity={0.4} />
      </mesh>
    </group>
  );
}

interface AISphere3DProps {
  color?:  string;
  size?:   number;
  active?: boolean;
}

export default function AISphere3D({
  color  = "#3b82f6",
  size   = 160,
  active = false,
}: AISphere3DProps) {
  return (
    <div style={{ width: size, height: size, flexShrink: 0 }}>
      <Canvas
        camera={{ position: [0, 0, 2.2], fov: 52 }}
        gl={{ antialias: true }}
        style={{ background: "transparent" }}
      >
        <ambientLight intensity={0.2} />
        <pointLight position={[2,  2, 2]}  intensity={1}   color={color} />
        <pointLight position={[-2,-2, 2]}  intensity={0.5} color={color} />
        <Sphere color={color} active={active} />
      </Canvas>
    </div>
  );
}
