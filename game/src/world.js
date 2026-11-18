// VELMORA — Sunset Streets: the living city. No drawing and no browser here,
// only rules: Milo on foot or behind the wheel, traffic on the road grid,
// pedestrians on the sidewalks, VPD units that scale with the wanted level,
// pickups, taxi fares, shops, and the mission/combat hooks from DESIGN.md.
//
// step(dt, input) advances one fixed step and returns EVENT_* bit flags.
// Everything random comes from the seeded generator passed to createWorld,
// so the same seed and the same inputs always replay the same city.
import {
  CAR,
  EVENT_BUSTED,
  EVENT_CRASH,
  EVENT_HIT,
  EVENT_MISSION,
  EVENT_MISSION_DONE,
  EVENT_PICKUP,
  EVENT_PUNCH,
  EVENT_SHOT,
  EVENT_STEAL,
  EVENT_WANTED_DOWN,
  EVENT_WANTED_UP,
  EVENT_WASTED,
  PED,
  PLAYER,
  POLICE,
  PRICES,
  TRAFFIC,
  VIEW,
  WANTED,
  WEAPONS,
  WORLD,
} from './config.js';
import { pick, randFloat, randInt } from './random.js';
import { isOnRoad, nearestRoadPoint, randomRoadPoint } from './city.js';
import { updateMission } from './missions.js';
import { fireWeapon, punchAttack, stepBullets } from './combat.js';

const TWO_PI = Math.PI * 2;
const CAR_COLORS = ['#c94f42', '#4f7ec9', '#e8e4da', '#3a3f4a', '#7a4fc9', '#4fc98a', '#d8b25e', '#8a97a8'];
const TAXI_COLOR = '#f2c94c';
const POLICE_COLOR = '#3f6fd8';
const SPORT_COLOR = '#d8b25e';

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function dist(x1, y1, x2, y2) {
  return Math.hypot(x2 - x1, y2 - y1);
}

/** Smallest signed turn from angle a to angle b, in (-PI, PI]. */
function angleTo(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= TWO_PI;
  while (d <= -Math.PI) d += TWO_PI;
  return d;
}

/**
 * Push a circle (x, y, r) out of a rectangle. Returns {x, y, hit} with the
 * corrected centre; hit is true when the circle overlapped the rectangle.
 */
function resolveCircleRect(x, y, r, rect) {
  const cx = clamp(x, rect.x, rect.x + rect.w);
  const cy = clamp(y, rect.y, rect.y + rect.h);
  const dx = x - cx;
  const dy = y - cy;
  const d2 = dx * dx + dy * dy;
  if (d2 >= r * r) return { x, y, hit: false };
  if (d2 > 0.0001) {
    const d = Math.sqrt(d2);
    return { x: cx + (dx / d) * r, y: cy + (dy / d) * r, hit: true };
  }
  // Centre inside the rectangle: push out along the shallowest side.
  const left = x - rect.x;
  const right = rect.x + rect.w - x;
  const top = y - rect.y;
  const bottom = rect.y + rect.h - y;
  const m = Math.min(left, right, top, bottom);
  if (m === left) return { x: rect.x - r, y, hit: true };
  if (m === right) return { x: rect.x + rect.w + r, y, hit: true };
  if (m === top) return { x, y: rect.y - r, hit: true };
  return { x, y: rect.y + rect.h + r, hit: true };
}

/** Push a circle out of every building it overlaps. Returns true on contact. */
function collideBuildings(city, x, y, r) {
  let hit = false;
  let px = x;
  let py = y;
  for (const b of city.buildings) {
    if (px + r < b.x || px - r > b.x + b.w || py + r < b.y || py - r > b.y + b.h) continue;
    const fixed = resolveCircleRect(px, py, r, b);
    px = fixed.x;
    py = fixed.y;
    if (fixed.hit) hit = true;
  }
  return { x: px, y: py, hit };
}

function burst(state, x, y, color, count, speed) {
  for (let i = 0; i < count; i += 1) {
    if (state.particles.length >= 240) return;
    const a = (i / count) * TWO_PI + state.time;
    state.particles.push({
      x, y,
      // 3D arc: launched upward, gravity pulls the particle back down.
      z: 0,
      vz: 90 + ((i * 41) % 10) * 14,
      vx: Math.cos(a) * speed * (0.4 + 0.6 * ((i * 37) % 10) / 10),
      vy: Math.sin(a) * speed * (0.4 + 0.6 * ((i * 53) % 10) / 10),
      life: 0.5 + ((i * 29) % 10) / 25,
      color,
      size: 2 + ((i * 17) % 3),
    });
  }
}

