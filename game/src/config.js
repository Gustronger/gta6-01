// VELMORA — Sunset Streets: every tuning number, colour and table in one place.
// The world is a fixed 4096x4096 city; the renderer scales a 1280x720 logical
// view over it, so no rule below depends on the screen size.

export const WORLD = { width: 4096, height: 4096 };

export const VIEW = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second. */
export const STEP = 1 / 60;

/** Road lines and width, shared by the city builder and the traffic model. */
export const ROAD_LINES = [224, 672, 1120, 1568, 2016, 2464, 2912, 3360, 3808];
export const ROAD_WIDTH = 88;

export const PALETTE = {
  ocean: '#2f7fa8',
  oceanDeep: '#256b92',
  beach: '#e8d5a2',
  boardwalk: '#c9a06a',
  grass: '#5f9e52',
  parkDark: '#4c8a44',
  road: '#3a3f4a',
  roadEdge: '#2c303a',
  lane: '#e8d47a',
  sidewalk: '#9aa0ab',
  building: '#b98a68',
  house: '#c99a72',
  shop: '#d8b25e',
  tower: '#7fa8c9',
  towerGlass: '#9cc3de',
  warehouse: '#8a7f74',
  roof: '#6e4a3a',
  player: '#f2c94c',
  police: '#3f6fd8',
  taxi: '#f2c94c',
  text: '#f4efe6',
  muted: '#a8a294',
  hud: '#14161c',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the save lives between visits (this browser only). */
export const SAVE_KEY = 'velmora.save.v1';

export const PLAYER = {
  walkSpeed: 230,
  radius: 14,
  health: 100,
  enterRange: 64,
  punchRange: 36,
  punchDamage: 20,
  punchCooldown: 0.35,
  fireCooldown: 0.12,
  startCash: 200,
};

export const CAR = {
  length: 48,
  width: 26,
  radius: 21,
  accel: 540,
  reverseAccel: 320,
  brake: 760,
  maxSpeed: 640,
  maxReverse: 190,
  steerRate: 2.7,
  drag: 0.55,
  rollingDrag: 0.12,
  hp: 100,
  crashSpeed: 320,
  enterRange: 64,
};

export const TRAFFIC = {
  count: 26,
  parkedCount: 12,
  minSpeed: 130,
  maxSpeed: 230,
  turnChance: 0.22,
  followGap: 90,
};

export const PED = {
  count: 42,
  walkMin: 38,
  walkMax: 72,
  fleeSpeed: 150,
  radius: 11,
  taxiChance: 0.12,
};

export const POLICE = {
  carSpeed: 560,
  carAccel: 620,
  footSpeed: 185,
  punchDamage: 8,
  punchRange: 30,
  punchCooldown: 0.9,
  spawnDistance: 620,
  despawnDistance: 1400,
  ramDamage: 12,
};

export const WANTED = {
  max: 5,
  decayAfter: 12,
  decayInterval: 8,
  clearDistance: 400,
  steal: 1,
  hitPed: 1,
  shootPublic: 1,
  killCop: 1,
};

export const WEAPONS = {
  fists: { damage: 20, range: 36, rate: 0.35, bulletSpeed: 0, auto: false },
  pistol: { damage: 34, range: 520, rate: 0.3, bulletSpeed: 920, auto: false, startAmmo: 12 },
  smg: { damage: 18, range: 460, rate: 0.09, bulletSpeed: 980, auto: true, startAmmo: 24 },
};

export const PRICES = {
  spray: 150,
  pistol: 200,
  smg: 350,
  ammo: 50,
  ammoAmount: 24,
  taxiFareMin: 60,
  taxiFareMax: 150,
  cashPickupMin: 100,
  cashPickupMax: 400,
  healthPickup: 40,
  ammoPickup: 24,
};

export const DISTRICTS = [
  { id: 'oldtown', name: 'Old Town', x0: 0, y0: 0, x1: 2048, y1: 2048 },
  { id: 'downtown', name: 'Downtown', x0: 2048, y0: 0, x1: 4096, y1: 2048 },
  { id: 'marina', name: 'Marina', x0: 0, y0: 2048, x1: 2048, y1: 4096 },
  { id: 'docks', name: 'Docks', x0: 2048, y0: 2048, x1: 4096, y1: 4096 },
];

/** Event bit flags returned by world.step(). Combine with |. */
export const EVENT_SHOT = 1;
export const EVENT_PUNCH = 2;
export const EVENT_PICKUP = 4;
export const EVENT_CRASH = 8;
export const EVENT_WANTED_UP = 16;
export const EVENT_WANTED_DOWN = 32;
export const EVENT_MISSION = 64;
export const EVENT_MISSION_DONE = 128;
export const EVENT_BUSTED = 256;
export const EVENT_WASTED = 512;
export const EVENT_STEAL = 1024;
export const EVENT_HIT = 2048;
