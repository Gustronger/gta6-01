// main.js — boot and game loop for VELMORA: Sunset Streets (3D).
// Parses ?shot and ?seed, builds the seeded world, wires the renderer,
// input, audio and save together, and runs the fixed 1/60 s loop.
// The 3D view itself lives in render.js (which owns scene3d.js); this
// file never imports scene3d directly.

import { STEP, CAMERA3D, EVENT_SHOT, EVENT_PUNCH, EVENT_PICKUP, EVENT_CRASH, EVENT_WANTED_UP, EVENT_WANTED_DOWN, EVENT_MISSION, EVENT_MISSION_DONE, EVENT_BUSTED, EVENT_WASTED, EVENT_STEAL, EVENT_HIT } from './config.js';
import { createRandom } from './random.js';
import { createCity } from './city.js';
import { createWorld } from './world.js';
import { createAudio } from './audio.js';
import { loadSave, saveGame } from './save.js';
import { createRenderer, SCREEN_TITLE, SCREEN_PLAY, SCREEN_PAUSED, SCREEN_OVER } from './render.js';
import { createInput } from './input.js';
// shots.js is loaded dynamically below so the boot works whether it
// exports stageShot as its default or as a named export.

const statusEl = document.getElementById('status');
const params = new URLSearchParams(location.search);
const shotName = params.get('shot');
const seedParam = Number(params.get('seed'));
const seed = Number.isFinite(seedParam) && seedParam !== 0 ? Math.floor(Math.abs(seedParam)) : 20261118;

const saved = loadSave();
const audio = createAudio();
if (saved && saved.muted) audio.setMuted(true);

const canvas = document.getElementById('gl') || document.getElementById('game') || document.querySelector('canvas');
const renderer = createRenderer(canvas);
const world = createWorld(createRandom(seed), createCity(createRandom(seed + 7)));
const input = createInput(canvas, renderer.screenToWorld.bind(renderer));

// Restore the saved camera and cash; missions restart from the beginning.
let bestCash = saved ? saved.bestCash : 0;
if (saved) {
  world.state.player.cash = Math.max(world.state.player.cash, saved.cash || 0);
  if (saved.camera) {
    world.state.camera.mode = saved.camera.mode;
    world.state.camera.dist = saved.camera.dist;
    world.state.camera.locked = true;
  }
}

let screen = SCREEN_TITLE;
let overKind = null;
let message = '';
let messageTimer = 0;
let uiSave = saved;
let accumulator = 0;
let lastTime = performance.now();
let shotStaged = false;

function announce(text) {
  message = text;
  messageTimer = 4;
  if (statusEl) statusEl.textContent = text;
}

function persist() {
  const state = world.state;
  bestCash = Math.max(bestCash, state.player.cash);
  const record = {
    missionsDone: state.stats.missionsDone,
    cash: state.player.cash,
    bestCash,
    muted: audio.muted,
    camera: { mode: state.camera.mode, dist: state.camera.dist },
  };
  saveGame(record);
  uiSave = record;
}

function applyCameraInput(inp) {
  const cam = world.state.camera;
  if (inp.zoomDelta) {
    cam.dist = Math.max(160, Math.min(1400, cam.dist + inp.zoomDelta * -40));
    cam.locked = true;
  }
  if (inp.camCycle) {
    const order = ['follow', 'chase', 'high'];
    const idx = order.indexOf(cam.mode);
    cam.mode = order[(idx + 1) % order.length];
    const preset = CAMERA3D[cam.mode];
    if (preset) cam.dist = preset.dist;
    cam.locked = true;
    announce('Camera: ' + cam.mode);
  }
}