export function createWorld(random, city) {
  const rng = random;
  let nextCarId = 1;

  const player = {
    x: 0, y: 0, angle: 0, speed: 0,
    onFoot: true, health: PLAYER.health, cash: PLAYER.startCash,
    weapon: 'fists', ammo: 0, wanted: 0, car: null, alive: true,
  };

  const state = {
    time: 0,
    city,
    player,
    cars: [],
    peds: [],
    enemies: [],
    bullets: [],
    particles: [],
    pickups: [],
    mission: { index: -1, step: 0, objective: '', marker: null, timer: 0 },
    stats: { kills: 0, carsStolen: 0, missionsDone: 0, cashEarned: 0 },
    // 3D camera state (binding contract with the three.js renderer):
    // mode/dist/yaw drive the 3D view; x/y keep the old 2D camera origin;
    // locked true means a shot or the player set the mode and step() must
    // not auto-switch it. Target is the player/car position, already in state.
    camera: { x: 0, y: 0, mode: 'follow', dist: 260, yaw: 0, locked: false },
    // Side job state (extra to the DESIGN.md shape, for the HUD/renderer):
    // taxi.active while a fare passenger rides with you; taxi.dest is the
    // drop-off point and taxi.fare the payout on arrival.
    taxi: { active: false, fare: 0, dest: null },
  };

  // Timers kept out of the saved state: they are pure simulation bookkeeping.
  let lastCrimeAt = -1000;
  let decayTimer = 0;
  let fireTimer = 0;
  let punchTimer = 0;
  let sprayTimer = 0;
  let gunfireTimer = 0;
  let crimeCooldown = 0;
  let hurtTimer = 0;
  let copSpawnTimer = 0;

  function makeCar(x, y, angle, kind, driver, color) {
    const car = {
      id: nextCarId,
      x, y, angle, speed: 0,
      color: color || pick(rng, CAR_COLORS),
      kind, driver, hp: CAR.hp,
      axis: 'x', line: y, dir: 1,
      turnCooldown: 0,
    };
    nextCarId += 1;
    if (Math.abs(Math.cos(angle)) >= Math.abs(Math.sin(angle))) {
      car.axis = 'x';
      car.line = y;
      car.dir = Math.cos(angle) >= 0 ? 1 : -1;
    } else {
      car.axis = 'y';
      car.line = x;
      car.dir = Math.sin(angle) >= 0 ? 1 : -1;
    }
    return car;
  }

  function spawnTrafficCar() {
    const p = randomRoadPoint(city, rng);
    const kind = rng() < 0.12 ? 'taxi' : pick(rng, ['sedan', 'sedan', 'sedan', 'truck', 'sport']);
    const angle = p.axis === 'x' ? (p.dir > 0 ? 0 : Math.PI) : (p.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    const car = makeCar(p.x, p.y, angle, kind, 'traffic', kind === 'taxi' ? TAXI_COLOR : undefined);
    car.axis = p.axis;
    car.line = p.line;
    car.dir = p.dir;
    car.speed = randInt(rng, TRAFFIC.minSpeed, TRAFFIC.maxSpeed) * p.dir;
    state.cars.push(car);
    return car;
  }

  function spawnPed() {
    const p = randomRoadPoint(city, rng);
    const side = rng() < 0.5 ? 62 : -62;
    const x = p.axis === 'x' ? p.x : p.x + side;
    const y = p.axis === 'x' ? p.y + side : p.y;
    const isTaxi = rng() < PED.taxiChance;
    const ped = {
      x, y,
      angle: p.axis === 'x' ? (p.dir > 0 ? 0 : Math.PI) : (p.dir > 0 ? Math.PI / 2 : -Math.PI / 2),
      speed: isTaxi ? 0 : randInt(rng, PED.walkMin, PED.walkMax),
      kind: isTaxi ? 'taxi' : (city && p.x > 2048 && p.y > 2048 && rng() < 0.25 ? 'gang' : 'walker'),
      state: 'walk',
      hp: 40,
      axis: p.axis,
      line: p.axis === 'x' ? p.y : p.x,
      dir: p.dir,
      side,
      waiting: isTaxi,
      shootTimer: 0,
      punchTimer: 0,
    };
    state.peds.push(ped);
    return ped;
  }

  function spawnPickup(kind, x, y, amount) {
    state.pickups.push({ x, y, kind, amount: amount || 0 });
  }

  function scatterPickups() {
    for (let i = 0; i < 8; i += 1) {
      const p = randomRoadPoint(city, rng);
      spawnPickup('cash', p.x + randInt(rng, -40, 40), p.y + randInt(rng, -40, 40),
        randInt(rng, PRICES.cashPickupMin, PRICES.cashPickupMax));
    }
    for (let i = 0; i < 4; i += 1) {
      const p = randomRoadPoint(city, rng);
      spawnPickup('health', p.x, p.y, PRICES.healthPickup);
    }
    for (let i = 0; i < 4; i += 1) {
      const p = randomRoadPoint(city, rng);
      spawnPickup('ammo', p.x, p.y, PRICES.ammoPickup);
    }
  }

  function reset() {
    state.time = 0;
    state.cars.length = 0;
    state.peds.length = 0;
    state.enemies.length = 0;
    state.bullets.length = 0;
    state.particles.length = 0;
    state.pickups.length = 0;
    nextCarId = 1;
    lastCrimeAt = -1000;
    decayTimer = 0;
    fireTimer = 0;
    punchTimer = 0;
    sprayTimer = 0;
    gunfireTimer = 0;
    crimeCooldown = 0;
    hurtTimer = 0;
    copSpawnTimer = 0;

    player.x = city.spawns.player.x;
    player.y = city.spawns.player.y;
    player.angle = 0;
    player.speed = 0;
    player.onFoot = true;
    player.health = PLAYER.health;
    player.cash = PLAYER.startCash;
    player.weapon = 'fists';
    player.ammo = 0;
    player.wanted = 0;
    player.car = null;
    player.alive = true;

    state.mission = { index: -1, step: 0, objective: '', marker: null, timer: 0 };
    state._m3Spawned = false;
    state.stats = { kills: 0, carsStolen: 0, missionsDone: 0, cashEarned: 0 };
    state.taxi = { active: false, fare: 0, dest: null };
    state.camera.mode = 'follow';
    state.camera.dist = 260;
    state.camera.yaw = 0;
    state.camera.locked = false;

    for (const s of city.spawns.cars) {
      state.cars.push(makeCar(s.x, s.y, s.angle, 'sedan', 'parked', undefined));
    }
    // One gold sport car — the Aurora GT — parked in Downtown for mission 5,
    // at the exact spot the mission marker points to (2464, 672).
    state.cars.push(makeCar(2464, 672 - 66, 0, 'sport', 'parked', '#d8b25e'));
    for (let i = 0; i < TRAFFIC.count; i += 1) spawnTrafficCar();
    for (let i = 0; i < PED.count; i += 1) spawnPed();
    scatterPickups();
    updateCamera();
  }

  function updateCamera() {
    state.camera.x = clamp(player.x - VIEW.width / 2, 0, WORLD.width - VIEW.width);
    state.camera.y = clamp(player.y - VIEW.height / 2, 0, WORLD.height - VIEW.height);
    // 3D mode auto-switch: 'chase' while driving, 'follow' on foot — but
    // only when the mode was not explicitly set (shots.js / camera toggle
    // set locked: true, and step() must not fight a locked mode).
    if (!state.camera.locked) {
      state.camera.mode = player.onFoot ? 'follow' : 'chase';
    }
  }

  function addWanted(n) {
    if (!player.alive || player.wanted >= WANTED.max) return 0;
    const before = player.wanted;
    player.wanted = Math.min(WANTED.max, player.wanted + n);
    lastCrimeAt = state.time;
    decayTimer = 0;
    return player.wanted > before ? EVENT_WANTED_UP : 0;
  }

  function hurtPlayer(amount) {
    if (!player.alive) return 0;
    player.health -= amount;
    if (player.health > 0) return EVENT_HIT;
    player.health = 0;
    player.alive = false;
    const copNear = state.peds.some(
      (p) => p.kind === 'cop' && p.state !== 'down' && dist(p.x, p.y, player.x, player.y) < 200,
    );
    if (player.onFoot && copNear) return EVENT_BUSTED;
    return EVENT_WASTED;
  }

  function nearestCar(maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const car of state.cars) {
      const d = dist(car.x, car.y, player.x, player.y);
      if (d < bestD) { bestD = d; best = car; }
    }
    return best;
  }

  function nearestGarage(kind, maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const g of city.garages) {
      if (g.kind !== kind) continue;
      const d = dist(g.x, g.y, player.x, player.y);
      if (d < bestD) { bestD = d; best = g; }
    }
    return best;
  }

  function enterCar(car, events) {
    if (car.driver === 'police' || car.driver === 'traffic' || car.driver === 'parked') {
      events |= addWanted(WANTED.steal);
      events |= EVENT_STEAL;
      state.stats.carsStolen += 1;
    }
    car.driver = 'player';
    player.car = car;
    player.onFoot = false;
    player.x = car.x;
    player.y = car.y;
    player.angle = car.angle;
    player.speed = car.speed;
    return events;
  }

  function exitCar() {
    const car = player.car;
    if (!car) return;
    car.driver = 'parked';
    car.speed = 0;
    // Step out to the car's left side, clear of walls where possible.
    const sideX = car.x + Math.cos(car.angle + Math.PI / 2) * 34;
    const sideY = car.y + Math.sin(car.angle + Math.PI / 2) * 34;
    const fixed = collideBuildings(city, sideX, sideY, PLAYER.radius);
    player.x = fixed.x;
    player.y = fixed.y;
    player.angle = car.angle;
    player.speed = 0;
    player.car = null;
    player.onFoot = true;
    if (state.taxi.active) {
      state.taxi = { active: false, fare: 0, dest: null };
    }
  }

  function drivePlayerCar(dt, input) {
    const car = player.car;
    if (!car) return 0;
    let events = 0;
    const accel = clamp(input.accel || 0, -1, 1);
    const steer = clamp(input.steer || 0, -1, 1);
    if (accel > 0) {
      car.speed += (car.speed < 0 ? CAR.brake : CAR.accel * accel) * dt;
    } else if (accel < 0) {
      car.speed += (car.speed > 0 ? -CAR.brake : CAR.reverseAccel * accel) * dt;
    }
    car.speed -= car.speed * CAR.drag * dt;
    car.speed -= car.speed * CAR.rollingDrag * dt * (accel === 0 ? 2 : 0);
    car.speed = clamp(car.speed, -CAR.maxReverse, CAR.maxSpeed);
    const grip = clamp(Math.abs(car.speed) / 220, 0, 1);
    car.angle += steer * CAR.steerRate * grip * (car.speed >= 0 ? 1 : -1) * dt;
    const nx = car.x + Math.cos(car.angle) * car.speed * dt;
    const ny = car.y + Math.sin(car.angle) * car.speed * dt;
    const fixed = collideBuildings(city, nx, ny, CAR.radius);
    const impact = Math.abs(car.speed);
    if (fixed.hit && impact > CAR.crashSpeed) {
      events |= EVENT_CRASH;
      events |= hurtPlayer(Math.round((impact - CAR.crashSpeed) / 25));
      burst(state, car.x, car.y, '#e8d47a', 10, 160);
      car.speed *= -0.25;
    } else if (fixed.hit) {
      car.speed *= 0.4;
    }
    car.x = clamp(fixed.x, 20, WORLD.width - 20);
    car.y = clamp(fixed.y, 20, WORLD.height - 20);
    player.x = car.x;
    player.y = car.y;
    player.angle = car.angle;
    player.speed = car.speed;
    if (car.hp <= 0) {
      burst(state, car.x, car.y, '#e5534b', 18, 260);
      exitCar();
    }
    return events;
  }

  function moveOnFoot(dt, input) {
    let mx = clamp(input.mx || 0, -1, 1);
    let my = clamp(input.my || 0, -1, 1);
    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }
    const nx = player.x + mx * PLAYER.walkSpeed * dt;
    const ny = player.y + my * PLAYER.walkSpeed * dt;
    const fixed = collideBuildings(city, nx, ny, PLAYER.radius);
    player.x = clamp(fixed.x, 16, WORLD.width - 16);
    player.y = clamp(fixed.y, 16, WORLD.height - 16);
    if (len > 0.1) player.angle = Math.atan2(my, mx);
    // Aim with the mouse when one is given (world coords, per the contract).
    if (input.mouse && Number.isFinite(input.mouse.x) && Number.isFinite(input.mouse.y)) {
      const dx = input.mouse.x - player.x;
      const dy = input.mouse.y - player.y;
      if (Math.hypot(dx, dy) > 24) player.angle = Math.atan2(dy, dx);
    }
    player.speed = len * PLAYER.walkSpeed;
  }

  /** Traffic car: drive its road, turn at intersections, mind the car ahead. */
  function stepTrafficCar(car, dt) {
    car.turnCooldown = Math.max(0, car.turnCooldown - dt);
    const signed = car.speed;
    const ahead = car.axis === 'x' ? car.x + car.dir * TRAFFIC.followGap : car.y + car.dir * TRAFFIC.followGap;
    let blocked = false;
    for (const other of state.cars) {
      if (other === car || other.driver === 'parked') continue;
      if (other.axis !== car.axis || other.line !== car.line) continue;
      const along = car.axis === 'x' ? other.x : other.y;
      const mine = car.axis === 'x' ? car.x : car.y;
      if (car.dir > 0 ? along > mine && along < mine + TRAFFIC.followGap : along < mine && along > mine - TRAFFIC.followGap) {
        blocked = true;
        break;
      }
    }
    const target = blocked ? signed * 0.3 : randTargetSpeed(car);
    car.speed += clamp(target - signed, -260 * dt, 260 * dt);
    let coord = car.axis === 'x' ? car.x : car.y;
    const next = coord + car.speed * dt;
    // Crossed an intersection on the way? Maybe turn there.
    if (car.turnCooldown <= 0) {
      for (const line of city.lines) {
        const crossed = car.dir > 0 ? coord < line && next >= line : coord > line && next <= line;
        if (!crossed) continue;
        if (rng() < TRAFFIC.turnChance) {
          const cross = line;
          if (car.axis === 'x') {
            car.x = cross;
            car.y = car.line;
            car.axis = 'y';
            car.line = cross;
            car.dir = rng() < 0.5 ? 1 : -1;
            car.angle = car.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
          } else {
            car.y = cross;
            car.x = car.line;
            car.axis = 'x';
            car.line = cross;
            car.dir = rng() < 0.5 ? 1 : -1;
            car.angle = car.dir > 0 ? 0 : Math.PI;
          }
          car.turnCooldown = 1.5;
          return;
        }
        break;
      }
    }
    if (car.axis === 'x') {
      car.x = next;
      car.y = car.line;
      if (car.x < 90 || car.x > WORLD.width - 90) { car.dir *= -1; car.speed *= -1; car.angle += Math.PI; }
    } else {
      car.y = next;
      car.x = car.line;
      if (car.y < 90 || car.y > WORLD.height - 90) { car.dir *= -1; car.speed *= -1; car.angle += Math.PI; }
    }
    car.angle = car.axis === 'x' ? (car.dir > 0 ? 0 : Math.PI) : (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    void ahead;
  }

  function randTargetSpeed(car) {
    // Keep each traffic car's cruising speed stable: store it on first use.
    if (car.cruise === undefined) car.cruise = Math.abs(car.speed) || randInt(rng, TRAFFIC.minSpeed, TRAFFIC.maxSpeed);
    return car.cruise * car.dir;
  }

  /** Police car: point at the player and chase, bouncing off buildings. */
  function stepPoliceCar(car, dt) {
    let events = 0;
    const want = Math.atan2(player.y - car.y, player.x - car.x);
    car.angle += clamp(angleTo(car.angle, want), -2.4 * dt, 2.4 * dt);
    const d = dist(car.x, car.y, player.x, player.y);
    const target = d > 60 ? POLICE.carSpeed : POLICE.carSpeed * 0.4;
    car.speed += clamp(target - car.speed, -POLICE.carAccel * dt, POLICE.carAccel * dt);
    const nx = car.x + Math.cos(car.angle) * car.speed * dt;
    const ny = car.y + Math.sin(car.angle) * car.speed * dt;
    const fixed = collideBuildings(city, nx, ny, CAR.radius);
    if (fixed.hit) car.speed *= 0.5;
    car.x = clamp(fixed.x, 20, WORLD.width - 20);
    car.y = clamp(fixed.y, 20, WORLD.height - 20);
    // Ram the player's car, or shove Milo when he is on foot.
    if (d < CAR.radius + 26 && hurtTimer <= 0) {
      hurtTimer = 1;
      burst(state, player.x, player.y, '#e8d47a', 8, 140);
      if (!player.onFoot && player.car) {
        player.car.hp -= POLICE.ramDamage;
        player.car.speed *= 0.6;
        events |= EVENT_CRASH;
      } else if (player.onFoot) {
        events |= EVENT_CRASH;
        events |= hurtPlayer(6);
      }
    }
    return events;
  }

  function stepPed(ped, dt) {
    if (ped.state === 'down') return 0;
    if (ped.kind === 'cop') {
      return stepCop(ped, dt);
    }
    const threat = gunfireTimer > 0;
    let fleeing = threat;
    if (!fleeing) {
      for (const car of state.cars) {
        if (Math.abs(car.speed) > 300 && dist(car.x, car.y, ped.x, ped.y) < 130) { fleeing = true; break; }
      }
    }
    if (ped.waiting && !fleeing) return 0; // Taxi stand: waiting for a fare.
    if (fleeing) {
      ped.state = 'flee';
      const away = Math.atan2(ped.y - player.y, ped.x - player.x);
      ped.angle = away;
      const nx = ped.x + Math.cos(away) * PED.fleeSpeed * dt;
      const ny = ped.y + Math.sin(away) * PED.fleeSpeed * dt;
      const fixed = collideBuildings(city, nx, ny, PED.radius);
      ped.x = clamp(fixed.x, 16, WORLD.width - 16);
      ped.y = clamp(fixed.y, 16, WORLD.height - 16);
      return 0;
    }
    ped.state = 'walk';
    const stepLen = ped.speed * dt;
    let coord = ped.axis === 'x' ? ped.x : ped.y;
    const next = coord + ped.dir * stepLen;
    for (const line of city.lines) {
      const crossed = ped.dir > 0 ? coord < line && next >= line : coord > line && next <= line;
      if (crossed && rng() < 0.3) {
        if (ped.axis === 'x') { ped.x = line; ped.axis = 'y'; ped.line = line; ped.dir = rng() < 0.5 ? 1 : -1; }
        else { ped.y = line; ped.axis = 'x'; ped.line = line; ped.dir = rng() < 0.5 ? 1 : -1; }
        ped.angle = ped.axis === 'x' ? (ped.dir > 0 ? 0 : Math.PI) : (ped.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
        return 0;
      }
    }
    if (ped.axis === 'x') {
      ped.x = next;
      ped.y = ped.line + ped.side;
      if (ped.x < 90 || ped.x > WORLD.width - 90) ped.dir *= -1;
    } else {
      ped.y = next;
      ped.x = ped.line + ped.side;
      if (ped.y < 90 || ped.y > WORLD.height - 90) ped.dir *= -1;
    }
    ped.angle = ped.axis === 'x' ? (ped.dir > 0 ? 0 : Math.PI) : (ped.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    return 0;
  }

  function stepCop(ped, dt) {
    let events = 0;
    ped.state = 'chase';
    const d = dist(ped.x, ped.y, player.x, player.y);
    if (d > 26) {
      const a = Math.atan2(player.y - ped.y, player.x - ped.x);
      ped.angle = a;
      const nx = ped.x + Math.cos(a) * POLICE.footSpeed * dt;
      const ny = ped.y + Math.sin(a) * POLICE.footSpeed * dt;
      const fixed = collideBuildings(city, nx, ny, PED.radius);
      ped.x = clamp(fixed.x, 16, WORLD.width - 16);
      ped.y = clamp(fixed.y, 16, WORLD.height - 16);
    } else if (ped.punchTimer <= 0) {
      ped.punchTimer = POLICE.punchCooldown;
      burst(state, player.x, player.y, '#e8d47a', 5, 100);
      events |= hurtPlayer(POLICE.punchDamage);
    }
    ped.punchTimer = Math.max(0, ped.punchTimer - dt);
    return events;
  }

  function managePolice(dt) {
    // Police cars: one per wanted star.
    const policeCars = state.cars.filter((c) => c.driver === 'police');
    if (player.wanted > 0 && policeCars.length < player.wanted) {
      const p = randomRoadPoint(city, rng);
      // Spawn on a road a good chase distance away, not on top of Milo.
      let tries = 0;
      let spawn = p;
      while (dist(spawn.x, spawn.y, player.x, player.y) < POLICE.spawnDistance && tries < 6) {
        spawn = randomRoadPoint(city, rng);
        tries += 1;
      }
      const car = makeCar(spawn.x, spawn.y, 0, 'police', 'police', POLICE_COLOR);
      car.speed = POLICE.carSpeed * 0.6;
      state.cars.push(car);
    } else if (player.wanted === 0) {
      for (const car of policeCars) {
        if (dist(car.x, car.y, player.x, player.y) > POLICE.despawnDistance) {
          state.cars.splice(state.cars.indexOf(car), 1);
        }
      }
    }
    // Foot cops once the heat is at 2 stars or more.
    const wantCops = player.wanted >= 2 ? Math.min(3, player.wanted - 1) : 0;
    const cops = state.peds.filter((p) => p.kind === 'cop' && p.state !== 'down');
    copSpawnTimer -= dt;
    if (cops.length < wantCops && copSpawnTimer <= 0) {
      copSpawnTimer = 2;
      const p = nearestRoadPoint(city, player.x + randInt(rng, -500, 500), player.y + randInt(rng, -500, 500));
      state.peds.push({
        x: p.x, y: p.y, angle: 0, speed: POLICE.footSpeed,
        kind: 'cop', state: 'chase', hp: 60,
        axis: 'x', line: p.y, dir: 1, side: 0, waiting: false,
        shootTimer: 0, punchTimer: 0,
      });
    }
    if (player.wanted === 0) {
      for (const ped of state.peds) {
        if (ped.kind === 'cop') ped.state = 'walk';
      }
    }
  }

  function stepEnemies(dt) {
    for (const enemy of state.enemies) {
      if (enemy.hp <= 0) continue;
      enemy.state = enemy.state || 'chase';
      const d = dist(enemy.x, enemy.y, player.x, player.y);
      enemy.shootTimer = Math.max(0, (enemy.shootTimer || 0) - dt);
      if (d < 520 && player.alive) {
        const aim = Math.atan2(player.y - enemy.y, player.x - enemy.x) + randFloat(rng, -0.16, 0.16);
        enemy.angle = aim;
        if (d < 430 && enemy.shootTimer <= 0) {
          enemy.shootTimer = 0.9 + rng() * 0.8;
          fireWeapon(state, enemy.x, enemy.y, aim, 'enemy');
        }
        if (d > 240) {
          const nx = enemy.x + Math.cos(aim) * 110 * dt;
          const ny = enemy.y + Math.sin(aim) * 110 * dt;
          const fixed = collideBuildings(city, nx, ny, PED.radius);
          enemy.x = fixed.x;
          enemy.y = fixed.y;
        }
      }
    }
    // Clear the dead, count the kill, sometimes drop cash.
    for (let i = state.enemies.length - 1; i >= 0; i -= 1) {
      if (state.enemies[i].hp > 0) continue;
      const dead = state.enemies[i];
      state.enemies.splice(i, 1);
      state.stats.kills += 1;
      burst(state, dead.x, dead.y, '#c94f42', 12, 180);
      if (rng() < 0.5) spawnPickup('cash', dead.x, dead.y, randInt(rng, 50, 150));
    }
  }

  function stepCarCollisions() {
    let events = 0;
    const cars = state.cars;
    for (let i = 0; i < cars.length; i += 1) {
      for (let j = i + 1; j < cars.length; j += 1) {
        const a = cars[i];
        const b = cars[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        const min = CAR.radius * 2 - 4;
        if (d >= min || d < 0.01) continue;
        const push = (min - d) / 2;
        const ux = dx / d;
        const uy = dy / d;
        a.x -= ux * push;
        a.y -= uy * push;
        b.x += ux * push;
        b.y += uy * push;
        const rel = Math.abs(a.speed - b.speed);
        if (rel > 260) {
          events |= EVENT_CRASH;
          burst(state, (a.x + b.x) / 2, (a.y + b.y) / 2, '#e8d47a', 8, 150);
          a.hp -= Math.round(rel / 40);
          b.hp -= Math.round(rel / 40);
          if ((a.driver === 'player' || b.driver === 'player') && rel > CAR.crashSpeed) {
            events |= hurtPlayer(Math.round((rel - CAR.crashSpeed) / 30));
          }
          a.speed *= 0.5;
          b.speed *= 0.5;
        }
      }
    }
    return events;
  }

  function stepCarPedCollisions() {
    let events = 0;
    for (const car of state.cars) {
      if (Math.abs(car.speed) < 120) continue;
      for (const ped of state.peds) {
        if (ped.state === 'down') continue;
        if (dist(car.x, car.y, ped.x, ped.y) > CAR.radius + PED.radius + 4) continue;
        ped.hp -= 30;
        ped.state = ped.hp <= 0 ? 'down' : 'flee';
        ped.x += Math.cos(car.angle) * 26;
        ped.y += Math.sin(car.angle) * 26;
        burst(state, ped.x, ped.y, '#c94f42', 8, 120);
        if (car.driver === 'player' && !ped.hitByCar) {
          ped.hitByCar = true;
          events |= addWanted(WANTED.hitPed);
          events |= EVENT_HIT;
        }
      }
      // A speeding car can also clip Milo on foot.
      if (car.driver !== 'player' && player.onFoot && player.alive
        && dist(car.x, car.y, player.x, player.y) < CAR.radius + PLAYER.radius
        && hurtTimer <= 0) {
        hurtTimer = 1;
        events |= EVENT_CRASH;
        events |= hurtPlayer(10);
      }
    }
    return events;
  }

  function stepPickups() {
    let events = 0;
    const reach = player.onFoot ? 30 : 44;
    for (let i = state.pickups.length - 1; i >= 0; i -= 1) {
      const pk = state.pickups[i];
      if (dist(pk.x, pk.y, player.x, player.y) > reach) continue;
      state.pickups.splice(i, 1);
      if (pk.kind === 'cash') {
        player.cash += pk.amount;
        state.stats.cashEarned += pk.amount;
      } else if (pk.kind === 'health') {
        player.health = Math.min(PLAYER.health, player.health + pk.amount);
      } else if (pk.kind === 'ammo') {
        player.ammo += pk.amount;
      }
      burst(state, pk.x, pk.y, '#f2c94c', 8, 110);
      events |= EVENT_PICKUP;
    }
    return events;
  }

  function stepTaxi(dt) {
    let events = 0;
    if (state.taxi.active) {
      const dest = state.taxi.dest;
      if (dest && dist(player.x, player.y, dest.x, dest.y) < 90) {
        player.cash += state.taxi.fare;
        state.stats.cashEarned += state.taxi.fare;
        burst(state, player.x, player.y, '#f2c94c', 10, 130);
        events |= EVENT_PICKUP;
        state.taxi = { active: false, fare: 0, dest: null };
      } else if (!player.car) {
        state.taxi = { active: false, fare: 0, dest: null };
      }
      return events;
    }
    if (player.car && player.car.driver === 'player' && player.car.kind !== 'police') {
      for (let i = 0; i < state.peds.length; i += 1) {
        const ped = state.peds[i];
        if (ped.kind !== 'taxi' || ped.state === 'down') continue;
        if (dist(ped.x, ped.y, player.x, player.y) > 90) continue;
        state.peds.splice(i, 1);
        const dest = randomRoadPoint(city, rng);
        state.taxi = { active: true, fare: randInt(rng, PRICES.taxiFareMin, PRICES.taxiFareMax), dest: { x: dest.x, y: dest.y } };
        events |= EVENT_PICKUP;
        break;
      }
    }
    void dt;
    return events;
  }

  function step(dt, input) {
    const inp = (input && typeof input === 'object') ? input : {};
    let events = 0;
    if (!player.alive) return 0;
    state.time += dt;
    fireTimer = Math.max(0, fireTimer - dt);
    punchTimer = Math.max(0, punchTimer - dt);
    sprayTimer = Math.max(0, sprayTimer - dt);
    gunfireTimer = Math.max(0, gunfireTimer - dt);
    crimeCooldown = Math.max(0, crimeCooldown - dt);
    hurtTimer = Math.max(0, hurtTimer - dt);

    // --- Player movement -------------------------------------------------
    if (player.onFoot) moveOnFoot(dt, inp);
    else events |= drivePlayerCar(dt, inp);

    // --- E: enter / steal / exit, gun shop -------------------------------
    if (inp.enter) {
      if (player.onFoot) {
        const arms = nearestGarage('arms', 80);
        if (arms) {
          if (player.weapon === 'fists' && player.cash >= PRICES.pistol) {
            player.cash -= PRICES.pistol;
            player.weapon = 'pistol';
            player.ammo += WEAPONS.pistol.startAmmo;
            events |= EVENT_PICKUP;
          } else if (player.weapon === 'pistol' && player.cash >= PRICES.smg) {
            player.cash -= PRICES.smg;
            player.weapon = 'smg';
            player.ammo += WEAPONS.smg.startAmmo;
            events |= EVENT_PICKUP;
          } else if (player.weapon !== 'fists' && player.cash >= PRICES.ammo) {
            player.cash -= PRICES.ammo;
            player.ammo += PRICES.ammoAmount;
            events |= EVENT_PICKUP;
          }
        } else {
          const car = nearestCar(CAR.enterRange);
          if (car) events = enterCar(car, events);
        }
      } else {
        exitCar();
      }
    }

    // --- Pay-n-Spray: slow drive-in clears the heat for $150 -------------
    if (!player.onFoot && player.wanted > 0 && sprayTimer <= 0) {
      const spray = nearestGarage('spray', 78);
      if (spray && Math.abs(player.speed) < 90 && player.cash >= PRICES.spray) {
        player.cash -= PRICES.spray;
        player.wanted = 0;
        sprayTimer = 3;
        burst(state, player.x, player.y, '#7fa8c9', 14, 150);
        events |= EVENT_WANTED_DOWN;
      }
    }

    // --- Punch / shoot ----------------------------------------------------
    if (player.onFoot && inp.punch && punchTimer <= 0) {
      punchTimer = PLAYER.punchCooldown;
      const nearWalker = state.peds.some(
        (p) => p.kind === 'walker' && p.state !== 'down'
          && dist(p.x, p.y, player.x, player.y) < PLAYER.punchRange + 14,
      );
      const punchEvents = punchAttack(state, player.x, player.y, player.angle);
      events |= punchEvents;
      if ((punchEvents & EVENT_HIT) && nearWalker && crimeCooldown <= 0) {
        crimeCooldown = 3;
        events |= addWanted(WANTED.hitPed);
      }
    }
    const weapon = WEAPONS[player.weapon];
    const wantShoot = inp.shoot || (inp.mouse && inp.mouse.down && weapon.auto);
    if (player.weapon !== 'fists' && wantShoot && fireTimer <= 0) {
      if (player.ammo > 0) {
        fireTimer = weapon.rate;
        const fired = fireWeapon(state, player.x, player.y, player.angle);
        if (fired) {
          gunfireTimer = 1.2;
          events |= EVENT_SHOT;
          if (crimeCooldown <= 0) {
            const witness = state.peds.some((p) => p.state !== 'down' && dist(p.x, p.y, player.x, player.y) < 500)
              || state.cars.some((c) => c.driver === 'police');
            if (witness) {
              crimeCooldown = 3;
              events |= addWanted(WANTED.shootPublic);
            }
          }
        }
      } else {
        fireTimer = 0.25; // Dry click: don't spam the empty gun.
      }
    }

    // --- Traffic, peds, police, enemies -----------------------------------
    for (const car of state.cars) {
      if (car.driver === 'traffic') stepTrafficCar(car, dt);
      else if (car.driver === 'police') events |= stepPoliceCar(car, dt);
    }
    for (const ped of state.peds) events |= stepPed(ped, dt);
    managePolice(dt);
    stepEnemies(dt);

    // --- Bullets (combat.js moves them and applies hits) ------------------
    stepBullets(state, dt);
    // A cop killed by gunfire raises the heat; a walker going down is a kill.
    for (const ped of state.peds) {
      if (ped.hp <= 0 && ped.state !== 'down') {
        ped.state = 'down';
        if (ped.kind === 'cop' && crimeCooldown <= 0) {
          crimeCooldown = 3;
          events |= addWanted(WANTED.killCop);
        }
      }
    }
    if (player.health <= 0 && player.alive) {
      player.health = 0;
      player.alive = false;
      const copNear = state.peds.some(
        (p) => p.kind === 'cop' && p.state !== 'down' && dist(p.x, p.y, player.x, player.y) < 200,
      );
      events |= (player.onFoot && copNear) ? EVENT_BUSTED : EVENT_WASTED;
    }
    // Wrecked player car: stepBullets / crashes may have zeroed its hp.
    if (!player.onFoot && player.car && player.car.hp <= 0) {
      burst(state, player.car.x, player.car.y, '#e5534b', 18, 260);
      exitCar();
    }

    events |= stepCarCollisions();
    events |= stepCarPedCollisions();
    events |= stepPickups();
    events |= stepTaxi(dt);

    // --- Wanted decay: quiet for 12 s, no police within 400 px ------------
    if (player.wanted > 0 && state.time - lastCrimeAt > WANTED.decayAfter) {
      const policeNear = state.cars.some((c) => c.driver === 'police' && dist(c.x, c.y, player.x, player.y) < WANTED.clearDistance)
        || state.peds.some((p) => p.kind === 'cop' && p.state !== 'down' && dist(p.x, p.y, player.x, player.y) < WANTED.clearDistance);
      if (!policeNear) {
        decayTimer += dt;
        if (decayTimer >= WANTED.decayInterval) {
          decayTimer = 0;
          player.wanted -= 1;
          events |= EVENT_WANTED_DOWN;
        }
      } else {
        decayTimer = 0;
      }
    }

    // --- Missions -----------------------------------------------------------
    const missionEvents = updateMission(state, dt);
    if (missionEvents) {
      events |= missionEvents;
      // (missions.js already counts the completed job in stats.missionsDone.)
    }
    // Mission 3 needs its actors: four Cobras holding the Docks. Spawn them
    // once when the mission starts and no enemies are present yet, so the
    // staged mission shot (which places its own Cobras) is left alone.
    if (state.mission.index === 2 && !state._m3Spawned && state.enemies.length === 0) {
      state._m3Spawned = true;
      const spots = [[-40, -40], [40, -40], [-40, 40], [40, 40]];
      for (const [dx, dy] of spots) {
        state.enemies.push({
          x: 3360 + dx, y: 3360 + dy, angle: Math.PI, hp: 60,
          weapon: 'pistol', state: 'chase', shootTimer: 0,
        });
      }
    }
    if (state.mission.index !== 2) state._m3Spawned = false;

    // --- Particles ----------------------------------------------------------
    for (let i = state.particles.length - 1; i >= 0; i -= 1) {
      const pt = state.particles[i];
      pt.life -= dt;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      // 3D arc: rise on vz, fall under gravity, die on landing. Particles
      // that never left the ground (vz 0, e.g. combat sparks) are governed
      // by life alone — only a particle that was airborne dies at z <= 0.
      const wasAirborne = (pt.z || 0) > 0;
      pt.z = (pt.z || 0) + (pt.vz || 0) * dt;
      pt.vz = (pt.vz || 0) - 320 * dt;
      if (pt.life <= 0 || (wasAirborne && pt.z <= 0)) state.particles.splice(i, 1);
    }

    // --- Ambient top-up: the city never empties ------------------------------
    if (state.cars.filter((c) => c.driver === 'traffic').length < TRAFFIC.count) spawnTrafficCar();
    if (state.peds.filter((p) => p.kind !== 'cop').length < PED.count) spawnPed();
    if (state.pickups.filter((p) => p.kind === 'cash').length < 4) {
      const p = randomRoadPoint(city, rng);
      spawnPickup('cash', p.x, p.y, randInt(rng, PRICES.cashPickupMin, PRICES.cashPickupMax));
    }

    updateCamera();
    void EVENT_MISSION;
    return events;
  }

  // 3D camera mode (see updateCamera above): step() smooth-follows the
  // player/car position — the target is already in state — and updateCamera
  // auto-switches follow/chase unless the mode is locked by a shot or the
  // player, so step() never fights an explicitly set mode.

  reset();
  return { state, reset, step };
}

// Re-exported for callers that only import the world module.
export { isOnRoad };
