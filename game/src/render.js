// VELMORA — Sunset Streets: 2D HUD over the 3D world.
// The world itself is drawn by scene3d.js (three.js); this module owns the
// canvas HUD, the minimap, the objective banner and every menu screen.
// Public surface (fixed by the game contract):
//   SCREEN_TITLE / SCREEN_PLAY / SCREEN_PAUSED / SCREEN_OVER
//   createRenderer(glCanvas, hudCanvas) -> { draw(state, screen, ui), screenToWorld(sx, sy) }
//     ui = { best, save, message, overKind: 'busted' | 'wasted' | null }

import { VIEW, PALETTE, FONT, CAR } from './config.js';
import { createScene3D } from './scene3d.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

// The config font is a family name; fall back to a plain stack when it is
// anything else, so a bad value can never break canvas text.
const FONT_FAMILY =
  typeof FONT === 'string' && FONT.length > 0 && !/[0-9]/.test(FONT)
    ? FONT
    : 'Trebuchet MS, Verdana, system-ui, sans-serif';

const MAP_SIZE = 208;
const MAP_MARGIN = 14;

function font(size, weight = 700) {
  return `${weight} ${size}px ${FONT_FAMILY}`;
}

function cash(n) {
  return '$' + Math.floor(n || 0).toLocaleString('en-US');
}

// Rounded-rect path helper (works even where roundRect is missing).
function rr(c, x, y, w, h, r) {
  const rad = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + rad, y);
  c.lineTo(x + w - rad, y);
  c.arcTo(x + w, y, x + w, y + rad, rad);
  c.lineTo(x + w, y + h - rad);
  c.arcTo(x + w, y + h, x + w - rad, y + h, rad);
  c.lineTo(x + rad, y + h);
  c.arcTo(x, y + h, x, y + h - rad, rad);
  c.lineTo(x, y + rad);
  c.arcTo(x, y, x + rad, y, rad);
  c.closePath();
}

// Dark translucent plate behind a HUD element, so text stays legible
// over the bright 3D sunset scene.
function plate(c, x, y, w, h, alpha = 0.72) {
  c.save();
  c.globalAlpha = alpha;
  c.fillStyle = PALETTE.hud;
  rr(c, x, y, w, h, 9);
  c.fill();
  c.restore();
}

function label(c, text, x, y, size, color, weight = 700, align = 'left') {
  c.save();
  c.font = font(size, weight);
  c.fillStyle = color;
  c.textAlign = align;
  c.textBaseline = 'middle';
  c.fillText(text, x, y);
  c.restore();
}

function starPath(c, cx, cy, r) {
  c.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.45;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const px = cx + Math.cos(a) * rad;
    const py = cy + Math.sin(a) * rad;
    if (i === 0) c.moveTo(px, py);
    else c.lineTo(px, py);
  }
  c.closePath();
}

function drawWanted(c, wanted) {
  const x0 = VIEW.width - 14 - 5 * 30;
  const y = 30;
  plate(c, x0 - 10, 10, 5 * 30 + 20, 42);
  for (let i = 0; i < 5; i++) {
    const cx = x0 + 15 + i * 30;
    starPath(c, cx, y, 11);
    if (i < wanted) {
      c.fillStyle = '#ffd23e';
      c.fill();
    } else {
      c.fillStyle = 'rgba(255,255,255,0.18)';
      c.fill();
      c.strokeStyle = 'rgba(255,255,255,0.45)';
      c.lineWidth = 1;
      c.stroke();
    }
  }
}

function drawCashHealth(c, player) {
  plate(c, 14, 10, 250, 64);
  label(c, cash(player.cash), 28, 30, 24, PALETTE.text);
  label(c, 'HEALTH', 28, 56, 11, PALETTE.muted, 700);
  const bw = 150;
  const bx = 96;
  const by = 49;
  c.save();
  c.fillStyle = 'rgba(255,255,255,0.16)';
  rr(c, bx, by, bw, 14, 7);
  c.fill();
  const hp = Math.max(0, Math.min(100, player.health || 0)) / 100;
  c.fillStyle = hp > 0.5 ? '#58d68d' : hp > 0.25 ? '#ffb02e' : '#ff5a5a';
  if (hp > 0) {
    rr(c, bx, by, Math.max(14, bw * hp), 14, 7);
    c.fill();
  }
  c.restore();
  label(c, String(Math.ceil(player.health || 0)), bx + bw + 10, 56, 13, PALETTE.text);
}

