export const WORLD = { width: 4096, height: 4096 };

export const VIEW = { width: 1280, height: 720 };

export const STEP = 1 / 60;

export const SAVE_KEY = 'velmora.save.v1';

export const THREE_VERSION = '0.187.0';

export const FONT = 'bold 16px system-ui, sans-serif';

export const PALETTE = {
  road: '#2b2b33',
  roadLine: '#e8e0c8',
  sidewalk: '#8a7f70',
  park: '#4f9e4d',
  beach: '#e8d9a0',
  ocean: '#2e7f8f',
  grass: '#5aa75a',
  hud: '#0d0d12',
  accent: '#f5b942',
  text: '#ffffff',
  muted: '#c9c9d1',
};

export const PLAYER = { radius: 14, walkSpeed: 220, health: 100 };

export const CAR = {
  accel: 520,
  brake: 700,
  maxSpeed: 520,
  reverseMax: 180,
  turn: 2.6,
  radius: 26,
};

export const TRAFFIC = { count: 14, speedMin: 120, speedMax: 220 };

export const PED = { count: 18, walkSpeed: 60 };

export const POLICE = { carSpeed: 560, copSpeed: 200 };

export const WANTED = { max: 5, decayAfter: 12, decayEvery: 8, policeRadius: 400 };

export const WEAPONS = {
  fists: { damage: 20, range: 46, rate: 0.45, name: 'FISTS' },
  pistol: { damage: 34, range: 520, rate: 0.32, name: 'PISTOL', ammo: 12 },
  smg: { damage: 18, range: 460, rate: 0.09, name: 'SMG', ammo: 30 },
};

export const PRICES = {
  spray: 150,
  pistol: 200,
  smg: 350,
  ammo: 50,
  taxiMin: 60,
  taxiMax: 150,
  stashMin: 100,
  stashMax: 400,
  healthPickup: 40,
  ammoPickup: 24,
};

export const DISTRICTS = [
  { name: 'Old Town', x0: 0, y0: 0, x1: 2048, y1: 2048 },
  { name: 'Downtown', x0: 2048, y0: 0, x1: 4096, y1: 2048 },
  { name: 'Marina', x0: 0, y0: 2048, x1: 2048, y1: 4096 },
  { name: 'Docks', x0: 2048, y0: 2048, x1: 4096, y1: 4096 },
];

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

export const CAMERA3D = {
  follow: { dist: 210, height: 175 },
  chase: { dist: 330, height: 190 },
  high: { dist: 1800, angle: 57 },
  fov: 55,
  fovKick: 12,
  shadow: 2048,
  fogNear: 2000,
  fogFar: 6500,
};
