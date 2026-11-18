// Drawing only: the world's state and the current screen in, pixels out. The
// world itself is now real 3D — scene3d.js renders it into the #gl WebGL
// canvas behind this one — while the HUD, minimap and panels are still drawn
// on this 2D canvas in logical 1280x720 space, exactly as in v1. Colours come
// from config's PALETTE where it defines them; every colour has a sun-soaked
// fallback so a palette gap never blanks the frame.
//
// createRenderer(glCanvas, hudCanvas) — with one argument (the HUD canvas,
// as main.js calls it) the GL canvas is looked up as #gl. screenToWorld
// raycasts through the 3D camera onto the ground plane.

import { CAR, FONT, PALETTE, VIEW, WORLD } from './config.js';
import { createScene3D } from './scene3d.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

const VIEW_W = (VIEW && VIEW.width) || 1280;
const VIEW_H = (VIEW && VIEW.height) || 720;
const WORLD_W = (WORLD && WORLD.width) || 4096;
const WORLD_H = (WORLD && WORLD.height) || 4096;

// Palette with a fallback for every key, so the frame survives a sparse config.
const P = PALETTE || {};
const C = {
  backdrop: P.backdrop ?? '#171226',
  ground: P.ground ?? '#c98d5f',
  ocean: P.ocean ?? '#2a6f8e',
  oceanDeep: P.oceanDeep ?? '#1f5570',
  sand: P.sand ?? '#e8c98f',
  road: P.road ?? '#3a3a44',
  sidewalk: P.sidewalk ?? '#b9a58c',
  lane: P.lane ?? '#e8d27a',
  park: P.park ?? '#5d9b4a',
  tree: P.tree ?? '#3d7a33',
  treeLight: P.treeLight ?? '#79b657',
  shadow: P.shadow ?? 'rgba(20, 10, 30, 0.35)',
  roofLine: P.roofLine ?? 'rgba(255,255,255,0.25)',
  text: P.text ?? '#fff6e8',
  muted: P.muted ?? '#d8c9b0',
  accent: P.accent ?? '#ffc94d',
  panel: P.panel ?? 'rgba(24, 16, 36, 0.88)',
  panelEdge: P.panelEdge ?? '#ffc94d',
  health: P.health ?? '#58d68d',
  healthLow: P.healthLow ?? '#ff5a4e',
  healthBg: P.healthBg ?? 'rgba(0,0,0,0.55)',
  star: P.star ?? '#ffc94d',
  starEmpty: P.starEmpty ?? 'rgba(255,255,255,0.6)',
  cash: P.cash ?? '#7be382',
  danger: P.danger ?? '#ff5a4e',
  marker: P.marker ?? '#ffcf3f',
  policeRed: P.policeRed ?? '#ff3b30',
  policeBlue: P.policeBlue ?? '#2f7bff',
  policeBody: P.policeBody ?? '#f2f2f2',
  pedShirt: P.pedShirt ?? '#e8e0d0',
  copBlue: P.copBlue ?? '#2f5fd0',
  gangRed: P.gangRed ?? '#c0392b',
  bullet: P.bullet ?? '#ffe9a3',
  minimapBg: P.minimapBg ?? 'rgba(16, 12, 28, 0.78)',
  minimapRoad: P.minimapRoad ?? '#8a8a96',
  minimapEdge: P.minimapEdge ?? 'rgba(255,255,255,0.4)',
  playerArrow: P.playerArrow ?? '#ffffff',
  policeDot: P.policeDot ?? '#4da3ff',
  garageIcon: P.garageIcon ?? '#ffc94d',
};

const FONT_FAMILY = FONT || 'system-ui, -apple-system, "Segoe UI", sans-serif';
const MINIMAP = 220;
const MINIMAP_MARGIN = 16;