function drawObjective(c, mission, time) {
  const text = mission && mission.objective ? mission.objective : '';
  if (!text) return;
  c.save();
  c.font = font(15, 700);
  const w = Math.min(620, c.measureText(text).width + 56);
  const x = (VIEW.width - w) / 2;
  plate(c, x, 10, w, 40);
  c.fillStyle = PALETTE.accent;
  c.beginPath();
  c.arc(x + 22, 30, 5 + Math.sin(time * 4) * 1.5, 0, Math.PI * 2);
  c.fill();
  label(c, text, x + 36, 31, 15, PALETTE.text);
  c.restore();
}

function drawMinimap(c, state) {
  const city = state.city;
  const size = MAP_SIZE;
  const x0 = MAP_MARGIN;
  const y0 = VIEW.height - MAP_MARGIN - size;
  plate(c, x0 - 6, y0 - 6, size + 12, size + 12, 0.78);
  c.save();
  c.beginPath();
  c.rect(x0, y0, size, size);
  c.clip();
  c.fillStyle = '#101018';
  c.fillRect(x0, y0, size, size);
  const k = size / 4096;
  // Parks first, so roads draw over them.
  if (city && Array.isArray(city.parks)) {
    c.fillStyle = 'rgba(86,160,90,0.55)';
    for (const p of city.parks) c.fillRect(x0 + p.x * k, y0 + p.y * k, p.w * k, p.h * k);
  }
  // Roads: the city's road list, or the raw grid lines as a fallback.
  c.strokeStyle = 'rgba(220,220,230,0.75)';
  c.lineWidth = 2;
  c.beginPath();
  if (city && Array.isArray(city.roads) && city.roads.length > 0) {
    for (const r of city.roads) {
      c.moveTo(x0 + r.x1 * k, y0 + r.y1 * k);
      c.lineTo(x0 + r.x2 * k, y0 + r.y2 * k);
    }
  } else if (city && Array.isArray(city.lines)) {
    for (const line of city.lines) {
      c.moveTo(x0 + line * k, y0);
      c.lineTo(x0 + line * k, y0 + size);
      c.moveTo(x0, y0 + line * k);
      c.lineTo(x0 + size, y0 + line * k);
    }
  }
  c.stroke();
  const dot = (wx, wy, color, r) => {
    c.fillStyle = color;
    c.beginPath();
    c.arc(x0 + wx * k, y0 + wy * k, r, 0, Math.PI * 2);
    c.fill();
  };
  // Garages: spray (S) and gun shop (A).
  if (city && Array.isArray(city.garages)) {
    for (const g of city.garages) {
      const gx = x0 + g.x * k;
      const gy = y0 + g.y * k;
      c.fillStyle = g.kind === 'spray' ? '#4dd0e1' : '#ffb74d';
      c.fillRect(gx - 4, gy - 4, 8, 8);
      c.fillStyle = '#101018';
      c.font = font(7, 800);
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(g.kind === 'spray' ? 'S' : 'A', gx, gy + 0.5);
    }
  }
  // Hideout.
  if (city && city.hideout) dot(city.hideout.x, city.hideout.y, '#ffffff', 3);
  // Mission marker: pulsing gold diamond.
  const marker = state.mission && state.mission.marker;
  if (marker) {
    const mx = x0 + marker.x * k;
    const my = y0 + marker.y * k;
    const pr = 5 + Math.sin(state.time * 4) * 1.5;
    c.fillStyle = '#ffd23e';
    c.beginPath();
    c.moveTo(mx, my - pr);
    c.lineTo(mx + pr, my);
    c.lineTo(mx, my + pr);
    c.lineTo(mx - pr, my);
    c.closePath();
    c.fill();
  }
  // Police cars and foot cops.
  if (Array.isArray(state.cars)) {
    for (const car of state.cars) {
      if (car.driver === 'police') dot(car.x, car.y, '#ff4d4d', 3);
    }
  }
  if (Array.isArray(state.peds)) {
    for (const p of state.peds) {
      if (p.kind === 'cop') dot(p.x, p.y, '#ff8a8a', 2);
    }
  }
  // The player: a white arrow pointing where Milo faces.
  const p = state.player;
  c.save();
  c.translate(x0 + p.x * k, y0 + p.y * k);
  c.rotate(p.angle || 0);
  c.fillStyle = '#ffffff';
  c.strokeStyle = '#101018';
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(8, 0);
  c.lineTo(-6, -5);
  c.lineTo(-3, 0);
  c.lineTo(-6, 5);
  c.closePath();
  c.fill();
  c.stroke();
  c.restore();
  c.restore();
  label(c, 'VELMORA', x0, y0 - 14, 11, PALETTE.muted, 700);
}

