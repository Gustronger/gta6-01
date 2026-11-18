// Screenshot scenes behind ?shot=start|cover|chase|mission. Each one starts from a
// fresh world, stages the scene by moving state fields directly (the intended staging
// mechanism), then plays the real rules forward with scripted inputs so traffic, peds,
// police and bullets are mid-motion in the frame. Any unknown name stages 'start'.

import { STEP } from './config.js';
import { SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const LINES = [224, 672, 1120, 1568, 2016, 2464, 2912, 3360, 3808];

function idleInput() {
  return {
    mx: 0, my: 0, accel: 0, steer: 0,
    enter: false, shoot: false, punch: false, confirm: false, pause: false, mute: false,
    mouse: { x: 0, y: 0, down: false },
  };
}

function run(world, seconds, buildInput) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    world.step(STEP, buildInput ? buildInput(world.state, i) : idleInput());
  }
}

// Nearest road-grid intersection to a target point: always on a road by construction.
function nearIntersection(x, y) {
  let bestX = LINES[0];
  let bestY = LINES[0];
  for (const line of LINES) {
    if (Math.abs(line - x) < Math.abs(bestX - x)) bestX = line;
    if (Math.abs(line - y) < Math.abs(bestY - y)) bestY = line;
  }
  return { x: bestX, y: bestY };
}

function setMission(state, index, objective, marker) {
  state.mission = { index, step: 0, objective, marker, timer: 0 };
}

// 3D camera for the shot: locked so world.step() never auto-switches the
// mode away from the staged framing.
function setCamera(state, mode, dist, yaw) {
  state.camera.mode = mode;
  state.camera.dist = dist;
  state.camera.yaw = yaw;
  state.camera.locked = true;
}

/** 'start': six seconds of traffic and peds moving under the title screen. */
function stageStart(world) {
  // High over the city center, title screen.
  setCamera(world.state, 'high', 1300, 0.4);
  run(world, 6);
  return { screen: SCREEN_TITLE, best: 0 };
}

/** 'cover': Milo on foot in Downtown, mission 1 active, traffic and peds around him. */
function stageCover(world) {
  const state = world.state;
  // Elevated wide over Downtown.
  setCamera(state, 'high', 1100, -0.6);
  const spot = nearIntersection(2900, 700);
  state.player.x = spot.x;
  state.player.y = spot.y;
  state.player.angle = Math.PI / 2;
  state.player.onFoot = true;
  state.player.car = null;
  setMission(state, 0, 'Steal a car and drive to Nadia\'s garage', nearIntersection(2912, 1120));
  // Pull a few traffic cars and peds onto the streets around Milo so the frame is busy.
  const cars = state.cars || [];
  const carSpots = [nearIntersection(2464, 672), nearIntersection(3360, 672), nearIntersection(2912, 1120)];
  let placed = 0;
  for (let i = 0; i < cars.length && placed < carSpots.length; i += 1) {
    if (cars[i].kind === 'police') continue;
    cars[i].x = carSpots[placed].x;
    cars[i].y = carSpots[placed].y;
    cars[i].angle = placed % 2 === 0 ? 0 : Math.PI / 2;
    placed += 1;
  }
  const peds = state.peds || [];
  for (let i = 0; i < peds.length && i < 6; i += 1) {
    peds[i].x = spot.x + (i % 3 - 1) * 90;
    peds[i].y = spot.y + (Math.floor(i / 3) - 0.5) * 110;
    peds[i].state = 'walk';
  }
  run(world, 2.5, () => {
    const input = idleInput();
    input.mx = 0;
    input.my = 1; // amble south, down the avenue
    return input;
  });
  // Re-assert the staged scene in case the rules moved it (mission steps, traffic).
  state.player.onFoot = true;
  setMission(state, 0, 'Steal a car and drive to Nadia\'s garage', nearIntersection(2912, 1120));
  return { screen: SCREEN_PLAY, best: Math.round(state.player.cash || 0) };
}

