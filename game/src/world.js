// world.js — the living city simulation for VELMORA: Sunset Streets.
// Owns the player (on foot / driving), traffic, pedestrians, police,
// wanted level, pickups, the taxi side job, shops, garages and the camera.
// One fixed step per call; deterministic — only the seeded RNG is used.

import {
  WORLD,
  PLAYER,
  CAR,
  TRAFFIC,
  PED,
  POLICE,
  WANTED,
  WEAPONS,
  PRICES,
  CAMERA3D,
  EVENT_SHOT,
  EVENT_PUNCH,
  EVENT_PICKUP,
  EVENT_CRASH,
  EVENT_WANTED_UP,
  EVENT_WANTED_DOWN,
  EVENT_MISSION,
  EVENT_BUSTED,
  EVENT_WASTED,
  EVENT_STEAL,
  EVENT_HIT,
} from './config.js';
import { MISSIONS, startMission, updateMission } from './missions.js';
import { fireWeapon, stepBullets, punchAttack } from './combat.js';
import { randomRoadPoint } from './city.js';

const TAU = Math.PI * 2;

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

function angleTo(ax, ay, bx, by) {
  return Math.atan2(by - ay, bx - ax);
}

function pointInBuilding(buildings, x, y) {
  for (const b of buildings) {
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return true;
  }
  return false;
}

// Push a circle out of every building footprint it overlaps.
// Returns true when a wall was hit.
function resolveBuildings(buildings, obj, radius) {
  let hit = false;
  for (const b of buildings) {
    const cx = clamp(obj.x, b.x, b.x + b.w);
    const cy = clamp(obj.y, b.y, b.y + b.h);
    const dx = obj.x - cx;
    const dy = obj.y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 >= radius * radius) continue;
    hit = true;
    if (d2 > 0.0001) {
      const d = Math.sqrt(d2);
      obj.x = cx + (dx / d) * radius;
      obj.y = cy + (dy / d) * radius;
    } else {
      // Centre inside the rect: shove out along the shallowest side.
      const left = obj.x - b.x;
      const right = b.x + b.w - obj.x;
      const top = obj.y - b.y;
      const bottom = b.y + b.h - obj.y;
      const m = Math.min(left, right, top, bottom);
      if (m === left) obj.x = b.x - radius;
      else if (m === right) obj.x = b.x + b.w + radius;
      else if (m === top) obj.y = b.y - radius;
      else obj.y = b.y + b.h + radius;
    }
  }
  return hit;
}

const CAR_COLORS = ['#d64541', '#2e86c1', '#f4d03f', '#7d3c98', '#16a085', '#e67e22', '#ecf0f1', '#2c3e50'];

