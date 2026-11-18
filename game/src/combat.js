// VELMORA — Sunset Streets: combat.
//
// Bullets, fists and damage. fireWeapon spawns one bullet from the shooter's
// position; stepBullets moves every bullet and resolves hits against enemies,
// pedestrians, cars and buildings; punchAttack is the close-range swing.
// Kills are counted here (enemies only — see below) and a cash pickup is
// dropped on every second enemy kill, deterministically, so replays agree.
// Killing a cop pedestrian does not raise wanted here; it sets
// state._copKilled and the world module turns that into the wanted bump.
import { EVENT_HIT, EVENT_PUNCH, WEAPONS, WORLD } from './config.js';

const BULLET_SPEED = 900;
const BULLET_LIFE = 0.9;
const ENEMY_HIT_RADIUS = 18;
const PED_HIT_RADIUS = 16;
const PLAYER_HIT_RADIUS = 18;
const CAR_HIT_RADIUS = 30;
const PUNCH_RANGE = 56;
const PUNCH_DAMAGE = 20;
const PUNCH_ARC = 0.5; // cos(60 deg): target must be roughly in front
const ENEMY_BULLET_DAMAGE = 20;

function worldWidth() {
  return (WORLD && WORLD.width) || 4096;
}

function worldHeight() {
  return (WORLD && WORLD.height) || 4096;
}

function weaponStats(name) {
  const table = WEAPONS || {};
  if (name === 'smg') {
    const w = table.smg || {};
    return { damage: typeof w.damage === 'number' ? w.damage : 18 };
  }
  const w = table.pistol || {};
  return { damage: typeof w.damage === 'number' ? w.damage : 34 };
}

function addParticle(state, x, y, color) {
  if (!state || !Array.isArray(state.particles)) return;
  state.particles.push({ x, y, vx: 0, vy: 0, life: 0.35, color, size: 3 });
}

function dropCash(state, x, y) {
  if (!state || !Array.isArray(state.pickups)) return;
  state.pickups.push({ x, y, kind: 'cash' });
}

function pointInBuilding(state, x, y) {
  const city = state && state.city;
  if (!city || !Array.isArray(city.buildings)) return false;
  for (const b of city.buildings) {
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return true;
  }
  return false;
}

// Remove enemy `at` from state.enemies, count the kill and maybe drop cash.
function killEnemy(state, at) {
  const enemy = state.enemies[at];
  state.enemies.splice(at, 1);
  if (state.stats) state.stats.kills = (state.stats.kills || 0) + 1;
  addParticle(state, enemy.x, enemy.y, '#e5534b');
  // Every second enemy kill leaves a cash pickup behind.
  if (state.stats && state.stats.kills % 2 === 0) dropCash(state, enemy.x, enemy.y);
}

// Drop a pedestrian: mark them down (they stay in the world as a body) and,
// if they were a cop, flag it so the world module can raise wanted.
function killPed(state, ped) {
  ped.hp = 0;
  ped.state = 'down';
  addParticle(state, ped.x, ped.y, '#e5534b');
  if (ped.kind === 'cop') state._copKilled = true;
  // Deterministic "sometimes": about a third of peds drop cash, decided by
  // where they fell, never by a random roll.
  if (((ped.x + ped.y) | 0) % 3 === 0) dropCash(state, ped.x, ped.y);
}

// Fire one shot from (x, y) along `angle`. The shooter's weapon comes from
// state.player when `from` is 'player'; enemy shots use a fixed damage.
// Returns true only when a bullet actually left the barrel.
export function fireWeapon(state, x, y, angle, from) {
  if (!state || !Array.isArray(state.bullets)) return false;
  const side = from === 'enemy' ? 'enemy' : 'player';
  let damage = ENEMY_BULLET_DAMAGE;
  if (side === 'player') {
    const weapon = (state.player && state.player.weapon) || 'fists';
    if (weapon === 'fists') return false;
    if ((state.player.ammo || 0) <= 0) return false;
    state.player.ammo -= 1;
    damage = weaponStats(weapon).damage;
  }
  const muzzle = 22;
  // 3D muzzle height: 1.3 on foot, 1.0 from a car seat. Enemies are on foot.
  const muzzleZ = side === 'enemy' ? 1.3 : (state.player && !state.player.onFoot ? 1.0 : 1.3);
  state.bullets.push({
    x: x + Math.cos(angle) * muzzle,
    y: y + Math.sin(angle) * muzzle,
    z: muzzleZ,
    vx: Math.cos(angle) * BULLET_SPEED,
    vy: Math.sin(angle) * BULLET_SPEED,
    life: BULLET_LIFE,
    from: side,
    damage,
  });
  return true;
}

