// VELMORA — Sunset Streets: the 3D view. The simulation stays 2D (x, y on the
// ground plane); only the view becomes 3D. World coords map to three.js as
// X = x - 2048, Z = y - 2048, Y up, so the 4096x4096 city is centred on the
// origin. Sunset lighting, a shadow-casting sun, fog, and instanced meshes
// for the static city keep the frame cheap even under SwiftShader.
//
// three.js r187 (0.187.0), vendored as a single minified ES module at
// game/vendor/three.min.js and imported by relative path — no network, no
// import map. (Upstream no longer ships build/three.module.min.js, so the
// published three.module.js was bundled and minified locally with esbuild;
// the library code itself is untouched.)
//
// Camera modes come from state.camera = { mode, dist, yaw } (worker B owns
// the logic side): 'follow' third-person on foot, 'chase' behind the car,
// 'high' elevated wide angle for the cover shot. Absent mode falls back to
// chase while driving, follow on foot.

import * as THREE from '../vendor/three.min.js';
import { CAMERA3D, VIEW, WORLD } from './config.js';

const WORLD_W = (WORLD && WORLD.width) || 4096;
const WORLD_H = (WORLD && WORLD.height) || 4096;
const HALF_W = WORLD_W / 2;
const HALF_H = WORLD_H / 2;
const VIEW_W = (VIEW && VIEW.width) || 1280;
const VIEW_H = (VIEW && VIEW.height) || 720;
const CFG = CAMERA3D || {};
const FOG_NEAR = CFG.fogNear || 2000;
const FOG_FAR = CFG.fogFar || 6500;
const SHADOW_SIZE = CFG.shadowMapSize || 2048;
const SHADOW_RANGE = CFG.shadowRange || 750;

const SUNSET_SKY = 0xffc98a;
const SUNSET_FOG = 0xf2b07e;

// 2D world -> 3D ground plane.
function cx(x) { return x - HALF_W; }
function cz(y) { return y - HALF_H; }
// 2D heading angle -> rotation about Y (local +X is the facing direction).
function rotY(angle) { return -(angle || 0); }

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

// Deterministic pseudo-height from a building's footprint, so the skyline is
// stable for a given city without touching the seeded RNG.
function hash2(x, y) {
  let h = (Math.round(x) * 374761393 + Math.round(y) * 668265263) | 0;
  h = (h ^ (h >> 13)) | 0;
  h = Math.imul(h, 1274126177);
  h = (h ^ (h >> 16)) >>> 0;
  return h / 4294967295;
}

// Height of a building in 3D. Worker B's city.js stores the height in `h`
// (marked by `winSeed`; towers 90-160, houses 14-26, warehouses 22-34,
// shops 18-30) and the footprint depth has to be rebuilt from the road
// spans — see buildingDepth below. A plain `height` field wins if present;
// with neither, derive height from kind/district.
function buildingHeight(b) {
  if (typeof b.height === 'number') return b.height;
  if (typeof b.height3d === 'number') return b.height3d;
  if (typeof b.h3 === 'number') return b.h3;
  if (b.winSeed !== undefined && typeof b.h === 'number') return b.h;
  const r = hash2(b.x, b.y);
  if (b.kind === 'tower') return 190 + r * 170;
  if (b.kind === 'warehouse') return 55 + r * 30;
  if (b.kind === 'shop') return 45 + r * 22;
  return 34 + r * 26; // house
}

// The solid strips between neighbouring roads, plus the outer rim strips —
// the same spans city.js builds its blocks from.
function blockSpans(cityData) {
  const half = (cityData.roadW || 88) / 2;
  const edges = [0];
  for (const line of cityData.lines || []) edges.push(line - half, line + half);
  edges.push(WORLD_W);
  const spans = [];
  for (let i = 0; i + 1 < edges.length; i += 2) spans.push({ from: edges[i], to: edges[i + 1] });
  return spans;
}

// Footprint depth of a building. In B's city data `h` is the height, so the
// depth is rebuilt from the block span the building sits in (span - 24, the
// same inset city.js used); in v1 data `h` already is the depth.
function buildingDepth(b, spans) {
  if (b.winSeed === undefined) return b.h;
  for (const s of spans) {
    if (b.y >= s.from && b.y < s.to) return s.to - s.from - 24;
  }
  return b.h;
}