export function createWorld(random, city) {
  const rng = random;
  let nextPoliceId = 5000;
  let current = buildState();

  function buildState() {
    const state = {
      time: 0,
      city,
      player: {
        x: city.spawns.player.x,
        y: city.spawns.player.y,
        angle: -Math.PI / 2,
        speed: 0,
        onFoot: true,
        health: PLAYER.health,
        cash: 150,
        weapon: 'fists',
        ammo: 0,
        wanted: 0,
        car: null,
        alive: true,
      },
      cars: [],
      peds: [],
      enemies: [],
      bullets: [],
      particles: [],
      pickups: [],
      mission: { index: -1, step: 0, objective: '', marker: null, timer: 0, progress: 0, spawned: false, steps: [] },
      stats: { kills: 0, carsStolen: 0, missionsDone: 0, cashEarned: 0 },
      camera: {
        x: city.spawns.player.x,
        y: city.spawns.player.y,
        mode: 'follow',
        dist: CAMERA3D.follow.dist,
        yaw: 0,
        locked: false,
      },
      taxi: null,
      lastCrime: -999,
      lastShotCrime: -999,
      lastPunchCrime: -999,
      decayTimer: 0,
      respawnTimer: 0,
      sprayTimer: 0,
      doneTimer: 0,
    };

    // Parked cars at the city's spawn points, plus one gold sport car —
    // the Aurora GT for mission 5 — parked in Downtown.
    let id = 0;
    for (const s of city.spawns.cars || []) {
      state.cars.push({
        id: id++,
        x: s.x,
        y: s.y,
        angle: s.angle || 0,
        speed: 0,
        color: CAR_COLORS[id % CAR_COLORS.length],
        kind: 'sedan',
        driver: 'parked',
        hp: 100,
      });
    }
    state.cars.push({
      id: id++,
      x: 3072,
      y: 1120,
      angle: 0,
      speed: 0,
      color: '#d4af37',
      kind: 'sport',
      driver: 'parked',
      hp: 100,
    });

    // Traffic: cars rolling along the road grid.
    for (let i = 0; i < TRAFFIC.count; i++) {
      const rp = randomRoadPoint(city, rng);
      const taxi = rng.next() < 0.18;
      state.cars.push({
        id: id++,
        x: rp.x,
        y: rp.y,
        angle: rp.axis === 'x' ? (rp.dir > 0 ? 0 : Math.PI) : (rp.dir > 0 ? Math.PI / 2 : -Math.PI / 2),
        speed: TRAFFIC.speedMin + rng.next() * (TRAFFIC.speedMax - TRAFFIC.speedMin),
        color: taxi ? '#f4d03f' : CAR_COLORS[Math.floor(rng.next() * CAR_COLORS.length)],
        kind: taxi ? 'taxi' : (rng.next() < 0.15 ? 'truck' : (rng.next() < 0.25 ? 'sport' : 'sedan')),
        driver: 'traffic',
        hp: 100,
        axis: rp.axis,
        line: rp.line,
        dir: rp.dir,
      });
    }

    // Pedestrians on the sidewalks; one in eight is a waiting taxi fare.
    for (let i = 0; i < PED.count; i++) {
      const rp = randomRoadPoint(city, rng);
      const isTaxi = rng.next() < 0.14;
      state.peds.push({
        x: rp.x + (rng.next() - 0.5) * 60,
        y: rp.y + (rng.next() - 0.5) * 60,
        angle: rng.next() * TAU,
        speed: PED.walkSpeed * (0.7 + rng.next() * 0.6),
        kind: isTaxi ? 'taxi' : 'walker',
        state: 'walk',
        hp: 40,
        turnTimer: 2 + rng.next() * 4,
        punchTimer: 0,
      });
    }

    // Cash stashes tucked around parks and roadsides, plus health and ammo.
    for (let i = 0; i < 8; i++) {
      const spot = stashSpot();
      state.pickups.push({ x: spot.x, y: spot.y, kind: 'cash', amount: 100 + rng.int(0, 3) * 100 });
    }
    for (let i = 0; i < 3; i++) {
      const spot = stashSpot();
      state.pickups.push({ x: spot.x, y: spot.y, kind: 'health' });
    }
    for (let i = 0; i < 3; i++) {
      const spot = stashSpot();
      state.pickups.push({ x: spot.x, y: spot.y, kind: 'ammo' });
    }

    startMission(state, 0);
    return state;
  }

  function stashSpot() {
    if (city.parks && city.parks.length && rng.next() < 0.5) {
      const park = rng.pick(city.parks);
      return {
        x: park.x + rng.next() * park.w,
        y: park.y + rng.next() * park.h,
      };
    }
    const rp = randomRoadPoint(city, rng);
    return { x: rp.x + (rng.next() - 0.5) * 70, y: rp.y + (rng.next() - 0.5) * 70 };
  }

  function commitCrime(state) {
    state.lastCrime = state.time;
    state.decayTimer = 0;
  }

  function raiseWanted(state, amount) {
    if (state.player.wanted >= WANTED.max) return 0;
    state.player.wanted = Math.min(WANTED.max, state.player.wanted + amount);
    commitCrime(state);
    return EVENT_WANTED_UP;
  }

  function nearestCar(state, x, y, maxD) {
    let best = null;
    let bestD = maxD;
    for (const car of state.cars) {
      const d = dist(x, y, car.x, car.y);
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    }
    return best;
  }

  function nearestShop(state, x, y, maxD) {
    let best = null;
    let bestD = maxD;
    for (const shop of state.city.shops || []) {
      const d = dist(x, y, shop.x, shop.y);
      if (d < bestD) {
        bestD = d;
        best = shop;
      }
    }
    for (const g of state.city.garages || []) {
      if (g.kind !== 'arms') continue;
      const d = dist(x, y, g.x, g.y);
      if (d < bestD) {
        bestD = d;
        best = g;
      }
    }
    return best;
  }

  function burst(state, x, y, color, count) {
    for (let i = 0; i < count; i++) {
      const a = rng.next() * TAU;
      state.particles.push({
        x, y, z: 1,
        vx: Math.cos(a) * 160,
        vy: Math.sin(a) * 160,
        vz: 140 + rng.next() * 160,
        life: 0.5 + rng.next() * 0.3,
        color,
        size: 3 + rng.next() * 3,
      });
    }
  }

  function stepPlayer(state, dt, input) {
    const p = state.player;
    if (!p.alive) return 0;
    let flags = 0;
    const buildings = state.city.buildings;

    if (p.onFoot) {
      const len = Math.hypot(input.mx, input.my);
      if (len > 0.01) {
        const nx = input.mx / Math.max(1, len);
        const ny = input.my / Math.max(1, len);
        p.x += nx * PLAYER.walkSpeed * dt;
        p.y += ny * PLAYER.walkSpeed * dt;
        p.speed = PLAYER.walkSpeed;
      } else {
        p.speed = 0;
      }
      // Aim at the mouse; fall back to the movement direction.
      const mdx = input.mouse.x - p.x;
      const mdy = input.mouse.y - p.y;
      if (Math.hypot(mdx, mdy) > 24) p.angle = Math.atan2(mdy, mdx);
      else if (len > 0.01) p.angle = Math.atan2(input.my, input.mx);
      resolveBuildings(buildings, p, PLAYER.radius);
      p.x = clamp(p.x, 20, WORLD.width - 20);
      p.y = clamp(p.y, 20, WORLD.height - 20);

      if (input.enter) {
        const shop = nearestShop(state, p.x, p.y, 95);
        if (shop) {
          flags |= buyFromShop(state);
        } else {
          const car = nearestCar(state, p.x, p.y, 64);
          if (car) flags |= enterCar(state, car);
        }
      }
      if (input.shoot && p.weapon !== 'fists') {
        const aim = Math.atan2(input.mouse.y - p.y, input.mouse.x - p.x);
        if (fireWeapon(state, p.x, p.y, aim)) {
          flags |= EVENT_SHOT;
          if (state.time - state.lastShotCrime > 4) {
            state.lastShotCrime = state.time;
            flags |= raiseWanted(state, 1);
          }
        }
      }
      if (input.punch) {
        if (punchAttack(state, p.x, p.y, p.angle)) {
          flags |= EVENT_PUNCH;
          if (state.time - state.lastPunchCrime > 3) {
            state.lastPunchCrime = state.time;
            flags |= raiseWanted(state, 1);
          }
        }
      }
    } else if (p.car) {
      const car = p.car;
      const wasSpeed = car.speed;
      if (input.accel > 0) {
        car.speed += CAR.accel * dt;
      } else if (input.accel < 0) {
        if (car.speed > 5) car.speed -= CAR.brake * dt;
        else car.speed -= CAR.accel * 0.5 * dt;
      } else {
        car.speed -= car.speed * 0.6 * dt;
      }
      car.speed = clamp(car.speed, -CAR.reverseMax, CAR.maxSpeed);
      const steerAuthority = clamp(Math.abs(car.speed) / 200, 0, 1);
      car.angle += input.steer * CAR.turn * steerAuthority * dt * (car.speed < 0 ? -1 : 1);
      car.x += Math.cos(car.angle) * car.speed * dt;
      car.y += Math.sin(car.angle) * car.speed * dt;
      car.x = clamp(car.x, 30, WORLD.width - 30);
      car.y = clamp(car.y, 30, WORLD.height - 30);
      const crashed = resolveBuildings(buildings, car, CAR.radius);
      if (crashed && Math.abs(wasSpeed) > 240) {
        p.health -= 12;
        burst(state, car.x, car.y, '#f39c12', 10);
        flags |= EVENT_CRASH;
        car.speed *= -0.25;
        commitCrime(state);
      }
      p.x = car.x;
      p.y = car.y;
      p.angle = car.angle;
      p.speed = Math.abs(car.speed);

      if (input.enter) flags |= exitCar(state);
      if (input.shoot && p.weapon !== 'fists') {
        const aim = Math.atan2(input.mouse.y - p.y, input.mouse.x - p.x);
        if (fireWeapon(state, p.x, p.y, aim)) {
          flags |= EVENT_SHOT;
          if (state.time - state.lastShotCrime > 4) {
            state.lastShotCrime = state.time;
            flags |= raiseWanted(state, 1);
          }
        }
      }
      // Running a pedestrian over is a crime.
      for (const ped of state.peds) {
        if (ped.state === 'down') continue;
        if (dist(p.x, p.y, ped.x, ped.y) < CAR.radius + 14 && Math.abs(car.speed) > 150) {
          ped.hp = 0;
          ped.state = 'down';
          state.stats.kills += 1;
          burst(state, ped.x, ped.y, '#c0392b', 8);
          flags |= EVENT_HIT;
          flags |= raiseWanted(state, 1);
        }
      }
      // Pay-n-Spray: drive in with heat, drive out clean.
      if (state.sprayTimer <= 0) {
        for (const g of state.city.garages || []) {
          if (g.kind !== 'spray') continue;
          if (dist(car.x, car.y, g.x, g.y) < 80 && p.wanted > 0 && p.cash >= PRICES.spray) {
            p.cash -= PRICES.spray;
            p.wanted = 0;
            state.sprayTimer = 5;
            burst(state, car.x, car.y, '#2ecc71', 12);
            flags |= EVENT_PICKUP;
            break;
          }
        }
      }
    }
    return flags;
  }

  function enterCar(state, car) {
    const p = state.player;
    car.driver = 'player';
    p.car = car;
    p.onFoot = false;
    p.speed = 0;
    let flags = EVENT_STEAL;
    state.stats.carsStolen += 1;
    flags |= raiseWanted(state, 1);
    return flags;
  }

  function exitCar(state) {
    const p = state.player;
    const car = p.car;
    car.driver = 'parked';
    car.speed = 0;
    p.car = null;
    p.onFoot = true;
    p.x = car.x + Math.cos(car.angle + Math.PI / 2) * 42;
    p.y = car.y + Math.sin(car.angle + Math.PI / 2) * 42;
    resolveBuildings(state.city.buildings, p, PLAYER.radius);
    return 0;
  }

  function buyFromShop(state) {
    const p = state.player;
    if (p.weapon === 'fists' && p.cash >= PRICES.pistol) {
      p.cash -= PRICES.pistol;
      p.weapon = 'pistol';
      p.ammo = WEAPONS.pistol.ammo;
      return EVENT_PICKUP;
    }
    if (p.weapon === 'pistol' && p.cash >= PRICES.smg) {
      p.cash -= PRICES.smg;
      p.weapon = 'smg';
      p.ammo = WEAPONS.smg.ammo;
      return EVENT_PICKUP;
    }
    if (p.cash >= PRICES.ammo && p.weapon !== 'fists') {
      p.cash -= PRICES.ammo;
      p.ammo += PRICES.ammoPickup;
      return EVENT_PICKUP;
    }
    return 0;
  }

  function stepTraffic(state, dt) {
    const lines = state.city.lines || [];
    for (const car of state.cars) {
      if (car.driver !== 'traffic') continue;
      // Turn at an intersection now and then.
      const nearCross = lines.some((l) => Math.abs((car.axis === 'x' ? car.y : car.x) - l) < 30)
        && lines.some((l) => Math.abs((car.axis === 'x' ? car.x : car.y) - l) < 30);
      if (nearCross && rng.next() < 0.006) {
        const other = rng.pick(lines);
        if (car.axis === 'x') {
          car.axis = 'y';
          car.line = other;
          car.y = other;
          car.dir = rng.next() < 0.5 ? 1 : -1;
        } else {
          car.axis = 'x';
          car.line = other;
          car.x = other;
          car.dir = rng.next() < 0.5 ? 1 : -1;
        }
      }
      if (car.axis === 'x') {
        car.x += car.dir * car.speed * dt;
        car.y = car.line;
        car.angle = car.dir > 0 ? 0 : Math.PI;
        if (car.x < 60) { car.x = 60; car.dir = 1; }
        if (car.x > WORLD.width - 60) { car.x = WORLD.width - 60; car.dir = -1; }
      } else {
        car.y += car.dir * car.speed * dt;
        car.x = car.line;
        car.angle = car.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        if (car.y < 60) { car.y = 60; car.dir = 1; }
        if (car.y > WORLD.height - 60) { car.y = WORLD.height - 60; car.dir = -1; }
      }
      // A speeding player car spooks nearby traffic off its line a touch.
      const p = state.player;
      if (!p.onFoot && Math.abs(p.speed) > 300 && dist(p.x, p.y, car.x, car.y) < 120) {
        car.speed = Math.max(60, car.speed - 200 * dt);
      }
    }
  }

  function stepPeds(state, dt) {
    const p = state.player;
    const gunfire = state.time - state.lastShotCrime < 2;
    for (const ped of state.peds) {
      if (ped.state === 'down') continue;
      ped.punchTimer = Math.max(0, (ped.punchTimer || 0) - dt);
      if (ped.kind === 'cop' && ped.state === 'chase') {
        const a = angleTo(ped.x, ped.y, p.x, p.y);
        ped.angle = a;
        ped.x += Math.cos(a) * POLICE.copSpeed * dt;
        ped.y += Math.sin(a) * POLICE.copSpeed * dt;
        if (dist(ped.x, ped.y, p.x, p.y) < 30 && ped.punchTimer <= 0 && p.onFoot) {
          p.health -= 8;
          ped.punchTimer = 0.9;
          burst(state, p.x, p.y, '#e74c3c', 4);
        }
        continue;
      }
      // Flee gunfire and speeding cars; taxi fares wait where they stand.
      const threatNear = gunfire
        || (!p.onFoot && Math.abs(p.speed) > 280 && dist(p.x, p.y, ped.x, ped.y) < 150);
      if (threatNear && ped.kind !== 'taxi') ped.state = 'flee';
      if (ped.state === 'flee') {
        const a = angleTo(p.x, p.y, ped.x, ped.y);
        ped.angle = a;
        ped.x += Math.cos(a) * ped.speed * 1.6 * dt;
        ped.y += Math.sin(a) * ped.speed * 1.6 * dt;
        if (dist(ped.x, ped.y, p.x, p.y) > 420) ped.state = 'walk';
      } else if (ped.kind !== 'taxi') {
        ped.turnTimer -= dt;
        if (ped.turnTimer <= 0) {
          ped.turnTimer = 2 + rng.next() * 4;
          ped.angle += (rng.next() - 0.5) * 1.8;
        }
        ped.x += Math.cos(ped.angle) * ped.speed * dt;
        ped.y += Math.sin(ped.angle) * ped.speed * dt;
      }
      ped.x = clamp(ped.x, 20, WORLD.width - 20);
      ped.y = clamp(ped.y, 20, WORLD.height - 20);
      resolveBuildings(state.city.buildings, ped, 12);
    }
  }

  function stepPolice(state, dt) {
    const p = state.player;
    const wanted = p.wanted;
    // Police cars: one per wanted star, up to three on the road.
    const wantCars = clamp(wanted, 0, 3);
    let haveCars = state.cars.filter((c) => c.driver === 'police').length;
    const spawns = state.city.spawns.police || [{ x: 2048, y: 2048 }];
    let spawnIdx = 0;
    while (haveCars < wantCars) {
      const s = spawns[spawnIdx++ % spawns.length];
      const id = nextPoliceId++;
      state.cars.push({
        id,
        x: s.x,
        y: s.y,
        angle: angleTo(s.x, s.y, p.x, p.y),
        speed: POLICE.carSpeed,
        color: '#1c2733',
        kind: 'police',
        driver: 'police',
        hp: 120,
      });
      haveCars += 1;
    }
    if (haveCars > wantCars) {
      let excess = haveCars - wantCars;
      state.cars = state.cars.filter((c) => {
        if (c.driver === 'police' && excess > 0) {
          excess -= 1;
          return false;
        }
        return true;
      });
    }
    for (const car of state.cars) {
      if (car.driver !== 'police') continue;
      const a = angleTo(car.x, car.y, p.x, p.y);
      let diff = a - car.angle;
      while (diff > Math.PI) diff -= TAU;
      while (diff < -Math.PI) diff += TAU;
      car.angle += clamp(diff, -2.2 * dt, 2.2 * dt);
      car.speed = POLICE.carSpeed;
      car.x += Math.cos(car.angle) * car.speed * dt;
      car.y += Math.sin(car.angle) * car.speed * dt;
      resolveBuildings(state.city.buildings, car, CAR.radius);
      if (dist(car.x, car.y, p.x, p.y) < CAR.radius + 20 && !p.onFoot && p.car !== car) {
        // A police ram: slows the player and hurts.
        p.health -= 4;
        p.car.speed *= 0.55;
        burst(state, car.x, car.y, '#3498db', 6);
      }
    }
    // Foot cops join the chase at two stars and up.
    const wantCops = wanted >= 2 ? clamp(wanted - 1, 0, 4) : 0;
    let haveCops = state.peds.filter((pd) => pd.kind === 'cop' && pd.state === 'chase').length;
    while (haveCops < wantCops) {
      const s = spawns[haveCops % spawns.length];
      state.peds.push({
        x: s.x + (rng.next() - 0.5) * 80,
        y: s.y + (rng.next() - 0.5) * 80,
        angle: angleTo(s.x, s.y, p.x, p.y),
        speed: POLICE.copSpeed,
        kind: 'cop',
        state: 'chase',
        hp: 60,
        turnTimer: 0,
        punchTimer: 0,
      });
      haveCops += 1;
    }
    if (haveCops > wantCops) {
      let excess = haveCops - wantCops;
      state.peds = state.peds.filter((pd) => {
        if (pd.kind === 'cop' && pd.state === 'chase' && excess > 0) {
          excess -= 1;
          return false;
        }
        return true;
      });
    }
  }

  function stepEnemies(state, dt) {
    const p = state.player;
    for (const e of state.enemies) {
      if (e.hp <= 0) continue;
      const d = dist(e.x, e.y, p.x, p.y);
      if (d < 620 && p.alive) {
        const a = angleTo(e.x, e.y, p.x, p.y);
        e.angle = a;
        e.x += Math.cos(a) * 95 * dt;
        e.y += Math.sin(a) * 95 * dt;
        resolveBuildings(state.city.buildings, e, 14);
        e.shootTimer = (e.shootTimer || 1) - dt;
        if (e.shootTimer <= 0 && d < 430) {
          const wobble = (rng.next() - 0.5) * 0.45;
          fireWeapon(state, e.x, e.y, a + wobble, 'enemy', 'pistol');
          e.shootTimer = 1.1 + rng.next() * 0.8;
        }
      }
    }
  }

  function stepPickups(state, dt) {
    const p = state.player;
    let flags = 0;
    state.pickups = state.pickups.filter((pk) => {
      if (!p.alive) return true;
      if (dist(p.x, p.y, pk.x, pk.y) < 34) {
        if (pk.kind === 'cash') {
          const amount = pk.amount || 200;
          p.cash += amount;
          state.stats.cashEarned += amount;
          flags |= EVENT_PICKUP;
        } else if (pk.kind === 'health') {
          if (p.health >= PLAYER.health) return true;
          p.health = Math.min(PLAYER.health, p.health + PRICES.healthPickup);
          flags |= EVENT_PICKUP;
        } else if (pk.kind === 'ammo') {
          if (p.weapon === 'fists') return true;
          p.ammo += PRICES.ammoPickup;
          flags |= EVENT_PICKUP;
        }
        return false;
      }
      return true;
    });
    // Stashes slowly grow back so the city never runs dry.
    state.respawnTimer += dt;
    if (state.respawnTimer > 22 && state.pickups.length < 12) {
      state.respawnTimer = 0;
      const spot = stashSpot();
      const roll = rng.next();
      state.pickups.push({
        x: spot.x,
        y: spot.y,
        kind: roll < 0.6 ? 'cash' : (roll < 0.8 ? 'health' : 'ammo'),
        amount: 100 + rng.int(0, 3) * 100,
      });
    }
    return flags;
  }

  function stepTaxi(state, dt) {
    const p = state.player;
    let flags = 0;
    if (!state.taxi) {
      if (!p.onFoot && p.car && Math.abs(p.car.speed) < 50) {
        for (let i = 0; i < state.peds.length; i++) {
          const ped = state.peds[i];
          if (ped.kind !== 'taxi' || ped.state === 'down') continue;
          if (dist(p.x, p.y, ped.x, ped.y) < 95) {
            const dest = randomRoadPoint(city, rng);
            state.taxi = { x: dest.x, y: dest.y, fare: PRICES.taxiMin + rng.int(0, PRICES.taxiMax - PRICES.taxiMin) };
            state.peds.splice(i, 1);
            flags |= EVENT_PICKUP;
            break;
          }
        }
      }
    } else if (!p.onFoot && p.car) {
      if (dist(p.x, p.y, state.taxi.x, state.taxi.y) < 75) {
        p.cash += state.taxi.fare;
        state.stats.cashEarned += state.taxi.fare;
        burst(state, p.x, p.y, '#f4d03f', 8);
        state.taxi = null;
        flags |= EVENT_PICKUP;
      }
    } else {
      // The fare walks away if Milo ditches the car mid-ride.
      state.taxi = null;
    }
    return flags;
  }

  function stepWanted(state, dt) {
    if (state.player.wanted <= 0) return 0;
    if (state.time - state.lastCrime < WANTED.decayAfter) return 0;
    const nearPolice = state.cars.some((c) => c.driver === 'police' && dist(c.x, c.y, state.player.x, state.player.y) < WANTED.policeRadius)
      || state.peds.some((pd) => pd.kind === 'cop' && dist(pd.x, pd.y, state.player.x, state.player.y) < WANTED.policeRadius);
    if (nearPolice) {
      state.decayTimer = 0;
      return 0;
    }
    state.decayTimer += dt;
    if (state.decayTimer >= WANTED.decayEvery) {
      state.decayTimer = 0;
      state.player.wanted = Math.max(0, state.player.wanted - 1);
      return EVENT_WANTED_DOWN;
    }
    return 0;
  }

  function stepParticles(state, dt) {
    for (const pt of state.particles) {
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vz -= 320 * dt;
      pt.z += pt.vz * dt;
      if (pt.z < 0) {
        pt.z = 0;
        pt.vz = 0;
      }
      pt.life -= dt;
    }
    state.particles = state.particles.filter((pt) => pt.life > 0);
  }

  function stepCamera(state) {
    const cam = state.camera;
    const p = state.player;
    if (!cam.locked) {
      const mode = p.onFoot ? 'follow' : 'chase';
      if (cam.mode !== mode) {
        cam.mode = mode;
        cam.dist = CAMERA3D[mode].dist;
      }
    }
    cam.x = p.x;
    cam.y = p.y;
    if (!p.onFoot) cam.yaw = p.angle;
  }

  function step(dt, input) {
    const state = current;
    if (!state.player.alive) return 0;
    state.time += dt;
    state.sprayTimer = Math.max(0, state.sprayTimer - dt);
    let flags = 0;

    flags |= stepPlayer(state, dt, input);
    stepTraffic(state, dt);
    stepPeds(state, dt);
    stepPolice(state, dt);
    stepEnemies(state, dt);
    stepBullets(state, dt);
    flags |= stepPickups(state, dt);
    flags |= stepTaxi(state, dt);
    flags |= stepWanted(state, dt);
    flags |= updateMission(state, dt);
    stepParticles(state, dt);
    stepCamera(state);

    // The next story job opens a few seconds after the last one pays out.
    const m = state.mission;
    if (m.index >= 0 && m.step >= m.steps.length && m.index < MISSIONS.length - 1) {
      state.doneTimer += dt;
      if (state.doneTimer > 3) {
        state.doneTimer = 0;
        startMission(state, m.index + 1);
        flags |= EVENT_MISSION;
      }
    } else {
      state.doneTimer = 0;
    }

    if (state.player.health <= 0 && state.player.alive) {
      state.player.alive = false;
      state.player.health = 0;
      const copNear = state.peds.some(
        (pd) => pd.kind === 'cop' && dist(pd.x, pd.y, state.player.x, state.player.y) < 120,
      );
      flags |= state.player.onFoot && copNear ? EVENT_BUSTED : EVENT_WASTED;
    }
    return flags;
  }

  function reset() {
    current = buildState();
  }

  const api = {
    get state() {
      return current;
    },
    reset,
    step,
  };
  return api;
}