function handleEvents(flags) {
  if (!flags) return;
  const p = world.state.player;
  if (flags & EVENT_SHOT) audio.sfx('shot');
  if (flags & EVENT_PUNCH) audio.sfx('punch');
  if (flags & EVENT_CRASH) audio.sfx('crash');
  if (flags & EVENT_STEAL) {
    audio.sfx('steal');
    announce('Car stolen — the VPD has been tipped off.');
  }
  if (flags & EVENT_PICKUP) {
    audio.sfx('pickup');
    announce('Picked up — cash $' + p.cash + '.');
  }
  if (flags & EVENT_HIT) audio.sfx('crash');
  if (flags & EVENT_WANTED_UP) {
    audio.sfx('siren');
    announce('Wanted level ' + p.wanted + ' — VPD on your tail!');
  }
  if (flags & EVENT_WANTED_DOWN) announce('Heat dying down — wanted level ' + p.wanted + '.');
  if (flags & EVENT_MISSION) {
    audio.sfx('mission');
    announce(world.state.mission.objective || 'New objective.');
  }
  if (flags & EVENT_MISSION_DONE) {
    audio.sfx('cash');
    announce(world.state.mission.objective || 'Mission complete!');
    persist();
  }
  if (flags & EVENT_BUSTED) {
    audio.sfx('busted');
    overKind = 'busted';
    screen = SCREEN_OVER;
    persist();
  }
  if (flags & EVENT_WASTED) {
    audio.sfx('wasted');
    overKind = 'wasted';
    screen = SCREEN_OVER;
    persist();
  }
}

function drawFrame() {
  const ui = {
    best: bestCash,
    save: uiSave,
    message: messageTimer > 0 ? message : '',
    overKind,
  };
  renderer.draw(world.state, screen, ui);
}

function frame(now) {
  requestAnimationFrame(frame);
  const elapsed = Math.min(0.25, (now - lastTime) / 1000);
  lastTime = now;
  const inp = input.read();

  if (inp.mute) {
    audio.setMuted(!audio.muted);
    announce(audio.muted ? 'Sound muted.' : 'Sound on.');
  }
  if (screen === SCREEN_PLAY && inp.pause) {
    screen = SCREEN_PAUSED;
    audio.musicStop();
    audio.siren(false);
    announce('Paused — press P to resume.');
  } else if (screen === SCREEN_PAUSED && (inp.pause || inp.confirm)) {
    screen = SCREEN_PLAY;
    message = '';
    messageTimer = 0;
    if (statusEl) statusEl.textContent = '';
    audio.ensure();
    audio.musicStart();
  }

  if (screen === SCREEN_TITLE) {
    if (inp.confirm) {
      screen = SCREEN_PLAY;
      audio.ensure();
      audio.musicStart();
      announce(world.state.mission.objective || 'Welcome to Velmora.');
    }
  } else if (screen === SCREEN_PLAY) {
    applyCameraInput(inp);
    accumulator += elapsed;
    let guard = 0;
    let stepInput = inp;
    while (accumulator >= STEP && guard < 8) {
      accumulator -= STEP;
      guard += 1;
      const flags = world.step(STEP, stepInput);
      handleEvents(flags);
      if (screen !== SCREEN_PLAY) break;
      // Edge flags fire once: later catch-up steps in this frame see them off.
      stepInput = { ...inp, enter: false, shoot: false, punch: false, confirm: false, pause: false, mute: false, camCycle: false, zoomDelta: 0 };
    }
    if (guard >= 8) accumulator = 0;
    if (messageTimer > 0) messageTimer -= elapsed;
    const p = world.state.player;
    audio.engine(p.speed, !p.onFoot);
    audio.siren(p.wanted > 0 && screen === SCREEN_PLAY);
  } else if (screen === SCREEN_OVER) {
    if (inp.confirm) {
      world.reset();
      overKind = null;
      screen = SCREEN_TITLE;
      bestCash = Math.max(bestCash, 0);
    }
  }

  drawFrame();
}

async function bootShot() {
  const mod = await import('./shots.js');
  const stageShot = mod.default || mod.stageShot;
  const staged = stageShot(shotName, world);
  screen = staged.screen || SCREEN_TITLE;
  if (staged.best) bestCash = staged.best;
  if (world.state.camera) world.state.camera.locked = true;
  drawFrame();
  drawFrame();
  window.__shotReady = true;
  shotStaged = true;
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden && screen === SCREEN_PLAY) {
    screen = SCREEN_PAUSED;
    audio.musicStop();
    audio.siren(false);
  }
});

if (shotName) {
  bootShot();
} else {
  void shotStaged;
  requestAnimationFrame(frame);
}
