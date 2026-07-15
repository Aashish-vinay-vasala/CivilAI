import * as THREE from "three";

export type SceneType = "building" | "bridge" | "harbour";

export function detectSceneType(project: any): SceneType {
  const text = ((project?.name ?? "") + " " + (project?.project_type ?? "")).toLowerCase();
  if (/bridge|metro|viaduct|overpass|flyover|span/.test(text)) return "bridge";
  if (/harbour|harbor|port|dock|marine|wharf|berth/.test(text)) return "harbour";
  return "building";
}

export interface SceneFraming {
  radius: number;
  targetY: number;
  lookAt: [number, number, number];
}

/** BIM-equivalent classification for every mesh in the procedural scenes below —
 * lets a BIM-style viewer bucket them the same way it buckets real IFC elements
 * (type toggles, byType coloring, X-Ray/wireframe, isolate/exploded, section
 * cuts, etc), so every visible mesh responds to those controls. Non-structural
 * construction equipment / cargo (cranes, containers, ship) is tagged
 * "equipment" rather than folded into a structural bucket, so it stays
 * visually distinct while still responding to every viewer control. Pure
 * terrain/water/ground stays untracked, same as the ground plane in every
 * other scene (real IFC, default building). */
export type ElementKind = "wall" | "column" | "floor" | "beam" | "roof" | "equipment";

export interface ElementMeta {
  type: ElementKind;
  floor: number;
  name: string;
}

/** Bridge/harbour scenes shared by every 3D viewer (Digital Twin, BIM 3D Viewer)
 * so a project's name/type always renders the same demo geometry no matter
 * which tab it's viewed from.
 *
 * onElement fires for every structural mesh (tagged with a BIM element kind +
 * floor band) so a BIM-style viewer can bucket/toggle/color them like real IFC
 * elements. onInteractive additionally fires for the handful of "headline"
 * zones (bridge deck sections / warehouse zones) that a sensor-style viewer
 * treats as clickable, colorable rooms. onWater fires for the animated water
 * plane so callers can apply a shimmer effect in their render loop. */