function money(amount) {
  const value = Math.round(amount || 0);
  return '$' + value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function createRenderer(glCanvas, hudCanvas) {
  // One-argument call (main.js): the argument is the HUD canvas (#game) and
  // the GL canvas is the #gl element stacked behind it.
  const hud = hudCanvas || glCanvas;
  const gl = hudCanvas ? glCanvas : (document.getElementById('gl') || glCanvas);
  const ctx = hud.getContext('2d');
  // view: how the logical 1280x720 maps onto the real canvas (device pixels).
  const view = { scale: 1, x: 0, y: 0, ratio: 1 };
  const fonts = new Map();
  // The 3D scene, built lazily on the first draw once state.city is known.
  let scene3d = null;
  let lastT = 0;

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    hud.width = width;
    hud.height = height;
    view.ratio = ratio;
    view.scale = Math.min(width / VIEW_W, height / VIEW_H);
    view.x = (width - VIEW_W * view.scale) / 2;
    view.y = (height - VIEW_H * view.scale) / 2;
  }

  function font(size, weight) {
    const key = size + '/' + (weight || '');
    if (!fonts.has(key)) fonts.set(key, (weight ? weight + ' ' : '') + size + 'px ' + FONT_FAMILY);
    return fonts.get(key);
  }

  function text(value, x, y, size, color, align, weight) {
    ctx.font = font(size, weight);
    ctx.fillStyle = color;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(value, x, y);
  }

  function clamp(value, min, max) {
    return value < min ? min : value > max ? max : value;
  }

  // ---- HUD + screens (drawn in logical view coords) ----

  function drawHud(state, ui) {
    const player = state.player;
    const time = state.time || 0;
    // Cash + health, top-left.
    ctx.fillStyle = C.healthBg;
    ctx.fillRect(14, 12, 240, 58);
    text(money(player.cash), 24, 36, 26, C.cash, 'left', 'bold');
    const healthW = 220;
    const healthFrac = clamp((player.health || 0) / 100, 0, 1);
    ctx.fillStyle = '#00000088';
    ctx.fillRect(24, 46, healthW, 12);
    ctx.fillStyle = healthFrac > 0.3 ? C.health : C.healthLow;
    ctx.fillRect(24, 46, healthW * healthFrac, 12);
    // Wanted stars, top-right, on a dark plate so they read over bright towers.
    const wanted = clamp(player.wanted || 0, 0, 5);
    const starsRight = VIEW_W - 24;
    const starsLeft = starsRight - 5 * 30;
    ctx.font = font(16, 'bold');
    const labelW = ctx.measureText('WANTED').width;
    const wantedPlateX = starsLeft - 8 - labelW - 12;
    ctx.fillStyle = C.healthBg;
    ctx.fillRect(wantedPlateX, 10, VIEW_W - 12 - wantedPlateX, 44);
    for (let s = 0; s < 5; s += 1) {
      text(s < wanted ? '★' : '☆', starsRight - s * 30, 40, 28, s < wanted ? C.star : C.starEmpty, 'right');
    }
    text('WANTED', starsLeft - 8, 36, 16, C.muted, 'right', 'bold');
    // Objective banner, top-centre.
    const mission = state.mission;
    if (mission && mission.objective) {
      const label = mission.objective.length > 64 ? mission.objective.slice(0, 61) + '…' : mission.objective;
      ctx.font = font(20, 'bold');
      const w = Math.min(ctx.measureText(label).width + 36, VIEW_W - 560);
      ctx.fillStyle = C.panel;
      ctx.fillRect((VIEW_W - w) / 2, 12, w, 40);
      ctx.strokeStyle = C.panelEdge;
      ctx.lineWidth = 2;
      ctx.strokeRect((VIEW_W - w) / 2, 12, w, 40);
      text(label, VIEW_W / 2, 40, 20, C.text, 'center', 'bold');
    }
    // Transient mission card / announcement under the banner.
    if (ui && ui.message) {
      ctx.font = font(22, 'bold');
      const w = Math.min(ctx.measureText(ui.message).width + 40, VIEW_W - 200);
      ctx.fillStyle = C.panel;
      ctx.fillRect((VIEW_W - w) / 2, 60, w, 44);
      ctx.strokeStyle = C.accent;
      ctx.lineWidth = 2;
      ctx.strokeRect((VIEW_W - w) / 2, 60, w, 44);
      text(ui.message, VIEW_W / 2, 90, 22, C.accent, 'center', 'bold');
    }
    drawMinimap(state);
    // Bottom-right HUD, on a dark plate so road markings never show through
    // the text. Car speed is px/s (CAR.maxSpeed is full speed); show it as a
    // road speed with full speed at 180 km/h, not the raw px/s number. The
    // weapon readout is hidden while driving — fists need no HUD slot there.
    const driving = !player.onFoot && player.car;
    if (driving) {
      const kmh = Math.min(180, Math.round(Math.abs(player.car.speed || 0) * 180 / (CAR.maxSpeed || 640)));
      const speedLabel = kmh + ' km/h';
      ctx.font = font(20);
      const speedW = ctx.measureText(speedLabel).width;
      ctx.fillStyle = C.healthBg;
      ctx.fillRect(VIEW_W - 24 - speedW - 16, VIEW_H - 92, speedW + 36, 44);
      text(speedLabel, VIEW_W - 24, VIEW_H - 56, 20, C.muted, 'right');
    } else {
      const weapon = (player.weapon || 'fists').toUpperCase();
      const ammo = player.weapon === 'fists' ? '∞' : String(player.ammo || 0);
      const weaponLabel = weapon + '  ' + ammo;
      ctx.font = font(24, 'bold');
      const weaponW = ctx.measureText(weaponLabel).width;
      ctx.fillStyle = C.healthBg;
      ctx.fillRect(VIEW_W - 24 - weaponW - 16, VIEW_H - 60, weaponW + 36, 48);
      text(weaponLabel, VIEW_W - 24, VIEW_H - 24, 24, C.text, 'right', 'bold');
    }
    // Controls hint, fading out over the first seconds of play.
    if (time < 12) {
      const hint = 'WASD move / drive   •   E enter car   •   Click shoot   •   Space punch   •   P pause   •   M mute';
      ctx.font = font(17);
      const hintW = ctx.measureText(hint).width;
      ctx.globalAlpha = clamp((12 - time) / 4, 0, 1) * 0.9;
      ctx.fillStyle = C.healthBg;
      ctx.fillRect((VIEW_W - hintW) / 2 - 14, VIEW_H - 48, hintW + 28, 30);
      text(hint, VIEW_W / 2, VIEW_H - 24, 17, C.text, 'center');
      ctx.globalAlpha = 1;
    }
  }

  function drawMinimap(state) {
    const city = state.city || {};
    const x0 = MINIMAP_MARGIN;
    const y0 = VIEW_H - MINIMAP_MARGIN - MINIMAP;
    const scale = MINIMAP / WORLD_W;
    ctx.fillStyle = C.minimapBg;
    ctx.fillRect(x0, y0, MINIMAP, MINIMAP);
    ctx.strokeStyle = C.minimapEdge;
    ctx.lineWidth = 1;
    ctx.strokeRect(x0, y0, MINIMAP, MINIMAP);
    // Roads.
    ctx.strokeStyle = C.minimapRoad;
    ctx.lineWidth = 2;
    const roads = city.roads || [];
    for (let i = 0; i < roads.length; i += 1) {
      const r = roads[i];
      ctx.beginPath();
      ctx.moveTo(x0 + r.x1 * scale, y0 + r.y1 * scale);
      ctx.lineTo(x0 + r.x2 * scale, y0 + r.y2 * scale);
      ctx.stroke();
    }
    // Beach line along the south edge.
    const beachY = (city.beach && city.beach.y0) || 3904;
    ctx.strokeStyle = C.ocean;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x0, y0 + beachY * scale);
    ctx.lineTo(x0 + MINIMAP, y0 + beachY * scale);
    ctx.stroke();
    // Garages.
    const garages = city.garages || [];
    ctx.fillStyle = C.garageIcon;
    for (let i = 0; i < garages.length; i += 1) {
      ctx.fillRect(x0 + garages[i].x * scale - 3, y0 + garages[i].y * scale - 3, 6, 6);
    }
    // Mission blip, pulsing.
    const mission = state.mission;
    if (mission && mission.marker) {
      const pulse = 3 + Math.sin((state.time || 0) * 5) * 1.5;
      ctx.fillStyle = C.marker;
      ctx.beginPath();
      ctx.arc(x0 + mission.marker.x * scale, y0 + mission.marker.y * scale, pulse + 2, 0, Math.PI * 2);
      ctx.fill();
    }
    // Police dots.
    ctx.fillStyle = C.policeDot;
    const cars = state.cars || [];
    for (let i = 0; i < cars.length; i += 1) {
      if (cars[i].kind !== 'police') continue;
      ctx.beginPath();
      ctx.arc(x0 + cars[i].x * scale, y0 + cars[i].y * scale, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // Player arrow.
    const player = state.player;
    if (player) {
      ctx.save();
      ctx.translate(x0 + player.x * scale, y0 + player.y * scale);
      ctx.rotate(player.angle || 0);
      ctx.fillStyle = C.playerArrow;
      ctx.beginPath();
      ctx.moveTo(7, 0);
      ctx.lineTo(-5, -5);
      ctx.lineTo(-5, 5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  function drawPanel(title, lines, prompt, accent, top) {
    const lineH = 32;
    const height = 150 + lines.length * lineH + 70;
    const width = 640;
    const x = (VIEW_W - width) / 2;
    const y = typeof top === 'number' ? top : (VIEW_H - height) / 2;
    ctx.fillStyle = C.panel;
    ctx.fillRect(x, y, width, height);
    ctx.strokeStyle = accent || C.panelEdge;
    ctx.lineWidth = 3;
    ctx.strokeRect(x, y, width, height);
    text(title, VIEW_W / 2, y + 72, 52, C.text, 'center', 'bold');
    for (let i = 0; i < lines.length; i += 1) {
      text(lines[i], VIEW_W / 2, y + 128 + i * lineH, 20, C.muted, 'center');
    }
    text(prompt, VIEW_W / 2, y + height - 34, 22, C.accent, 'center', 'bold');
  }

  function drawTitle(state, ui) {
    // Dim the living 3D city behind the title.
    ctx.fillStyle = 'rgba(16, 10, 28, 0.55)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    text('VELMORA', VIEW_W / 2, 108, 84, C.accent, 'center', 'bold');
    text('S U N S E T   S T R E E T S', VIEW_W / 2, 146, 24, C.text, 'center', 'bold');
    const lines = [
      'Milo Vane, getaway driver, owes a debt he cannot pay.',
      'Fixer Nadia Sol has five jobs that can buy his freedom.',
      'The VPD and the Cobras will not make it easy.',
      '',
      'WASD / arrows — move and drive      E — enter a car, talk, buy',
      'Mouse — aim, click to shoot          Space — punch',
      'P / Esc — pause                      M — mute',
    ];
    const save = ui && ui.save;
    const saveLine = save
      ? 'Missions done: ' + (save.missionsDone || 0) + '    •    Best cash: ' + money(save.bestCash || 0)
      : 'No save yet — a fresh start in Velmora.';
    drawPanel('THE JOB', lines.concat(['', saveLine]), 'Press Enter or click to start', undefined, 176);
  }

  function drawPaused() {
    ctx.fillStyle = 'rgba(16, 10, 28, 0.6)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    drawPanel('PAUSED', ['The city waits for no one — except now.', 'Milo is catching his breath.'], 'Press P or Enter to keep driving');
  }

  function drawOver(state, ui) {
    const kind = (ui && ui.overKind) || 'wasted';
    const title = kind === 'busted' ? 'BUSTED' : 'WASTED';
    const stats = state.stats || {};
    const lines = [
      kind === 'busted' ? 'Commissioner Hale\'s VPD finally caught up with Milo.' : 'Milo went down in the streets of Velmora.',
      '',
      'Cash: ' + money(state.player ? state.player.cash : 0) + '    •    Missions done: ' + (stats.missionsDone || 0),
      'Cars stolen: ' + (stats.carsStolen || 0) + '    •    Takedowns: ' + (stats.kills || 0),
    ];
    ctx.fillStyle = 'rgba(16, 10, 28, 0.6)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    drawPanel(title, lines, 'Press Enter or click to try again', kind === 'busted' ? C.policeBlue : C.danger);
  }

  /** Paint one frame for `screen`, over the world in `state`. */
  function draw(state, screen, ui) {
    resize();
    if (!scene3d && state.city && gl) {
      scene3d = createScene3D(gl, state.city);
    }
    // The 3D world renders synchronously into the GL canvas first.
    const now = performance.now();
    const dt = lastT ? Math.min((now - lastT) / 1000, 0.1) : 0;
    lastT = now;
    if (scene3d) scene3d.sync(state, dt);
    // HUD / screens in logical view space, on the transparent HUD canvas.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, hud.width, hud.height);
    ctx.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    if (screen === SCREEN_TITLE) {
      drawTitle(state, ui);
      return;
    }
    drawHud(state, ui);
    if (screen === SCREEN_PAUSED) drawPaused();
    else if (screen === SCREEN_OVER) drawOver(state, ui);
  }

  /** Convert a screen point (CSS pixels relative to the canvas) to world coords. */
  function screenToWorld(sx, sy) {
    if (scene3d) return scene3d.screenToWorld(sx, sy, view);
    // No 3D scene yet (before the first draw): fall back to the city centre.
    return { x: WORLD_W / 2, y: WORLD_H / 2 };
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, screenToWorld };
}