// Move every bullet one step and resolve its first hit. Returns EVENT_* flags
// (EVENT_HIT when anything is struck).
export function stepBullets(state, dt) {
  if (!state || !Array.isArray(state.bullets) || state.bullets.length === 0) return 0;
  let events = 0;
  const width = worldWidth();
  const height = worldHeight();
  for (let i = state.bullets.length - 1; i >= 0; i -= 1) {
    const bullet = state.bullets[i];
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
    bullet.life -= dt;
    if (bullet.life <= 0 || bullet.x < 0 || bullet.x > width || bullet.y < 0 || bullet.y > height) {
      state.bullets.splice(i, 1);
      continue;
    }
    if (pointInBuilding(state, bullet.x, bullet.y)) {
      addParticle(state, bullet.x, bullet.y, '#f2c94c');
      state.bullets.splice(i, 1);
      continue;
    }
    let hit = false;
    if (bullet.from === 'player') {
      // Enemies first.
      if (Array.isArray(state.enemies)) {
        for (let e = state.enemies.length - 1; e >= 0; e -= 1) {
          const enemy = state.enemies[e];
          const dx = enemy.x - bullet.x;
          const dy = enemy.y - bullet.y;
          if (dx * dx + dy * dy <= ENEMY_HIT_RADIUS * ENEMY_HIT_RADIUS) {
            enemy.hp -= bullet.damage;
            if (enemy.hp <= 0) killEnemy(state, e);
            else addParticle(state, bullet.x, bullet.y, '#e5534b');
            hit = true;
            break;
          }
        }
      }
      // Then pedestrians still on their feet.
      if (!hit && Array.isArray(state.peds)) {
        for (const ped of state.peds) {
          if (ped.state === 'down' || (ped.hp || 0) <= 0) continue;
          const dx = ped.x - bullet.x;
          const dy = ped.y - bullet.y;
          if (dx * dx + dy * dy <= PED_HIT_RADIUS * PED_HIT_RADIUS) {
            ped.hp = (ped.hp || 0) - bullet.damage;
            if (ped.hp <= 0) killPed(state, ped);
            else addParticle(state, bullet.x, bullet.y, '#e5534b');
            hit = true;
            break;
          }
        }
      }
      // Then cars — never the car the player is driving.
      if (!hit && Array.isArray(state.cars)) {
        for (const car of state.cars) {
          if (state.player && car === state.player.car) continue;
          const dx = car.x - bullet.x;
          const dy = car.y - bullet.y;
          if (dx * dx + dy * dy <= CAR_HIT_RADIUS * CAR_HIT_RADIUS) {
            car.hp = (car.hp || 0) - bullet.damage;
            if (car.hp <= 0) {
              car.hp = 0;
              addParticle(state, car.x, car.y, '#f28c28');
            } else {
              addParticle(state, bullet.x, bullet.y, '#f2c94c');
            }
            hit = true;
            break;
          }
        }
      }
    } else if (state.player) {
      // Enemy fire can only hurt the player.
      const dx = state.player.x - bullet.x;
      const dy = state.player.y - bullet.y;
      if (dx * dx + dy * dy <= PLAYER_HIT_RADIUS * PLAYER_HIT_RADIUS) {
        state.player.health = (state.player.health || 0) - bullet.damage;
        addParticle(state, bullet.x, bullet.y, '#e5534b');
        hit = true;
      }
    }
    if (hit) {
      events |= EVENT_HIT;
      state.bullets.splice(i, 1);
    }
  }
  return events;
}

// A close-range swing from (x, y) facing `angle`: 20 damage to living
// targets roughly in front of the attacker, shoved away from the swing.
// Returns EVENT_PUNCH always, plus EVENT_HIT when something is struck.
export function punchAttack(state, x, y, angle) {
  if (!state) return 0;
  let events = EVENT_PUNCH;
  const reach = PUNCH_RANGE * PUNCH_RANGE;
  const ax = Math.cos(angle);
  const ay = Math.sin(angle);
  // 3D lunge: on the first landed hit the attacker nudges a short step
  // toward the target — a small position offset, never through a wall.
  let lunged = false;
  function lunge(target) {
    if (lunged || !state.player) return;
    lunged = true;
    const dx = target.x - x;
    const dy = target.y - y;
    const dist = Math.hypot(dx, dy) || 1;
    const nx = Math.min(worldWidth(), Math.max(0, state.player.x + (dx / dist) * 10));
    const ny = Math.min(worldHeight(), Math.max(0, state.player.y + (dy / dist) * 10));
    if (pointInBuilding(state, nx, ny)) return;
    state.player.x = nx;
    state.player.y = ny;
  }

  function strike(target, isEnemy, index) {
    const dx = target.x - x;
    const dy = target.y - y;
    const distSq = dx * dx + dy * dy;
    if (distSq > reach) return false;
    const dist = Math.sqrt(distSq) || 1;
    // Target must be inside the forward arc.
    if ((dx / dist) * ax + (dy / dist) * ay < PUNCH_ARC) return false;
    target.hp = (target.hp || 0) - PUNCH_DAMAGE;
    // Knockback: shove the target away from the attacker, kept in the world.
    const push = 26;
    target.x = Math.min(worldWidth(), Math.max(0, target.x + (dx / dist) * push));
    target.y = Math.min(worldHeight(), Math.max(0, target.y + (dy / dist) * push));
    lunge(target);
    if (target.hp <= 0) {
      if (isEnemy) killEnemy(state, index);
      else killPed(state, target);
    } else {
      addParticle(state, target.x, target.y, '#e5534b');
    }
    return true;
  }

  if (Array.isArray(state.enemies)) {
    for (let e = state.enemies.length - 1; e >= 0; e -= 1) {
      if (strike(state.enemies[e], true, e)) events |= EVENT_HIT;
    }
  }
  if (Array.isArray(state.peds)) {
    for (const ped of state.peds) {
      if (ped.state === 'down' || (ped.hp || 0) <= 0) continue;
      if (strike(ped, false, -1)) events |= EVENT_HIT;
    }
  }
  return events;
}