function drawDrivePanel(c, player) {
  const driving = !player.onFoot && player.car;
  const speed = driving
    ? Math.min(180, Math.round(((player.car.speed || player.speed || 0) / CAR.maxSpeed) * 180))
    : 0;
  const w = 210;
  const h = driving ? 58 : 84;
  const x = VIEW.width - 14 - w;
  const y = VIEW.height - 14 - h;
  plate(c, x, y, w, h);
  label(c, String(speed), x + 16, y + h / 2 + (driving ? -6 : -12), driving ? 30 : 26, PALETTE.text, 800);
  label(c, 'km/h', x + 16 + (driving ? 66 : 58), y + h / 2 + (driving ? 0 : -8), 13, PALETTE.muted);
  if (!driving) {
    // Weapon readout is hidden while driving; on foot it shows here.
    const name = (player.weapon || 'fists').toUpperCase();
    const ammo = player.weapon === 'pistol' || player.weapon === 'smg'
      ? `  ${player.ammo || 0}`
      : '';
    label(c, name + ammo, x + 16, y + h - 20, 15, PALETTE.accent);
  } else {
    label(c, 'DRIVING', x + 16, y + h - 12, 12, PALETTE.muted, 700);
  }
}

function drawHintBar(c) {
  const text = 'WASD move  ·  E enter / exit car  ·  SPACE punch  ·  CLICK shoot  ·  C camera  ·  P pause  ·  M mute';
  c.save();
  c.font = font(13, 600);
  const w = c.measureText(text).width + 36;
  const x = (VIEW.width - w) / 2;
  plate(c, x, VIEW.height - 56, w, 26, 0.6);
  label(c, text, VIEW.width / 2, VIEW.height - 42, 13, PALETTE.text, 600, 'center');
  c.restore();
}

function drawMessage(c, message) {
  if (!message) return;
  c.save();
  c.font = font(15, 700);
  const w = Math.min(700, c.measureText(message).width + 40);
  plate(c, (VIEW.width - w) / 2, VIEW.height - 100, w, 32, 0.8);
  label(c, message, VIEW.width / 2, VIEW.height - 83, 15, '#ffd23e', 700, 'center');
  c.restore();
}

function dim(c) {
  c.save();
  c.fillStyle = 'rgba(6,6,16,0.62)';
  c.fillRect(0, 0, VIEW.width, VIEW.height);
  c.restore();
}

function drawTitle(c, state, ui) {
  dim(c);
  const cx = VIEW.width / 2;
  label(c, 'VELMORA', cx, 168, 88, PALETTE.text, 900, 'center');
  label(c, 'S U N S E T   S T R E E T S', cx, 228, 26, PALETTE.accent, 800, 'center');
  c.save();
  c.strokeStyle = PALETTE.accent;
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(cx - 220, 258);
  c.lineTo(cx + 220, 258);
  c.stroke();
  c.restore();
  label(c, 'Milo Vane owes a debt he cannot pay.', cx, 300, 17, PALETTE.text, 600, 'center');
  label(c, 'Fixer Nadia Sol has five jobs that can buy his freedom.', cx, 328, 17, PALETTE.text, 600, 'center');
  label(c, 'The VPD and the Cobras will not make it easy.', cx, 356, 17, PALETTE.text, 600, 'center');
  label(c, 'WASD / Arrows — move & drive      E — enter / exit car      SPACE — punch', cx, 412, 14, PALETTE.muted, 600, 'center');
  label(c, 'Mouse — aim      CLICK — shoot      C — camera      P — pause      M — mute', cx, 438, 14, PALETTE.muted, 600, 'center');
  // The start prompt is always visible: it must read in a screenshot,
  // not only on the half of the blink cycle when it is lit.
  label(c, 'Press Enter or click to start', cx, 500, 22, '#ffd23e', 800, 'center');
  const save = ui && ui.save;
  if (save && typeof save.bestCash === 'number') {
    label(
      c,
      `Save found — best cash ${cash(save.bestCash)} · ${save.missionsDone || 0} missions done`,
      cx, 556, 14, PALETTE.text, 600, 'center',
    );
  } else {
    label(c, 'No save yet — a fresh start in Velmora.', cx, 556, 14, PALETTE.text, 600, 'center');
  }
  if (ui && typeof ui.best === 'number' && ui.best > 0 && !save) {
    label(c, `Best cash ${cash(ui.best)}`, cx, 582, 14, PALETTE.muted, 600, 'center');
  }
}

