// combat.js — shooting, bullets and fists for VELMORA: Sunset Streets.
// Bullets carry a z height (1.3 on foot, 1.0 from a car) so the 3D view can
// draw real tracers; all hit tests stay in the 2D ground plane.

import { WEAPONS } from './config.js';

const BULLET_SPEED = { pistol: 950, smg: 900 };
const BULLET_LIFE = 1.4;

function pointInBuilding(buildings, x, y) {
  for (const b of buildings || []) {
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return true;
  }
  return false;
}

function spawnSparks(state, x, y, z, color, count) {
  for (let i = 0; i < count; i++) {
    const a = (i / Math.max(1, count)) * Math.PI * 2 + 0.35 * i;
    state.particles.push({
      x,
      y,
      z: z || 0,
      vx: Math.cos(a) * 140,
      vy: Math.sin(a) * 140,
      vz: 120 + 40 * i,
      life: 0.4,
      color,
      size: 3,
    });
  }
}

function damagePed(state, ped, dmg, from) {
  ped.hp -= dmg;
  if (ped.hp <= 0 && ped.state !== 'down') {
    ped.state = 'down';
    ped.hp = 0;
    if (from === 'player') {
      state.stats.kills += 1;
      if (ped.kind === 'cop') {
        state.player.wanted = Math.min(5, state.player.wanted + 1);
      }
    }
    spawnSparks(state, ped.x, ped.y, 0.8, '#c0392b', 8);
    return true;
  }
  spawnSparks(state, ped.x, ped.y, 0.8, '#f1c40f', 3);
  return false;
}

function damageEnemy(state, enemy, dmg) {
  enemy.hp -= dmg;
  if (enemy.hp <= 0) {
    enemy.hp = 0;
    state.stats.kills += 1;
    spawnSparks(state, enemy.x, enemy.y, 0.8, '#c0392b', 10);
    return true;
  }
  spawnSparks(state, enemy.x, enemy.y, 0.8, '#f1c40f', 3);
  return false;
}

// Fire one shot from (x, y) along angle. from is 'player' or 'enemy';
// weaponName overrides the player's equipped weapon (enemies use 'pistol').
// Player shots consume ammo; enemy shots never touch the player's ammo.
// Returns true when a bullet actually left the barrel.
export function fireWeapon(state, x, y, angle, from, weaponName) {
  const who = from || 'player';
  const name = weaponName || (who === 'player' ? state.player.weapon : 'pistol');
  if (name === 'fists') return false;
  const spec = WEAPONS[name];
  if (!spec) return false;
  if (who === 'player') {
    if (state.player.ammo <= 0) return false;
    state.player.ammo -= 1;
  }
  const speed = BULLET_SPEED[name] || 900;
  const z = who === 'player' ? (state.player.onFoot ? 1.3 : 1.0) : 1.3;
  state.bullets.push({
    x: x + Math.cos(angle) * 22,
    y: y + Math.sin(angle) * 22,
    z,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    life: BULLET_LIFE,
    from: who,
    dmg: spec.damage,
    weapon: name,
  });
  return true;
}