const ROOF_COLORS = {
  tower: '#dfeaf2',
  warehouse: '#5a5148',
  house: '#6e4a3a',
  shop: '#8a6f3a',
};

export function createScene3D(glCanvas, city) {
  const renderer = new THREE.WebGLRenderer({
    canvas: glCanvas,
    antialias: true,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.06;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SUNSET_SKY);
  scene.fog = new THREE.Fog(SUNSET_FOG, FOG_NEAR, FOG_FAR);

  const camera = new THREE.PerspectiveCamera(CFG.fov || 55, VIEW_W / VIEW_H, CFG.near || 10, CFG.far || 12000);
  camera.position.set(0, 400, 600);
  camera.lookAt(0, 0, 0);

  // ---- sunset lighting -------------------------------------------------
  const hemi = new THREE.HemisphereLight(0xffd9a8, 0x7a4a30, 1.15);
  scene.add(hemi);
  const sunDir = new THREE.Vector3(
    (CFG.sun && CFG.sun.x) ?? -0.55,
    (CFG.sun && CFG.sun.y) ?? 0.72,
    (CFG.sun && CFG.sun.z) ?? 0.42,
  ).normalize();
  const sun = new THREE.DirectionalLight(0xffb36b, 2.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(SHADOW_SIZE, SHADOW_SIZE);
  sun.shadow.camera.left = -SHADOW_RANGE;
  sun.shadow.camera.right = SHADOW_RANGE;
  sun.shadow.camera.top = SHADOW_RANGE;
  sun.shadow.camera.bottom = -SHADOW_RANGE;
  sun.shadow.camera.near = 100;
  sun.shadow.camera.far = 4200;
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  scene.add(sun.target);

  // ---- shared geometry / materials --------------------------------------
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const lambert = (color) => new THREE.MeshLambertMaterial({ color });
  const basic = (color, opts) => new THREE.MeshBasicMaterial({ color, ...(opts || {}) });

  // ---- static city -------------------------------------------------------
  function buildStatic(cityData) {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(WORLD_W, WORLD_H),
      lambert(0xab8560),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, 0, 0);
    ground.receiveShadow = true;
    scene.add(ground);

    // Ocean: a wide plane past the south edge so the horizon reads as sea.
    const beachY0 = (cityData.beach && cityData.beach.y0) || 3904;
    const ocean = new THREE.Mesh(
      new THREE.PlaneGeometry(12000, 6100),
      lambert(0x2f7fa8),
    );
    ocean.rotation.x = -Math.PI / 2;
    ocean.position.set(0, -2, cz(beachY0 + 96) + 3050);
    scene.add(ocean);
    // Beach sand strip between the city and the water.
    const sand = new THREE.Mesh(
      new THREE.PlaneGeometry(WORLD_W, 96),
      lambert(0xe8d5a2),
    );
    sand.rotation.x = -Math.PI / 2;
    sand.position.set(0, 0.06, cz(beachY0 + 48));
    sand.receiveShadow = true;
    scene.add(sand);

    // Parks: green slabs.
    const parks = cityData.parks || [];
    for (const p of parks) {
      const park = new THREE.Mesh(
        new THREE.PlaneGeometry(p.w, p.h),
        lambert(0x5d9b4a),
      );
      park.rotation.x = -Math.PI / 2;
      park.position.set(cx(p.x + p.w / 2), 0.08, cz(p.y + p.h / 2));
      park.receiveShadow = true;
      scene.add(park);
    }

    // Roads: pale sidewalk strip, dark asphalt, instanced lane dashes.
    const roads = cityData.roads || [];
    const roadW = cityData.roadW || 88;
    const sidewalkMat = lambert(0x9aa0ab);
    const asphaltMat = lambert(0x3a3f4a);
    const dashGeo = new THREE.PlaneGeometry(34, 4);
    const dashMat = basic(0xe8d47a);
    const dashCount = roads.length * 64;
    const dashes = new THREE.InstancedMesh(dashGeo, dashMat, Math.max(dashCount, 1));
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const eul = new THREE.Euler();
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3(1, 1, 1);
    let di = 0;
    for (const r of roads) {
      const len = Math.hypot(r.x2 - r.x1, r.y2 - r.y1);
      const mx = (r.x1 + r.x2) / 2;
      const my = (r.y1 + r.y2) / 2;
      const walk = new THREE.Mesh(new THREE.PlaneGeometry(r.horizontal ? len : roadW + 20, r.horizontal ? roadW + 20 : len), sidewalkMat);
      walk.rotation.x = -Math.PI / 2;
      walk.position.set(cx(mx), 0.05, cz(my));
      walk.receiveShadow = true;
      scene.add(walk);
      const road = new THREE.Mesh(new THREE.PlaneGeometry(r.horizontal ? len : roadW, r.horizontal ? roadW : len), asphaltMat);
      road.rotation.x = -Math.PI / 2;
      road.position.set(cx(mx), 0.1, cz(my));
      road.receiveShadow = true;
      scene.add(road);
      // Centre dashes along the road.
      const step = 64;
      for (let d = 20; d < len - 20 && di < dashCount; d += step) {
        const along = -len / 2 + d + 17;
        const dx = r.horizontal ? cx(mx) + along : cx(mx);
        const dz = r.horizontal ? cz(my) : cz(my) + along;
        eul.set(-Math.PI / 2, 0, r.horizontal ? 0 : Math.PI / 2);
        q.setFromEuler(eul);
        pos.set(dx, 0.14, dz);
        m4.compose(pos, q, scl);
        dashes.setMatrixAt(di, m4);
        di += 1;
      }
    }
    dashes.count = di;
    scene.add(dashes);

    // Buildings: one instanced box per building + one instanced roof slab.
    const buildings = cityData.buildings || [];
    const spans = blockSpans(cityData);
    const bodyMesh = new THREE.InstancedMesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), Math.max(buildings.length, 1));
    const roofMesh = new THREE.InstancedMesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), Math.max(buildings.length, 1));
    const col = new THREE.Color();
    for (let i = 0; i < buildings.length; i += 1) {
      const b = buildings[i];
      const h3 = buildingHeight(b);
      const depth = buildingDepth(b, spans);
      const bx = cx(b.x + b.w / 2);
      const bz = cz(b.y + depth / 2);
      eul.set(0, 0, 0);
      q.setFromEuler(eul);
      pos.set(bx, h3 / 2, bz);
      scl.set(b.w, h3, depth);
      m4.compose(pos, q, scl);
      bodyMesh.setMatrixAt(i, m4);
      bodyMesh.setColorAt(i, col.set(b.color || '#8a6f5c'));
      pos.set(bx, h3 + 2.5, bz);
      scl.set(b.w + 6, 5, depth + 6);
      m4.compose(pos, q, scl);
      roofMesh.setMatrixAt(i, m4);
      roofMesh.setColorAt(i, col.set(ROOF_COLORS[b.kind] || ROOF_COLORS.house));
    }
    bodyMesh.count = buildings.length;
    roofMesh.count = buildings.length;
    bodyMesh.castShadow = true;
    bodyMesh.receiveShadow = true;
    roofMesh.castShadow = true;
    scene.add(bodyMesh);
    scene.add(roofMesh);

    // Trees: use the city's seeded trees when present (worker B's city.js);
    // otherwise the loose park grid the 2D renderer used (step 64, every
    // third spot skipped).
    const treeSpots = [];
    if (cityData.trees && cityData.trees.length) {
      for (const t of cityData.trees) treeSpots.push({ x: t.x, y: t.y, s: t.s || 1 });
    } else {
      for (const p of parks) {
        let n = 0;
        for (let ty = p.y + 30; ty < p.y + p.h - 20; ty += 64) {
          for (let tx = p.x + 30; tx < p.x + p.w - 20; tx += 64) {
            n += 1;
            if (n % 3 === 0) continue;
            treeSpots.push({ x: tx, y: ty, s: 0.8 + hash2(tx, ty) * 0.5 });
          }
        }
      }
    }
    const trunkMesh = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(3, 4.5, 18, 6),
      lambert(0x6e4a3a),
      Math.max(treeSpots.length, 1),
    );
    const canopyMesh = new THREE.InstancedMesh(
      new THREE.SphereGeometry(14, 8, 6),
      lambert(0x3d7a33),
      Math.max(treeSpots.length, 1),
    );
    for (let i = 0; i < treeSpots.length; i += 1) {
      const t = treeSpots[i];
      const s = t.s || 1;
      eul.set(0, 0, 0);
      q.setFromEuler(eul);
      pos.set(cx(t.x), 9 * s, cz(t.y));
      scl.set(s, s, s);
      m4.compose(pos, q, scl);
      trunkMesh.setMatrixAt(i, m4);
      pos.set(cx(t.x), (18 + 12) * s, cz(t.y));
      m4.compose(pos, q, scl);
      canopyMesh.setMatrixAt(i, m4);
      canopyMesh.setColorAt(i, col.setHSL(0.33, 0.45, 0.28 + hash2(t.y, t.x) * 0.12));
    }
    trunkMesh.count = treeSpots.length;
    canopyMesh.count = treeSpots.length;
    trunkMesh.castShadow = true;
    canopyMesh.castShadow = true;
    scene.add(trunkMesh);
    scene.add(canopyMesh);

    // Streetlights (city.js lamps): instanced poles + warm glowing heads.
    const lamps = cityData.lamps || [];
    if (lamps.length) {
      const poleMesh = new THREE.InstancedMesh(
        new THREE.CylinderGeometry(2, 2.5, 26, 6),
        lambert(0x2c303a),
        lamps.length,
      );
      const headMesh = new THREE.InstancedMesh(
        new THREE.SphereGeometry(4, 8, 6),
        basic(0xffe9a3),
        lamps.length,
      );
      for (let i = 0; i < lamps.length; i += 1) {
        eul.set(0, 0, 0);
        q.setFromEuler(eul);
        pos.set(cx(lamps[i].x), 13, cz(lamps[i].y));
        scl.set(1, 1, 1);
        m4.compose(pos, q, scl);
        poleMesh.setMatrixAt(i, m4);
        pos.set(cx(lamps[i].x), 27, cz(lamps[i].y));
        m4.compose(pos, q, scl);
        headMesh.setMatrixAt(i, m4);
      }
      scene.add(poleMesh);
      scene.add(headMesh);
    }

    // Dock cranes (city.js cranes): mast + jib + counter-jib + hanging hook.
    const craneMat = lambert(0xc9a24a);
    const craneDark = lambert(0x6f655c);
    for (const c of cityData.cranes || []) {
      const crane = new THREE.Group();
      const mast = new THREE.Mesh(boxGeo, craneMat);
      mast.scale.set(10, 95, 10);
      mast.position.y = 47;
      mast.castShadow = true;
      crane.add(mast);
      const jib = new THREE.Mesh(boxGeo, craneMat);
      jib.scale.set(120, 7, 7);
      jib.position.set(45, 92, 0);
      jib.castShadow = true;
      crane.add(jib);
      const counter = new THREE.Mesh(boxGeo, craneDark);
      counter.scale.set(36, 9, 9);
      counter.position.set(-42, 90, 0);
      crane.add(counter);
      const hookLine = new THREE.Mesh(boxGeo, craneDark);
      hookLine.scale.set(3, 26, 3);
      hookLine.position.set(95, 76, 0);
      crane.add(hookLine);
      const hook = new THREE.Mesh(boxGeo, craneDark);
      hook.scale.set(10, 8, 10);
      hook.position.set(95, 60, 0);
      crane.add(hook);
      crane.position.set(cx(c.x), 0, cz(c.y));
      crane.rotation.y = rotY(c.angle || 0);
      scene.add(crane);
    }

    // Garages / shops: low sign boxes so the player can spot them in 3D.
    const garageMat = lambert(0xd8b25e);
    for (const g of cityData.garages || []) {
      const sign = new THREE.Mesh(boxGeo, garageMat);
      sign.scale.set(46, 26, 30);
      sign.position.set(cx(g.x), 13, cz(g.y));
      sign.castShadow = true;
      scene.add(sign);
    }
  }

  if (city) buildStatic(city);
  let staticBuilt = !!city;

  // ---- dynamic object factories -----------------------------------------
  const wheelGeo = new THREE.CylinderGeometry(6, 6, 4, 10);
  wheelGeo.rotateX(Math.PI / 2);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x1c1c22 });
  const headlightMat = basic(0xfff6c0);
  const taillightMat = basic(0xff4a3d);
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x14202e });

  function buildCarGroup() {
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0xc0c0c0 });
    const body = new THREE.Mesh(boxGeo, bodyMat);
    body.scale.set(50, 12, 22);
    body.position.y = 9;
    body.castShadow = true;
    group.add(body);
    const cabin = new THREE.Mesh(boxGeo, glassMat);
    cabin.scale.set(20, 9, 16);
    cabin.position.set(-2, 19, 0);
    cabin.castShadow = true;
    group.add(cabin);
    const wheelPos = [[16, 11], [16, -11], [-16, 11], [-16, -11]];
    for (const [wx, wz] of wheelPos) {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.position.set(wx, 6, wz);
      group.add(wheel);
    }
    for (const wz of [-7, 7]) {
      const head = new THREE.Mesh(boxGeo, headlightMat);
      head.scale.set(2, 3, 4);
      head.position.set(25, 9, wz);
      group.add(head);
      const tail = new THREE.Mesh(boxGeo, taillightMat);
      tail.scale.set(2, 3, 4);
      tail.position.set(-25, 9, wz);
      group.add(tail);
    }
    const lightMatL = basic(0xff3b30);
    const lightMatR = basic(0x2f7bff);
    const lightL = new THREE.Mesh(boxGeo, lightMatL);
    lightL.scale.set(7, 4, 5);
    lightL.position.set(-2, 25, -4);
    const lightR = new THREE.Mesh(boxGeo, lightMatR);
    lightR.scale.set(7, 4, 5);
    lightR.position.set(-2, 25, 4);
    lightL.visible = false;
    lightR.visible = false;
    group.add(lightL);
    group.add(lightR);
    group.userData = { bodyMat, body, cabin, lightMatL, lightMatR, lightL, lightR };
    return group;
  }

  function buildFigureGroup(shirtColor) {
    const group = new THREE.Group();
    const figure = new THREE.Group();
    const shirtMat = new THREE.MeshLambertMaterial({ color: shirtColor });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(7, 8, 20, 8), shirtMat);
    body.position.y = 11;
    body.castShadow = true;
    figure.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(5, 8, 6), lambert(0xe8b98a));
    head.position.y = 26;
    head.castShadow = true;
    figure.add(head);
    group.add(figure);
    group.userData = { figure, shirtMat };
    return group;
  }

  function buildPickupGroup() {
    const group = new THREE.Group();
    const cash = new THREE.Mesh(new THREE.CylinderGeometry(11, 11, 4, 12), lambert(0x7be382));
    cash.rotation.x = Math.PI / 2;
    const healthBox = new THREE.Mesh(boxGeo, lambert(0xffffff));
    healthBox.scale.set(20, 20, 6);
    const crossA = new THREE.Mesh(boxGeo, basic(0xe23b3b));
    crossA.scale.set(6, 16, 7);
    const crossB = new THREE.Mesh(boxGeo, basic(0xe23b3b));
    crossB.scale.set(16, 6, 7);
    const ammo = new THREE.Mesh(boxGeo, lambert(0xf2c94c));
    ammo.scale.set(18, 14, 14);
    group.add(cash);
    group.add(healthBox);
    group.add(crossA);
    group.add(crossB);
    group.add(ammo);
    group.userData = { cash, healthBox, crossA, crossB, ammo };
    return group;
  }

  // ---- dynamic pools ------------------------------------------------------
  const carPool = new Map(); // id -> Group
  const pedPool = []; // index -> Group
  const enemyPool = [];
  const bulletPool = [];
  const pickupPool = [];
  const playerGroup = buildFigureGroup(0x1f9d8a);
  scene.add(playerGroup);

  const bulletMat = basic(0xffe9a3);
  const bulletGeo = new THREE.BoxGeometry(18, 2, 2);

  const MAX_PARTICLES = 240;
  const particleMesh = new THREE.InstancedMesh(boxGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }), MAX_PARTICLES);
  particleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  particleMesh.count = 0;
  scene.add(particleMesh);

  // Mission marker: tall light pillar + pulsing ground ring.
  const pillar = new THREE.Mesh(
    new THREE.CylinderGeometry(10, 18, 520, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffcf3f, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false }),
  );
  pillar.position.y = 260;
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(20, 32, 32),
    new THREE.MeshBasicMaterial({ color: 0xffcf3f, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 2;
  const markerGroup = new THREE.Group();
  markerGroup.add(pillar);
  markerGroup.add(ring);
  markerGroup.visible = false;
  scene.add(markerGroup);

  // ---- camera rig ----------------------------------------------------------
  const camEye = new THREE.Vector3(0, 400, 600);
  const camLook = new THREE.Vector3(0, 0, 0);
  let cameraInit = false;

  function updateCamera(state, dt) {
    const player = state.player || {};
    const cam = state.camera || {};
    const driving = !player.onFoot && !!player.car;
    const mode = cam.mode || (driving ? 'chase' : 'follow');
    const dist = cam.dist || (mode === 'high' ? (CFG.highDist || 1100) : mode === 'chase' ? (CFG.chaseDist || 320) : (CFG.followDist || 260));
    const yaw = cam.yaw || 0;
    const heading = player.angle || 0;
    const tx = cx(player.x || HALF_W);
    const tz = cz(player.y || HALF_H);
    const behind = heading + Math.PI + yaw;
    let eyeX = tx;
    let eyeY = 150;
    let eyeZ = tz;
    let lookX = tx;
    let lookY = 14;
    let lookZ = tz;
    let fov = CFG.fov || 55;
    if (mode === 'high') {
      const pitch = ((CFG.highPitchDeg || 57) * Math.PI) / 180;
      const horiz = dist * Math.cos(pitch);
      eyeX = tx + Math.cos(behind) * horiz;
      eyeY = dist * Math.sin(pitch);
      eyeZ = tz + Math.sin(behind) * horiz;
      lookX = tx;
      lookY = 0;
      lookZ = tz;
      fov = CFG.highFov || 50;
    } else if (mode === 'chase') {
      const h = CFG.chaseHeight || 145;
      eyeX = tx + Math.cos(behind) * dist;
      eyeY = h;
      eyeZ = tz + Math.sin(behind) * dist;
      lookX = tx + Math.cos(heading) * 130;
      lookY = 16;
      lookZ = tz + Math.sin(heading) * 130;
      const speed = player.car ? Math.abs(player.car.speed || 0) : 0;
      fov = (CFG.fov || 55) + clamp(speed / 640, 0, 1) * (CFG.fovKick || 12);
    } else {
      const h = CFG.followHeight || 150;
      eyeX = tx + Math.cos(behind) * dist;
      eyeY = h;
      eyeZ = tz + Math.sin(behind) * dist;
      lookX = tx + Math.cos(heading) * 60;
      lookY = 14;
      lookZ = tz + Math.sin(heading) * 60;
    }
    if (!cameraInit || dt <= 0) {
      camEye.set(eyeX, eyeY, eyeZ);
      camLook.set(lookX, lookY, lookZ);
      cameraInit = true;
    } else {
      const k = 1 - Math.exp(-dt * (mode === 'high' ? 3 : 4.5));
      camEye.x += (eyeX - camEye.x) * k;
      camEye.y += (eyeY - camEye.y) * k;
      camEye.z += (eyeZ - camEye.z) * k;
      camLook.x += (lookX - camLook.x) * k;
      camLook.y += (lookY - camLook.y) * k;
      camLook.z += (lookZ - camLook.z) * k;
    }
    camera.position.copy(camEye);
    camera.lookAt(camLook);
    if (Math.abs(camera.fov - fov) > 0.05) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    // The shadow frustum follows the player so nearby shadows stay crisp.
    sun.position.set(tx + sunDir.x * 1600, sunDir.y * 1600, tz + sunDir.z * 1600);
    sun.target.position.set(tx, 0, tz);
    sun.target.updateMatrixWorld();
  }

  // ---- per-frame sync -------------------------------------------------------
  const tmpM4 = new THREE.Matrix4();
  const tmpQ = new THREE.Quaternion();
  const tmpE = new THREE.Euler();
  const tmpV = new THREE.Vector3();
  const tmpS = new THREE.Vector3();
  const tmpC = new THREE.Color();
  const raycaster = new THREE.Raycaster();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hitPoint = new THREE.Vector3();

  function resize() {
    const w = glCanvas.clientWidth || VIEW_W;
    const h = glCanvas.clientHeight || VIEW_H;
    const pr = renderer.getPixelRatio();
    const pw = Math.round(w * pr);
    const ph = Math.round(h * pr);
    const buf = renderer.getDrawingBufferSize(new THREE.Vector2());
    if (buf.x !== pw || buf.y !== ph) renderer.setSize(w, h, false);
    const aspect = w / h;
    if (Math.abs(camera.aspect - aspect) > 0.001) {
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
    }
  }

  function sync(state, dt) {
    if (!staticBuilt && state.city) {
      buildStatic(state.city);
      staticBuilt = true;
    }
    resize();
    const time = state.time || 0;
    const player = state.player || {};

    // Cars, keyed by id so police spawns/despawns don't shuffle appearances.
    const cars = state.cars || [];
    const seenCars = new Set();
    for (const car of cars) {
      let group = carPool.get(car.id);
      if (!group) {
        group = buildCarGroup();
        scene.add(group);
        carPool.set(car.id, group);
      }
      seenCars.add(car.id);
      const len = car.kind === 'truck' ? 62 : car.kind === 'sport' ? 46 : 50;
      const wid = car.kind === 'truck' ? 26 : 22;
      const ud = group.userData;
      ud.body.scale.set(len, 12, wid);
      ud.cabin.scale.set(len * 0.4, 9, wid - 6);
      const isPolice = car.kind === 'police';
      ud.bodyMat.color.set(isPolice ? 0xf2f2f2 : (car.color || '#c0c0c0'));
      ud.lightL.visible = isPolice;
      ud.lightR.visible = isPolice;
      if (isPolice) {
        const redOn = Math.floor(time * 4) % 2 === 0;
        ud.lightMatL.color.set(redOn ? 0xff3b30 : 0x7a1512);
        ud.lightMatR.color.set(redOn ? 0x14386e : 0x2f7bff);
      }
      group.position.set(cx(car.x), 0, cz(car.y));
      group.rotation.y = rotY(car.angle);
      group.visible = true;
    }
    for (const [id, group] of carPool) {
      if (!seenCars.has(id)) {
        scene.remove(group);
        carPool.delete(id);
      }
    }

    // Player figure (hidden while driving or down).
    const blink = Math.floor(time * 10) % 2 === 0 && (player.health || 0) < 30;
    playerGroup.visible = !!player.alive && !!player.onFoot && !blink;
    if (playerGroup.visible) {
      playerGroup.position.set(cx(player.x), 0, cz(player.y));
      playerGroup.rotation.y = rotY(player.angle);
    }

    // Peds.
    const peds = state.peds || [];
    for (let i = 0; i < peds.length; i += 1) {
      const ped = peds[i];
      let group = pedPool[i];
      if (!group) {
        group = buildFigureGroup(0xe8e0d0);
        scene.add(group);
        pedPool[i] = group;
      }
      const shirt = ped.kind === 'cop' ? 0x2f5fd0 : ped.kind === 'gang' ? 0xc0392b : 0xe8e0d0;
      group.userData.shirtMat.color.set(shirt);
      group.position.set(cx(ped.x), 0, cz(ped.y));
      group.rotation.y = rotY(ped.angle);
      group.userData.figure.rotation.x = ped.state === 'down' ? Math.PI / 2 : 0;
      group.visible = true;
    }
    for (let i = peds.length; i < pedPool.length; i += 1) pedPool[i].visible = false;

    // Enemies (red figures with a gun barrel).
    const enemies = state.enemies || [];
    for (let i = 0; i < enemies.length; i += 1) {
      const enemy = enemies[i];
      let group = enemyPool[i];
      if (!group) {
        group = buildFigureGroup(0xc0392b);
        const barrel = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0x22222a }));
        barrel.scale.set(16, 2, 2);
        barrel.position.set(12, 20, 0);
        group.userData.figure.add(barrel);
        scene.add(group);
        enemyPool[i] = group;
      }
      group.position.set(cx(enemy.x), 0, cz(enemy.y));
      group.rotation.y = rotY(enemy.angle);
      group.visible = true;
    }
    for (let i = enemies.length; i < enemyPool.length; i += 1) enemyPool[i].visible = false;

    // Bullets as tracers.
    const bullets = state.bullets || [];
    for (let i = 0; i < bullets.length; i += 1) {
      const b = bullets[i];
      let mesh = bulletPool[i];
      if (!mesh) {
        mesh = new THREE.Mesh(bulletGeo, bulletMat);
        scene.add(mesh);
        bulletPool[i] = mesh;
      }
      // 3D muzzle height from combat.js (z 1.3 on foot, 1.0 from a car seat).
      mesh.position.set(cx(b.x), 12 + (b.z || 0) * 3, cz(b.y));
      mesh.rotation.y = rotY(Math.atan2(b.vy || 0, b.vx || 1));
      mesh.visible = true;
    }
    for (let i = bullets.length; i < bulletPool.length; i += 1) bulletPool[i].visible = false;

    // Particles as small 3D bursts.
    const particles = state.particles || [];
    const pCount = Math.min(particles.length, MAX_PARTICLES);
    for (let i = 0; i < pCount; i += 1) {
      const p = particles[i];
      const s = p.size || 4;
      tmpE.set(0, 0, 0);
      tmpQ.setFromEuler(tmpE);
      // 3D arc height from world.js (z in world units, gravity arc); sparks
      // that never left the ground (z 0) sit at ground level.
      tmpV.set(cx(p.x), (p.z || 0) + s / 2, cz(p.y));
      tmpS.set(s, s, s);
      tmpM4.compose(tmpV, tmpQ, tmpS);
      particleMesh.setMatrixAt(i, tmpM4);
      particleMesh.setColorAt(i, tmpC.set(p.color || '#ffd76a'));
    }
    particleMesh.count = pCount;
    particleMesh.instanceMatrix.needsUpdate = true;
    if (particleMesh.instanceColor) particleMesh.instanceColor.needsUpdate = true;

    // Pickups: floating, spinning markers.
    const pickups = state.pickups || [];
    for (let i = 0; i < pickups.length; i += 1) {
      const p = pickups[i];
      let group = pickupPool[i];
      if (!group) {
        group = buildPickupGroup();
        scene.add(group);
        pickupPool[i] = group;
      }
      const ud = group.userData;
      const isCash = p.kind === 'cash';
      const isHealth = p.kind === 'health';
      ud.cash.visible = isCash;
      ud.healthBox.visible = isHealth;
      ud.crossA.visible = isHealth;
      ud.crossB.visible = isHealth;
      ud.ammo.visible = !isCash && !isHealth;
      group.position.set(cx(p.x), 16 + Math.sin(time * 3 + i) * 3, cz(p.y));
      group.rotation.y = time * 3 + i;
      group.visible = true;
    }
    for (let i = pickups.length; i < pickupPool.length; i += 1) pickupPool[i].visible = false;

    // Mission marker pillar + pulsing ring.
    const mission = state.mission;
    if (mission && mission.marker) {
      markerGroup.visible = true;
      markerGroup.position.set(cx(mission.marker.x), 0, cz(mission.marker.y));
      const pulse = 1 + Math.sin(time * 5) * 0.18;
      ring.scale.set(pulse, pulse, 1);
      pillar.material.opacity = 0.28 + Math.sin(time * 5) * 0.08;
    } else {
      markerGroup.visible = false;
    }

    updateCamera(state, dt || 0);
    renderer.render(scene, camera);
  }

  // Raycast a screen point (CSS pixels relative to the canvas) through the
  // camera onto the ground plane (y = 0); view maps CSS pixels to the
  // 1280x720 logical space the HUD uses.
  function screenToWorld(sx, sy, view) {
    const ratio = (view && view.ratio) || 1;
    const scale = (view && view.scale) || 1;
    const vx = (view && view.x) || 0;
    const vy = (view && view.y) || 0;
    const lx = (sx * ratio - vx) / scale;
    const ly = (sy * ratio - vy) / scale;
    const ndcX = (lx / VIEW_W) * 2 - 1;
    const ndcY = -((ly / VIEW_H) * 2 - 1);
    raycaster.setFromCamera({ x: ndcX, y: ndcY }, camera);
    const hit = raycaster.ray.intersectPlane(groundPlane, hitPoint);
    if (!hit) return { x: HALF_W, y: HALF_H };
    return { x: hitPoint.x + HALF_W, y: hitPoint.z + HALF_H };
  }

  return { sync, screenToWorld, renderer };
}