function drawPaused(c) {
  dim(c);
  const cx = VIEW.width / 2;
  plate(c, cx - 190, 250, 380, 190);
  label(c, 'PAUSED', cx, 310, 44, PALETTE.text, 900, 'center');
  label(c, 'Press P or Esc to resume', cx, 368, 16, PALETTE.muted, 600, 'center');
  label(c, 'M — mute      Enter — resume', cx, 398, 14, PALETTE.muted, 600, 'center');
}

function drawOver(c, state, ui) {
  dim(c);
  const cx = VIEW.width / 2;
  const busted = ui && ui.overKind === 'busted';
  label(c, busted ? 'BUSTED' : 'WASTED', cx, 250, 72, busted ? '#6ea8ff' : '#ff5a5a', 900, 'center');
  label(
    c,
    busted ? 'The VPD caught up with Milo.' : 'Milo went down in the streets of Velmora.',
    cx, 312, 17, PALETTE.text, 600, 'center',
  );
  const stats = state.stats || {};
  label(
    c,
    `Cash ${cash(state.player.cash)}  ·  Missions ${stats.missionsDone || 0}  ·  Cars stolen ${stats.carsStolen || 0}  ·  Kills ${stats.kills || 0}`,
    cx, 360, 15, PALETTE.muted, 600, 'center',
  );
  label(c, 'Press Enter to try again', cx, 420, 20, '#ffd23e', 800, 'center');
}

function drawHud(c, state, ui) {
  const player = state.player;
  drawCashHealth(c, player);
  drawWanted(c, player.wanted || 0);
  drawObjective(c, state.mission, state.time || 0);
  drawMinimap(c, state);
  drawDrivePanel(c, player);
  drawHintBar(c);
  drawMessage(c, ui && ui.message);
}

export function createRenderer(glCanvas, hudCanvas) {
  // Resolve both canvases defensively: the boot code may pass (gl, hud),
  // a single canvas, or nothing — the DOM ids are the fallback in all cases.
  let gl = glCanvas || null;
  let hudC = hudCanvas || null;
  if (gl && !hudC) {
    if (gl.id === 'game') {
      hudC = gl;
      gl = document.getElementById('gl');
    } else {
      hudC = document.getElementById('game');
    }
  }
  if (!gl) gl = document.getElementById('gl');
  if (!hudC) hudC = document.getElementById('game');
  const hud = hudC.getContext('2d');
  hudC.width = VIEW.width;
  hudC.height = VIEW.height;
  let scene = null;

  function ensureScene(city) {
    if (!scene && city) scene = createScene3D(gl, city);
    return scene;
  }

  function draw(state, screen, ui) {
    if (!state) return;
    const sceneNow = ensureScene(state.city);
    if (sceneNow) sceneNow.sync(state);
    hud.clearRect(0, 0, VIEW.width, VIEW.height);
    if (screen === SCREEN_TITLE) {
      drawTitle(hud, state, ui || {});
    } else {
      drawHud(hud, state, ui || {});
      if (screen === SCREEN_PAUSED) drawPaused(hud);
      else if (screen === SCREEN_OVER) drawOver(hud, state, ui || {});
    }
  }

  function screenToWorld(sx, sy) {
    if (!scene) return { x: 0, y: 0 };
    return scene.screenToWorld(sx, sy);
  }

  return { draw, screenToWorld };
}