export function buildBridgeScene(
  scene: THREE.Scene,
  onElement: (mesh: THREE.Mesh, meta: ElementMeta) => void,
  onInteractive: (mesh: THREE.Mesh) => void,
  onWater: (mesh: THREE.Mesh) => void,
): SceneFraming {
  // Water
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(220, 80),
    new THREE.MeshLambertMaterial({ color: 0x0d2d52, transparent: true, opacity: 0.88 })
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = -2;
  scene.add(water);
  onWater(water);

  // Green terrain hills on each end
  [-75, 75].forEach(x => {
    const hill = new THREE.Mesh(
      new THREE.BoxGeometry(50, 4, 90),
      new THREE.MeshLambertMaterial({ color: 0x14532d })
    );
    hill.position.set(x, -1, 0);
    scene.add(hill);
  });

  // 5 concrete piers (+ footings)
  const pierMat = new THREE.MeshLambertMaterial({ color: 0x6b7280 });
  [-40, -20, 0, 20, 40].forEach((x, i) => {
    const pier = new THREE.Mesh(new THREE.BoxGeometry(3.5, 14, 5), pierMat.clone());
    pier.position.set(x, 5.5, 0);
    pier.userData = { name: `Pier ${i + 1}` };
    scene.add(pier);
    onElement(pier, { type: "column", floor: 0, name: `Pier ${i + 1}` });

    const footing = new THREE.Mesh(new THREE.BoxGeometry(6, 2, 8), pierMat.clone());
    footing.position.set(x, -0.5, 0);
    footing.userData = { name: `Pier ${i + 1} Footing` };
    scene.add(footing);
    onElement(footing, { type: "column", floor: 0, name: `Pier ${i + 1} Footing` });
  });

  // Bridge deck sections (sensor rooms)
  const deckMat = new THREE.MeshLambertMaterial({ color: 0x374151, transparent: true, opacity: 0.85 });
  [-45, -15, 15, 45].forEach((x, i) => {
    const deck = new THREE.Mesh(new THREE.BoxGeometry(30, 1.5, 14), deckMat.clone());
    deck.position.set(x, 12.5, 0);
    deck.userData = { type: "room", floor: i, zone: "A", name: `Bridge Section ${i + 1}` };
    scene.add(deck);
    onElement(deck, { type: "floor", floor: i, name: `Bridge Section ${i + 1}` });
    onInteractive(deck);
  });

  // Guardrails
  const railMat = new THREE.MeshLambertMaterial({ color: 0x9ca3af });
  [-6.5, 6.5].forEach((z, i) => {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(120, 0.8, 0.3), railMat.clone());
    rail.position.set(0, 13.5, z);
    scene.add(rail);
    onElement(rail, { type: "wall", floor: 2, name: `Guardrail ${i === 0 ? "South" : "North"}` });
  });

  // Under-deck I-beams
  const beamMat = new THREE.MeshLambertMaterial({ color: 0x4b5563 });
  [-6, -2, 2, 6].forEach((z, i) => {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(120, 1.8, 0.4), beamMat.clone());
    beam.position.set(0, 11.2, z);
    scene.add(beam);
    onElement(beam, { type: "beam", floor: 1, name: `Under-Deck Beam ${i + 1}` });
  });

  // Approach ramps
  [-68, 68].forEach((x, i) => {
    const ramp = new THREE.Mesh(new THREE.BoxGeometry(22, 1.5, 14), beamMat.clone());
    ramp.position.set(x, 9.5, 0);
    ramp.rotation.z = i === 0 ? 0.25 : -0.25;
    scene.add(ramp);
    onElement(ramp, { type: "beam", floor: 0, name: `Approach Ramp ${i + 1}` });
  });

  // Tower crane (yellow) — construction equipment, tagged "equipment" so it still
  // responds to Type/X-Ray/Wireframe/Isolate/Exploded/Opacity like every other mesh.
  const craneMat = new THREE.MeshLambertMaterial({ color: 0xf59e0b });
  const craneMast = new THREE.Mesh(new THREE.BoxGeometry(1, 22, 1), craneMat);
  craneMast.position.set(15, 23, 7);
  scene.add(craneMast);
  onElement(craneMast, { type: "equipment", floor: 2, name: "Tower Crane Mast" });
  const craneJib = new THREE.Mesh(new THREE.BoxGeometry(20, 0.6, 0.6), craneMat);
  craneJib.position.set(15, 34, 7);
  scene.add(craneJib);
  onElement(craneJib, { type: "equipment", floor: 2, name: "Tower Crane Jib" });
  const counterJib = new THREE.Mesh(new THREE.BoxGeometry(9, 0.6, 0.6), craneMat);
  counterJib.position.set(6, 34, 7);
  scene.add(counterJib);
  onElement(counterJib, { type: "equipment", floor: 2, name: "Tower Crane Counter-Jib" });

  // Scaffolding — construction equipment, tagged "equipment" for the same reason.
  const scaffoldMat = new THREE.MeshLambertMaterial({ color: 0xd97706, transparent: true, opacity: 0.75 });
  [-12, -8, -4, 0, 4, 8, 12].forEach((x, i) => {
    const vert = new THREE.Mesh(new THREE.BoxGeometry(0.25, 12, 0.25), scaffoldMat);
    vert.position.set(x, 6, -5);
    scene.add(vert);
    onElement(vert, { type: "equipment", floor: 0, name: `Scaffold Post ${i + 1}` });
    const horiz = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 12), scaffoldMat);
    horiz.position.set(x, 6, 0);
    scene.add(horiz);
    onElement(horiz, { type: "equipment", floor: 0, name: `Scaffold Rail ${i + 1}` });
  });

  // Ground plane
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(300, 300),
    new THREE.MeshLambertMaterial({ color: 0x06101f })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -3;
  scene.add(ground);

  return { radius: 95, targetY: 25, lookAt: [0, 10, 0] };
}