export function stepBullets(state, dt) {
  const buildings = (state.city && state.city.buildings) || [];
  const keep = [];
  for (const b of state.bullets) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    if (b.life <= 0) continue;
    if (b.x < 0 || b.y < 0 || b.x > 4096 || b.y > 4096) continue;
    if (pointInBuilding(buildings, b.x, b.y)) {
      spawnSparks(state, b.x, b.y, b.z, '#bdc3c7', 4);
      continue;
    }
    let consumed = false;
    if (b.from === 'player') {
      for (const e of state.enemies) {
        if (e.hp > 0 && Math.hypot(e.x - b.x, e.y - b.y) < 18) {
          damageEnemy(state, e, b.dmg);
          consumed = true;
          break;
        }
      }
      if (!consumed) {
        for (const ped of state.peds) {
          if (ped.state !== 'down' && Math.hypot(ped.x - b.x, ped.y - b.y) < 16) {
            damagePed(state, ped, b.dmg, 'player');
            consumed = true;
            break;
          }
        }
      }
      if (!consumed) {
        for (const car of state.cars) {
          if (car.driver === 'player') continue;
          if (Math.hypot(car.x - b.x, car.y - b.y) < 30) {
            car.hp -= b.dmg;
            spawnSparks(state, b.x, b.y, b.z, '#f39c12', 5);
            if (car.hp <= 0) {
              spawnSparks(state, car.x, car.y, 1, '#e74c3c', 16);
              car.hp = 0;
              car.driver = 'parked';
              car.speed = 0;
            }
            consumed = true;
            break;
          }
        }
      }
    } else {
      // Enemy fire can only hurt the player.
      const p = state.player;
      if (p.alive && Math.hypot(p.x - b.x, p.y - b.y) < 18) {
        p.health -= b.dmg;
        spawnSparks(state, p.x, p.y, 1, '#e74c3c', 5);
        consumed = true;
      }
    }
    if (!consumed) keep.push(b);
  }
  state.bullets = keep;
  // The dead leave the field: enemies at 0 hp are removed here so mission
  // code can count survivors by simply looking at state.enemies.
  state.enemies = state.enemies.filter((e) => e.hp > 0);
}

// A close-range swing from (x, y) facing angle. 20 damage, a knockback shove
// and, on a connect, a 10 px lunge toward the target — cancelled when the
// lunge destination sits inside a building footprint. Returns true on a hit.
export function punchAttack(state, x, y, angle) {
  const range = WEAPONS.fists.range;
  const buildings = (state.city && state.city.buildings) || [];
  let best = null;
  let bestD = Infinity;
  const consider = (tx, ty) => {
    const dx = tx - x;
    const dy = ty - y;
    const d = Math.hypot(dx, dy);
    if (d > range + 14 || d >= bestD) return;
    const dot = Math.cos(angle) * (dx / (d || 1)) + Math.sin(angle) * (dy / (d || 1));
    if (dot < 0.2) return;
    bestD = d;
    best = { tx, ty, dx, dy, d };
  };
  for (const e of state.enemies) {
    if (e.hp > 0) consider(e.x, e.y);
  }
  for (const ped of state.peds) {
    if (ped.state !== 'down') consider(ped.x, ped.y);
  }
  if (!best) return false;

  const nx = best.dx / (best.d || 1);
  const ny = best.dy / (best.d || 1);
  // Knock the target back 18 px unless a wall is in the way.
  const kx = best.tx + nx * 18;
  const ky = best.ty + ny * 18;
  let hitEnemy = null;
  let hitPed = null;
  for (const e of state.enemies) {
    if (e.hp > 0 && e.x === best.tx && e.y === best.ty) hitEnemy = e;
  }
  for (const ped of state.peds) {
    if (ped.state !== 'down' && ped.x === best.tx && ped.y === best.ty) hitPed = ped;
  }
  if (hitEnemy) {
    if (!pointInBuilding(buildings, kx, ky)) {
      hitEnemy.x = kx;
      hitEnemy.y = ky;
    }
    damageEnemy(state, hitEnemy, WEAPONS.fists.damage);
  } else if (hitPed) {
    if (!pointInBuilding(buildings, kx, ky)) {
      hitPed.x = kx;
      hitPed.y = ky;
    }
    damagePed(state, hitPed, WEAPONS.fists.damage, 'player');
    if (hitPed.state !== 'down') hitPed.state = 'flee';
  }
  // Lunge the attacker 10 px toward the target, wall-checked.
  const lx = x + nx * 10;
  const ly = y + ny * 10;
  if (!pointInBuilding(buildings, lx, ly)) {
    state.player.x = lx;
    state.player.y = ly;
  }
  spawnSparks(state, best.tx, best.ty, 0.8, '#f1c40f', 4);
  return true;
}