/** 'chase': Milo driving at speed with a 3-star wanted level and police on his tail. */
function stageChase(world) {
  const state = world.state;
  setCamera(state, 'chase', 320, 0);
  const road = nearIntersection(1500, 2016);
  // Find a drivable car; if the fresh world spawned none, build one.
  let car = (state.cars || []).find((c) => c.kind !== 'police');
  if (!car) {
    car = { id: 9001, x: road.x, y: road.y, angle: 0, speed: 0, color: '#d8a13c', kind: 'sport', driver: 'player', hp: 100 };
    state.cars.push(car);
  }
  car.x = road.x;
  car.y = road.y;
  car.angle = 0;
  car.speed = 430;
  car.driver = 'player';
  state.player.x = car.x;
  state.player.y = car.y;
  state.player.angle = 0;
  state.player.onFoot = false;
  state.player.car = car;
  state.player.wanted = 3;
  // Make sure three police cars exist, tucked in behind Milo.
  const police = (state.cars || []).filter((c) => c.kind === 'police');
  for (let i = police.length; i < 3; i += 1) {
    state.cars.push({
      id: 9100 + i, x: road.x - 180 - i * 130, y: road.y + (i % 2 === 0 ? 34 : -34),
      angle: 0, speed: 400, color: '#f2f2f2', kind: 'police', driver: 'police', hp: 100,
    });
  }
  for (const cop of state.cars.filter((c) => c.kind === 'police')) {
    cop.speed = 400;
    cop.driver = 'police';
  }
  run(world, 3, () => {
    const input = idleInput();
    input.accel = 1; // foot down, straight along the avenue
    input.mouse = { x: state.player.x + 400, y: state.player.y, down: false };
    return input;
  });
  // Re-assert the chase in case the rules decayed the heat or slowed the car.
  state.player.wanted = 3;
  if (state.player.car) state.player.car.speed = Math.max(state.player.car.speed || 0, 380);
  return { screen: SCREEN_PLAY, best: Math.round(state.player.cash || 0) };
}

/** 'mission': a firefight at the Docks — Cobras present, muzzle flashes, objective up. */
function stageMission(world) {
  const state = world.state;
  setCamera(state, 'follow', 260, 0);
  const spot = nearIntersection(2900, 3360);
  state.player.x = spot.x;
  state.player.y = spot.y;
  state.player.angle = -Math.PI / 2;
  state.player.onFoot = true;
  state.player.car = null;
  state.player.weapon = 'pistol';
  state.player.ammo = 48;
  state.player.health = 100;
  // Four Cobras holding the dockside, at staggered ranges.
  state.enemies = [];
  const offsets = [[150, -80], [210, 60], [120, 140], [260, -10]];
  for (let i = 0; i < offsets.length; i += 1) {
    state.enemies.push({
      x: spot.x + offsets[i][0], y: spot.y + offsets[i][1],
      angle: Math.PI, hp: 100, weapon: 'pistol', state: 'chase',
    });
  }
  const marker = { x: spot.x + 190, y: spot.y + 30 };
  setMission(state, 2, 'Eliminate 4 Cobras at the Docks', marker);
  run(world, 1.5, () => {
    const input = idleInput();
    // Aim at the nearest living Cobra and hold the trigger.
    let target = null;
    let bestDist = Infinity;
    for (const enemy of state.enemies) {
      const d = (enemy.x - state.player.x) ** 2 + (enemy.y - state.player.y) ** 2;
      if (enemy.hp > 0 && d < bestDist) { bestDist = d; target = enemy; }
    }
    if (target) {
      input.mouse = { x: target.x, y: target.y, down: true };
      input.shoot = true;
    }
    return input;
  });
  // Keep the firefight readable: at least two Cobras still standing, mission still up,
  // and a fresh muzzle flash at Milo's gun so the frame catches the action.
  let alive = state.enemies.filter((e) => e.hp > 0);
  if (alive.length < 2) {
    for (let i = alive.length; i < 2; i += 1) {
      state.enemies.push({
        x: spot.x + 170 + i * 60, y: spot.y - 60 + i * 90,
        angle: Math.PI, hp: 100, weapon: 'pistol', state: 'chase',
      });
    }
    alive = state.enemies.filter((e) => e.hp > 0);
  }
  const first = alive[0];
  if (first) {
    state.particles.push({
      x: state.player.x + Math.cos(state.player.angle) * 22,
      y: state.player.y + Math.sin(state.player.angle) * 22,
      vx: 0, vy: 0, life: 0.25, color: '#ffe9a3', size: 14,
    });
    state.player.angle = Math.atan2(first.y - state.player.y, first.x - state.player.x);
  }
  setMission(state, 2, 'Eliminate 4 Cobras at the Docks', marker);
  return { screen: SCREEN_PLAY, best: Math.round(state.player.cash || 0) };
}

/**
 * Set `world` to the named scene and return the screen to draw over it and the best
 * cash to show. Any name other than cover/chase/mission stages 'start'.
 */
export function stageShot(name, world) {
  world.reset();
  if (name === 'cover') return stageCover(world);
  if (name === 'chase') return stageChase(world);
  if (name === 'mission') return stageMission(world);
  return stageStart(world);
}
