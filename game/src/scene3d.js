import * as THREE from '../vendor/three.min.js';
import { CAMERA3D, PALETTE, WORLD } from './config.js';

function clamp(v, lo, hi) {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

function toThree(x, y, up) {
  return new THREE.Vector3(x, up || 0, -y);
}

function flatMesh(w, d, color, y) {
  const geo = new THREE.PlaneGeometry(w, d);
  const mat = new THREE.MeshLambertMaterial({ color });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(0, y, 0);
  mesh.receiveShadow = true;
  return mesh;
}

export function createScene3D(glCanvas, city) {
  const renderer = new THREE.WebGLRenderer({
    canvas: glCanvas,
    antialias: true,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(glCanvas.clientWidth || 1280, glCanvas.clientHeight || 720, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xd98a6a, CAMERA3D.fogNear, CAMERA3D.fogFar);

  const camera = new THREE.PerspectiveCamera(
    CAMERA3D.fov,
    (glCanvas.clientWidth || 1280) / (glCanvas.clientHeight || 720),
    1,
    14000,
  );

  const hemi = new THREE.HemisphereLight(0xffd9b0, 0x4a3a5a, 0.85);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xffb36b, 1.9);
  sun.castShadow = true;
  sun.shadow.mapSize.set(CAMERA3D.shadow, CAMERA3D.shadow);
  sun.shadow.camera.left = -650;
  sun.shadow.camera.right = 650;
  sun.shadow.camera.top = 650;
  sun.shadow.camera.bottom = -650;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 5000;
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  scene.add(sun.target);

  const sunDir = new THREE.Vector3(-0.55, 0.42, 0.45).normalize();

  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      topColor: { value: new THREE.Color(0x5a3d6e) },
      midColor: { value: new THREE.Color(0xc96a7a) },
      horizonColor: { value: new THREE.Color(0xffb37a) },
      sunDir: { value: sunDir.clone() },
      sunColor: { value: new THREE.Color(0xffe0a0) },
    },
    vertexShader: [
      'varying vec3 vDir;',
      'void main() {',
      '  vDir = normalize(position);',
      '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
      '  gl_Position = projectionMatrix * mv;',
      '}',
    ].join('\n'),
    fragmentShader: [
      'varying vec3 vDir;',
      'uniform vec3 topColor;',
      'uniform vec3 midColor;',
      'uniform vec3 horizonColor;',
      'uniform vec3 sunDir;',
      'uniform vec3 sunColor;',
      'void main() {',
      '  float h = clamp(vDir.y, -1.0, 1.0);',
      '  vec3 col = mix(horizonColor, midColor, smoothstep(0.0, 0.28, h));',
      '  col = mix(col, topColor, smoothstep(0.25, 0.75, h));',
      '  col = mix(vec3(0.55, 0.32, 0.30), col, smoothstep(-0.25, 0.02, h));',
      '  float g = pow(max(dot(normalize(vDir), normalize(sunDir)), 0.0), 18.0);',
      '  float halo = pow(max(dot(normalize(vDir), normalize(sunDir)), 0.0), 4.0);',
      '  col += sunColor * (g * 0.9 + halo * 0.25);',
      '  gl_FragColor = vec4(col, 1.0);',
      '}',
    ].join('\n'),
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(9500, 32, 18), skyMat);
  scene.add(sky);

  const ground = flatMesh(WORLD.width + 400, WORLD.height + 400, PALETTE.grass, -0.15);
  ground.position.set(WORLD.width / 2, -0.15, -WORLD.height / 2);
  scene.add(ground);

  const sidewalkMat = new THREE.MeshLambertMaterial({ color: PALETTE.sidewalk });
  const roadMat = new THREE.MeshLambertMaterial({ color: PALETTE.road });
  for (const line of city.lines) {
    const walkV = new THREE.Mesh(new THREE.PlaneGeometry(124, WORLD.height), sidewalkMat);
    walkV.rotation.x = -Math.PI / 2;
    walkV.position.set(line, 0.02, -WORLD.height / 2);
    walkV.receiveShadow = true;
    scene.add(walkV);
    const roadV = new THREE.Mesh(new THREE.PlaneGeometry(88, WORLD.height), roadMat);
    roadV.rotation.x = -Math.PI / 2;
    roadV.position.set(line, 0.05, -WORLD.height / 2);
    roadV.receiveShadow = true;
    scene.add(roadV);
    const walkH = new THREE.Mesh(new THREE.PlaneGeometry(WORLD.width, 124), sidewalkMat);
    walkH.rotation.x = -Math.PI / 2;
    walkH.position.set(WORLD.width / 2, 0.02, -line);
    walkH.receiveShadow = true;
    scene.add(walkH);
    const roadH = new THREE.Mesh(new THREE.PlaneGeometry(WORLD.width, 88), roadMat);
    roadH.rotation.x = -Math.PI / 2;
    roadH.position.set(WORLD.width / 2, 0.05, -line);
    roadH.receiveShadow = true;
    scene.add(roadH);
  }

  const dashGeo = new THREE.BoxGeometry(30, 0.3, 5);
  const dashMat = new THREE.MeshBasicMaterial({ color: PALETTE.roadLine });
  const dashPerRoad = Math.floor(WORLD.width / 95);
  const dashMesh = new THREE.InstancedMesh(dashGeo, dashMat, dashPerRoad * city.lines.length * 2);
  {
    const dummy = new THREE.Object3D();
    let di = 0;
    for (const line of city.lines) {
      for (let i = 0; i < dashPerRoad; i++) {
        const along = 50 + i * 95;
        dummy.position.set(along, 0.12, -line);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        dashMesh.setMatrixAt(di++, dummy.matrix);
        dummy.position.set(line, 0.12, -along);
        dummy.rotation.set(0, Math.PI / 2, 0);
        dummy.updateMatrix();
        dashMesh.setMatrixAt(di++, dummy.matrix);
      }
    }
    dashMesh.count = di;
    dashMesh.instanceMatrix.needsUpdate = true;
  }
  scene.add(dashMesh);

  const beach = flatMesh(WORLD.width, WORLD.height - city.beach.y0, PALETTE.beach, 0.08);
  beach.position.set(WORLD.width / 2, 0.08, -(city.beach.y0 + (WORLD.height - city.beach.y0) / 2));
  scene.add(beach);

  const ocean = flatMesh(16000, 5200, PALETTE.ocean, -0.3);
  ocean.position.set(WORLD.width / 2, -0.3, -(WORLD.height + 2600));
  scene.add(ocean);

  const parkMat = new THREE.MeshLambertMaterial({ color: PALETTE.park });
  for (const p of city.parks) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(p.w, p.h), parkMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(p.x + p.w / 2, 0.1, -(p.y + p.h / 2));
    m.receiveShadow = true;
    scene.add(m);
  }

  const dummy = new THREE.Object3D();
  const bodyGeo = new THREE.BoxGeometry(1, 1, 1);
  bodyGeo.translate(0, 0.5, 0);
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const bodies = new THREE.InstancedMesh(bodyGeo, bodyMat, Math.max(1, city.buildings.length));
  const roofGeo = new THREE.BoxGeometry(1, 1, 1);
  roofGeo.translate(0, 0.5, 0);
  const roofMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const roofs = new THREE.InstancedMesh(roofGeo, roofMat, Math.max(1, city.buildings.length));
  const tmpColor = new THREE.Color();
  city.buildings.forEach((b, i) => {
    dummy.position.set(b.x + b.w / 2, 0, -(b.y + b.h / 2));
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(b.w, b.height, b.h);
    dummy.updateMatrix();
    bodies.setMatrixAt(i, dummy.matrix);
    bodies.setColorAt(i, tmpColor.set(b.color));
    dummy.position.set(b.x + b.w / 2 - 3, b.height, -(b.y + b.h / 2));
    dummy.scale.set(b.w + 6, 3, b.h + 6);
    dummy.updateMatrix();
    roofs.setMatrixAt(i, dummy.matrix);
    roofs.setColorAt(i, tmpColor.set(b.roof));
  });
  bodies.instanceMatrix.needsUpdate = true;
  roofs.instanceMatrix.needsUpdate = true;
  if (bodies.instanceColor) bodies.instanceColor.needsUpdate = true;
  if (roofs.instanceColor) roofs.instanceColor.needsUpdate = true;
  bodies.castShadow = true;
  bodies.receiveShadow = true;
  roofs.castShadow = true;
  scene.add(bodies);
  scene.add(roofs);

  const trunkGeo = new THREE.CylinderGeometry(2, 3, 14, 6);
  trunkGeo.translate(0, 7, 0);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6a4a2a });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, Math.max(1, city.trees.length));
  const canopyGeo = new THREE.SphereGeometry(11, 8, 6);
  const canopyMat = new THREE.MeshLambertMaterial({ color: 0x3f8a3a });
  const canopies = new THREE.InstancedMesh(canopyGeo, canopyMat, Math.max(1, city.trees.length));
  city.trees.forEach((t, i) => {
    dummy.position.set(t.x, 0, -t.y);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);
    dummy.position.set(t.x, 20, -t.y);
    dummy.updateMatrix();
    canopies.setMatrixAt(i, dummy.matrix);
  });
  trunks.instanceMatrix.needsUpdate = true;
  canopies.instanceMatrix.needsUpdate = true;
  trunks.castShadow = true;
  canopies.castShadow = true;
  scene.add(trunks);
  scene.add(canopies);

  const poleGeo = new THREE.CylinderGeometry(1.5, 1.5, 26, 6);
  poleGeo.translate(0, 13, 0);
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x3a3a44 });
  const poles = new THREE.InstancedMesh(poleGeo, poleMat, Math.max(1, city.lamps.length));
  const lampHeadGeo = new THREE.SphereGeometry(3, 8, 6);
  const lampHeadMat = new THREE.MeshBasicMaterial({ color: 0xffe8a0 });
  const lampHeads = new THREE.InstancedMesh(lampHeadGeo, lampHeadMat, Math.max(1, city.lamps.length));
  city.lamps.forEach((l, i) => {
    dummy.position.set(l.x, 0, -l.y);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    poles.setMatrixAt(i, dummy.matrix);
    dummy.position.set(l.x, 27, -l.y);
    dummy.updateMatrix();
    lampHeads.setMatrixAt(i, dummy.matrix);
  });
  poles.instanceMatrix.needsUpdate = true;
  lampHeads.instanceMatrix.needsUpdate = true;
  scene.add(poles);
  scene.add(lampHeads);

  const craneMat = new THREE.MeshLambertMaterial({ color: 0xc86828 });
  const craneDark = new THREE.MeshLambertMaterial({ color: 0x4a3a30 });
  const cranes = [];
  for (const c of city.cranes) {
    const g = new THREE.Group();
    const mast = new THREE.Mesh(new THREE.BoxGeometry(10, 150, 10), craneMat);
    mast.position.y = 75;
    mast.castShadow = true;
    g.add(mast);
    const jib = new THREE.Mesh(new THREE.BoxGeometry(150, 7, 7), craneMat);
    jib.position.set(60, 148, 0);
    jib.castShadow = true;
    g.add(jib);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(48, 7, 7), craneDark);
    tail.position.set(-38, 148, 0);
    g.add(tail);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(16, 12, 14), craneDark);
    cab.position.set(0, 140, 0);
    g.add(cab);
    const hook = new THREE.Mesh(new THREE.BoxGeometry(2, 46, 2), craneDark);
    hook.position.set(118, 122, 0);
    g.add(hook);
    const block = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), craneMat);
    block.position.set(118, 96, 0);
    g.add(block);
    g.position.set(c.x, 0, -c.y);
    g.rotation.y = c.angle;
    scene.add(g);
    cranes.push(g);
  }

  function makeCar() {
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0xc0c0c0 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(54, 11, 26), bodyMat);
    body.position.y = 8;
    body.castShadow = true;
    g.add(body);
    const cabinMat = new THREE.MeshLambertMaterial({ color: 0x2a3540 });
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(28, 9, 22), cabinMat);
    cabin.position.set(-3, 17, 0);
    cabin.castShadow = true;
    g.add(cabin);
    const wheelGeo = new THREE.CylinderGeometry(6.5, 6.5, 5, 10);
    const wheelMat = new THREE.MeshLambertMaterial({ color: 0x14141a });
    const wheels = [];
    for (const [wx, wz] of [[18, 13], [18, -13], [-18, 13], [-18, -13]]) {
      const w = new THREE.Mesh(wheelGeo, wheelMat);
      w.rotation.x = Math.PI / 2;
      w.position.set(wx, 6.5, wz);
      g.add(w);
      wheels.push(w);
    }
    const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
    for (const wz of [9, -9]) {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(2, 3, 5), lightMat);
      hl.position.set(27.5, 8, wz);
      g.add(hl);
    }
    const redMat = new THREE.MeshBasicMaterial({ color: 0xff2020 });
    const blueMat = new THREE.MeshBasicMaterial({ color: 0x2040ff });
    const red = new THREE.Mesh(new THREE.BoxGeometry(10, 3, 6), redMat);
    red.position.set(-3, 23, -6);
    red.visible = false;
    g.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(10, 3, 6), blueMat);
    blue.position.set(-3, 23, 6);
    blue.visible = false;
    g.add(blue);
    g.userData = { bodyMat, red, blue, wheels };
    scene.add(g);
    return g;
  }

  function makeFigure() {
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0xd0c0a0 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(7, 15, 4, 8), bodyMat);
    body.position.y = 15;
    body.castShadow = true;
    g.add(body);
    const headMat = new THREE.MeshLambertMaterial({ color: 0xe8b88a });
    const head = new THREE.Mesh(new THREE.SphereGeometry(5.5, 10, 8), headMat);
    head.position.y = 31;
    head.castShadow = true;
    g.add(head);
    g.userData = { bodyMat };
    scene.add(g);
    return g;
  }

  const carPool = [];
  for (let i = 0; i < 36; i++) {
    const c = makeCar();
    c.visible = false;
    carPool.push(c);
  }
  const pedPool = [];
  for (let i = 0; i < 48; i++) {
    const f = makeFigure();
    f.visible = false;
    pedPool.push(f);
  }
  const enemyPool = [];
  for (let i = 0; i < 16; i++) {
    const f = makeFigure();
    f.visible = false;
    enemyPool.push(f);
  }
  const bulletPool = [];
  const bulletGeo = new THREE.BoxGeometry(22, 1.6, 1.6);
  for (let i = 0; i < 64; i++) {
    const m = new THREE.Mesh(bulletGeo, new THREE.MeshBasicMaterial({ color: 0xffe89a }));
    m.visible = false;
    scene.add(m);
    bulletPool.push(m);
  }
  const particlePool = [];
  const particleGeo = new THREE.BoxGeometry(1, 1, 1);
  for (let i = 0; i < 128; i++) {
    const m = new THREE.Mesh(particleGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
    m.visible = false;
    scene.add(m);
    particlePool.push(m);
  }
  const pickupPool = [];
  const pickupGeo = new THREE.BoxGeometry(15, 15, 15);
  for (let i = 0; i < 24; i++) {
    const m = new THREE.Mesh(pickupGeo, new THREE.MeshLambertMaterial({ color: 0x3fae4a, emissive: 0x1a5a20 }));
    m.visible = false;
    m.castShadow = true;
    scene.add(m);
    pickupPool.push(m);
  }

  const beaconGroup = new THREE.Group();
  const pillarMat = new THREE.MeshBasicMaterial({
    color: PALETTE.accent,
    transparent: true,
    opacity: 0.32,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(16, 16, 320, 20, 1, true), pillarMat);
  pillar.position.y = 160;
  beaconGroup.add(pillar);
  const ringMat = new THREE.MeshBasicMaterial({
    color: PALETTE.accent,
    transparent: true,
    opacity: 0.85,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(30, 42, 40), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.4;
  beaconGroup.add(ring);
  beaconGroup.visible = false;
  scene.add(beaconGroup);

  const raycaster = new THREE.Raycaster();
  let lastFocus = { x: WORLD.width / 2, y: WORLD.height / 2 };

  function sync(state) {
    const t = state.time || 0;
    const player = state.player || { x: 2048, y: 2048, angle: 0, speed: 0 };
    const camCfg = state.camera || {};
    const mode = camCfg.mode || 'follow';
    const tx = camCfg.x !== undefined ? camCfg.x : player.x;
    const ty = camCfg.y !== undefined ? camCfg.y : player.y;
    lastFocus = { x: tx, y: ty };

    const w = glCanvas.clientWidth || 1280;
    const h = glCanvas.clientHeight || 720;
    if (renderer.domElement.width !== Math.floor(w * renderer.getPixelRatio()) || camera.aspect !== w / h) {
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }

    let driveAngle = player.angle || 0;
    let driveSpeed = Math.abs(player.speed || 0);
    const cars = state.cars || [];
    if (player.car !== undefined && player.car !== null) {
      const pc = cars.find((c) => c === player.car || c.id === player.car);
      if (pc) {
        driveAngle = pc.angle || driveAngle;
        driveSpeed = Math.abs(pc.speed || 0);
      }
    }

    let dist = camCfg.dist;
    if (mode === 'chase') {
      if (!dist) dist = CAMERA3D.chase.dist;
      const a = driveAngle;
      const fx = Math.cos(a);
      const fy = Math.sin(a);
      camera.position.set(tx - fx * dist, CAMERA3D.chase.height, -(ty - fy * dist));
      camera.lookAt(toThree(tx, ty, 14));
      const wantFov = CAMERA3D.fov + CAMERA3D.fovKick * clamp(driveSpeed / 520, 0, 1);
      if (Math.abs(camera.fov - wantFov) > 0.05) {
        camera.fov = wantFov;
        camera.updateProjectionMatrix();
      }
    } else if (mode === 'high') {
      if (!dist) dist = CAMERA3D.high.dist;
      const ang = (CAMERA3D.high.angle * Math.PI) / 180;
      const horiz = dist * Math.cos(ang);
      const height = dist * Math.sin(ang);
      const yaw = camCfg.yaw !== undefined ? camCfg.yaw : 0;
      camera.position.set(tx + Math.cos(yaw) * horiz, height, -(ty + Math.sin(yaw) * horiz));
      camera.lookAt(toThree(tx, ty, 0));
      if (Math.abs(camera.fov - CAMERA3D.fov) > 0.05) {
        camera.fov = CAMERA3D.fov;
        camera.updateProjectionMatrix();
      }
    } else {
      if (!dist) dist = CAMERA3D.follow.dist;
      const a = camCfg.locked && camCfg.yaw !== undefined ? camCfg.yaw : (player.angle || 0);
      const fx = Math.cos(a);
      const fy = Math.sin(a);
      camera.position.set(tx - fx * dist, CAMERA3D.follow.height, -(ty - fy * dist));
      camera.lookAt(toThree(tx, ty, 12));
      if (Math.abs(camera.fov - CAMERA3D.fov) > 0.05) {
        camera.fov = CAMERA3D.fov;
        camera.updateProjectionMatrix();
      }
    }

    const focusThree = toThree(player.x, player.y, 0);
    sun.position.copy(focusThree).addScaledVector(sunDir, 1500);
    sun.target.position.copy(focusThree);
    sun.target.updateMatrixWorld();
    sky.position.set(camera.position.x, 0, camera.position.z);

    for (let i = 0; i < carPool.length; i++) {
      const g = carPool[i];
      if (i >= cars.length) {
        g.visible = false;
        continue;
      }
      const c = cars[i];
      g.visible = true;
      g.position.set(c.x, 0, -c.y);
      g.rotation.set(0, c.angle || 0, 0);
      g.userData.bodyMat.color.set(c.color || '#c0c0c0');
      if (c.kind === 'police') {
        const phase = Math.floor(t * 5) % 2;
        g.userData.red.visible = phase === 0;
        g.userData.blue.visible = phase === 1;
      } else {
        g.userData.red.visible = false;
        g.userData.blue.visible = false;
      }
    }

    const peds = state.peds || [];
    const pedColors = { cop: '#2a3a6a', gang: '#7a2020', taxi: '#e8c020', walker: '#d0c0a0' };
    for (let i = 0; i < pedPool.length; i++) {
      const g = pedPool[i];
      if (i >= peds.length) {
        g.visible = false;
        continue;
      }
      const p = peds[i];
      g.visible = true;
      g.position.set(p.x, 0, -p.y);
      if (p.state === 'down') g.rotation.set(Math.PI / 2, p.angle || 0, 0);
      else g.rotation.set(0, p.angle || 0, 0);
      g.userData.bodyMat.color.set(pedColors[p.kind] || '#d0c0a0');
    }

    const enemies = state.enemies || [];
    for (let i = 0; i < enemyPool.length; i++) {
      const g = enemyPool[i];
      if (i >= enemies.length) {
        g.visible = false;
        continue;
      }
      const e = enemies[i];
      g.visible = true;
      g.position.set(e.x, 0, -e.y);
      g.rotation.set(0, e.angle || 0, 0);
      g.userData.bodyMat.color.set('#8a1a1a');
    }

    const bullets = state.bullets || [];
    for (let i = 0; i < bulletPool.length; i++) {
      const m = bulletPool[i];
      if (i >= bullets.length) {
        m.visible = false;
        continue;
      }
      const b = bullets[i];
      m.visible = true;
      m.position.set(b.x, b.z !== undefined ? b.z : 1.3, -b.y);
      m.rotation.set(0, Math.atan2(b.vy || 0, b.vx || 1), 0);
    }

    const particles = state.particles || [];
    for (let i = 0; i < particlePool.length; i++) {
      const m = particlePool[i];
      if (i >= particles.length || (particles[i].life !== undefined && particles[i].life <= 0)) {
        m.visible = false;
        continue;
      }
      const p = particles[i];
      m.visible = true;
      m.position.set(p.x, p.z !== undefined ? p.z : 1, -p.y);
      const s = p.size || 4;
      m.scale.set(s, s, s);
      m.material.color.set(p.color || '#ffffff');
    }

    const pickups = state.pickups || [];
    const pickupColors = { cash: '#3fae4a', health: '#f0f0f0', ammo: '#f5c542' };
    for (let i = 0; i < pickupPool.length; i++) {
      const m = pickupPool[i];
      if (i >= pickups.length) {
        m.visible = false;
        continue;
      }
      const p = pickups[i];
      m.visible = true;
      m.position.set(p.x, 3 + Math.sin(t * 3 + i) * 0.8, -p.y);
      m.rotation.y = t * 2.5 + i * 0.7;
      m.material.color.set(pickupColors[p.kind] || '#3fae4a');
    }

    const marker = state.mission && state.mission.marker;
    if (marker) {
      beaconGroup.visible = true;
      beaconGroup.position.set(marker.x, 0, -marker.y);
      const pulse = 1 + 0.18 * Math.sin(t * 4);
      ring.scale.set(pulse, pulse, pulse);
      pillarMat.opacity = 0.3 + 0.1 * Math.sin(t * 3);
      ringMat.opacity = 0.7 + 0.2 * Math.sin(t * 4);
    } else {
      beaconGroup.visible = false;
    }

    renderer.render(scene, camera);
  }

  function screenToWorld(sx, sy) {
    const rect = glCanvas.getBoundingClientRect();
    const w = rect.width || glCanvas.clientWidth || 1280;
    const h = rect.height || glCanvas.clientHeight || 720;
    const ndc = new THREE.Vector2((sx / w) * 2 - 1, -(sy / h) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const origin = raycaster.ray.origin;
    const dir = raycaster.ray.direction;
    if (dir.y >= -0.0001) return { x: lastFocus.x, y: lastFocus.y };
    const s = -origin.y / dir.y;
    const px = origin.x + dir.x * s;
    const pz = origin.z + dir.z * s;
    return { x: px, y: -pz };
  }

  return { sync, screenToWorld, renderer };
}