export function buildHarbourScene(
  scene: THREE.Scene,
  onElement: (mesh: THREE.Mesh, meta: ElementMeta) => void,
  onInteractive: (mesh: THREE.Mesh) => void,
  onWater: (mesh: THREE.Mesh) => void,
): SceneFraming {
  // Water
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 130),
    new THREE.MeshLambertMaterial({ color: 0x0c2440, transparent: true, opacity: 0.9 })
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = -1;
  scene.add(water);
  onWater(water);

  // Quay platform
  const quayMat = new THREE.MeshLambertMaterial({ color: 0x374151 });
  const quay = new THREE.Mesh(new THREE.BoxGeometry(90, 1.5, 28), quayMat);
  quay.position.set(0, 0.25, 28);
  scene.add(quay);
  onElement(quay, { type: "floor", floor: 0, name: "Quay Platform" });

  // Quay wall
  const wallMat = new THREE.MeshLambertMaterial({ color: 0x4b5563 });
  const quayWall = new THREE.Mesh(new THREE.BoxGeometry(90, 2.5, 1.5), wallMat);
  quayWall.position.set(0, 1.5, 14.5);
  scene.add(quayWall);
  onElement(quayWall, { type: "wall", floor: 0, name: "Quay Wall" });

  // Bollards
  const bollardMat = new THREE.MeshLambertMaterial({ color: 0x9ca3af });
  [-35, -25, -15, -5, 5, 15, 25, 35].forEach((x, i) => {
    const bollard = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1.5, 8), bollardMat.clone());
    bollard.position.set(x, 1.5, 15);
    scene.add(bollard);
    onElement(bollard, { type: "column", floor: 0, name: `Bollard ${i + 1}` });
  });

  // 3 gantry cranes — construction/operational equipment, tagged "equipment" so
  // they still respond to Type/X-Ray/Wireframe/Isolate/Exploded/Opacity.
  const craneMat = new THREE.MeshLambertMaterial({ color: 0xf59e0b });
  const trolleyMat = new THREE.MeshLambertMaterial({ color: 0xef4444 });
  [-24, 0, 24].forEach((cx, ci) => {
    // Two legs
    [21, 35].forEach((z, zi) => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(1.2, 20, 1.2), craneMat);
      leg.position.set(cx, 10, z);
      scene.add(leg);
      onElement(leg, { type: "equipment", floor: 1, name: `Gantry Crane ${ci + 1} Leg ${zi + 1}` });
    });
    // Bridge beam
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2, 16), craneMat);
    bridge.position.set(cx, 21, 28);
    scene.add(bridge);
    onElement(bridge, { type: "equipment", floor: 2, name: `Gantry Crane ${ci + 1} Bridge` });
    // Outreach jib
    const jib = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1, 30), craneMat);
    jib.position.set(cx, 23, 7);
    scene.add(jib);
    onElement(jib, { type: "equipment", floor: 2, name: `Gantry Crane ${ci + 1} Jib` });
    // Trolley
    const trolley = new THREE.Mesh(new THREE.BoxGeometry(2, 1.5, 2), trolleyMat);
    trolley.position.set(cx, 22.5, 5);
    scene.add(trolley);
    onElement(trolley, { type: "equipment", floor: 2, name: `Gantry Crane ${ci + 1} Trolley` });
  });

  // Container stacks — cargo, tagged "equipment" for the same reason.
  const containerColors = [0xef4444, 0x3b82f6, 0x10b981, 0xf59e0b, 0x8b5cf6, 0x06b6d4, 0xf97316, 0x22d3ee];
  for (let row = 0; row < 4; row++) {
    for (let col = -5; col <= 5; col++) {
      const stackHeight = (Math.abs(col) + row) % 3;
      const color = containerColors[(col + 5 + row * 11) % 8];
      const container = new THREE.Mesh(
        new THREE.BoxGeometry(3, 2, 5.5),
        new THREE.MeshLambertMaterial({ color })
      );
      container.position.set(col * 3.6, 1 + stackHeight * 2, 42 + row * 7);
      scene.add(container);
      onElement(container, { type: "equipment", floor: row, name: `Container Row ${row + 1} Col ${col + 6}` });
    }
  }

  // Warehouse (4 sensor zones)
  const warehouseColors = [0x334155, 0x1e3a5f, 0x1e293b, 0x0f1e35];
  for (let i = 0; i < 4; i++) {
    const wh = new THREE.Mesh(
      new THREE.BoxGeometry(17.5, 10, 22),
      new THREE.MeshLambertMaterial({ color: warehouseColors[i] })
    );
    wh.position.set(-26 + i * 18.5, 5, 66);
    wh.userData = { type: "room", floor: i, zone: "A", name: `Warehouse Zone ${i + 1}` };
    scene.add(wh);
    onElement(wh, { type: "floor", floor: i, name: `Warehouse Zone ${i + 1}` });
    onInteractive(wh);
  }

  // Warehouse roof
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x1e293b });
  const roof = new THREE.Mesh(new THREE.BoxGeometry(72, 0.4, 22), roofMat);
  roof.position.set(0, 11, 66);
  scene.add(roof);
  onElement(roof, { type: "roof", floor: 3, name: "Warehouse Roof" });

  // Ship hull — vessel, tagged "equipment" for the same reason.
  const shipMat = new THREE.MeshLambertMaterial({ color: 0x1f2937 });
  const hull = new THREE.Mesh(new THREE.BoxGeometry(55, 5, 13), shipMat);
  hull.position.set(-3, 1.5, -12);
  scene.add(hull);
  onElement(hull, { type: "equipment", floor: 0, name: "Ship Hull" });

  // Ship superstructure
  const superMat = new THREE.MeshLambertMaterial({ color: 0x374151 });
  const superstructure = new THREE.Mesh(new THREE.BoxGeometry(14, 8, 11), superMat);
  superstructure.position.set(16, 7.5, -12);
  scene.add(superstructure);
  onElement(superstructure, { type: "equipment", floor: 0, name: "Ship Superstructure" });

  // Ship chimney
  const chimneyMat = new THREE.MeshLambertMaterial({ color: 0x4b5563 });
  const chimney = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.2, 5, 8), chimneyMat);
  chimney.position.set(14, 13, -12);
  scene.add(chimney);
  onElement(chimney, { type: "equipment", floor: 0, name: "Ship Chimney" });

  // Ship deck lights
  [-15, -2, 12].forEach(x => {
    const light = new THREE.PointLight(0x3b82f6, 0.4, 20);
    light.position.set(x, 5, -12);
    scene.add(light);
  });

  // Dock lights
  [-30, -10, 10, 30].forEach(x => {
    const light = new THREE.PointLight(0xfcd34d, 0.6, 25);
    light.position.set(x, 18, 28);
    scene.add(light);
  });

  // Ground
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(300, 300),
    new THREE.MeshLambertMaterial({ color: 0x060d1a })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -1.5;
  scene.add(ground);

  return { radius: 90, targetY: 32, lookAt: [0, 8, 20] };
}
