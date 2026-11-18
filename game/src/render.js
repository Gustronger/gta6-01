// Drawing only: the world's state and the current screen in, pixels out. The camera
// follows Milo (or his car) across the 4096x4096 city, the 1280x720 logical view is
// scaled to fit the window with letterboxing, and the HUD, minimap and panels are drawn
// in logical view space. Colours come from config's PALETTE where it defines them;
// every colour has a sun-soaked fallback so a palette gap never blanks the frame.

import { CAR, FONT, PALETTE, VIEW, WORLD } from './config.js';

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

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  // view: how the logical 1280x720 maps onto the real canvas (device pixels).
  const view = { scale: 1, x: 0, y: 0, ratio: 1 };
  // Last camera used by draw(), in world coords; screenToWorld reads it back.
  const camera = { x: 0, y: 0 };
  const fonts = new Map();

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
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

  function updateCamera(state) {
    const player = state.player;
    const cx = player && typeof player.x === 'number' ? player.x : WORLD_W / 2;
    const cy = player && typeof player.y === 'number' ? player.y : WORLD_H / 2;
    camera.x = clamp(cx - VIEW_W / 2, 0, WORLD_W - VIEW_W);
    camera.y = clamp(cy - VIEW_H / 2, 0, WORLD_H - VIEW_H);
  }

  function inView(x, y, margin) {
    return x > camera.x - margin && x < camera.x + VIEW_W + margin
      && y > camera.y - margin && y < camera.y + VIEW_H + margin;
  }

  // ---- world layers (drawn in world coords, camera already applied) ----

  function drawGround(state) {
    const city = state.city || {};
    // Base ground: warm sun-baked earth under everything.
    ctx.fillStyle = C.ground;
    ctx.fillRect(camera.x, camera.y, VIEW_W, VIEW_H);
    // Ocean + beach along the south edge: sand strip, then open water with wave lines.
    const beachY = (city.beach && city.beach.y0) || 3904;
    ctx.fillStyle = C.sand;
    ctx.fillRect(camera.x, Math.max(beachY, camera.y), VIEW_W, WORLD_H - Math.max(beachY, camera.y));
    const waterY = beachY + 96;
    if (waterY < camera.y + VIEW_H) {
      ctx.fillStyle = C.ocean;
      ctx.fillRect(camera.x, Math.max(waterY, camera.y), VIEW_W, WORLD_H - Math.max(waterY, camera.y));
      ctx.strokeStyle = C.oceanDeep;
      ctx.lineWidth = 3;
      const top = Math.max(waterY + 14, camera.y);
      for (let y = top; y < WORLD_H; y += 34) {
        ctx.beginPath();
        for (let x = camera.x - 40; x < camera.x + VIEW_W + 40; x += 80) {
          const wave = Math.sin((x + y * 3) / 90) * 5;
          if (x === camera.x - 40) ctx.moveTo(x, y + wave);
          else ctx.lineTo(x, y + wave);
        }
        ctx.stroke();
      }
    }
  }

  function drawRoads(state) {
    const city = state.city || {};
    const roadW = city.roadW || 88;
    const roads = city.roads || [];
    // Sidewalks first: a wider pale strip under each road.
    ctx.fillStyle = C.sidewalk;
    for (let i = 0; i < roads.length; i += 1) {
      const r = roads[i];
      if (r.horizontal) ctx.fillRect(r.x1, r.y1 - roadW / 2 - 10, r.x2 - r.x1, roadW + 20);
      else ctx.fillRect(r.x1 - roadW / 2 - 10, r.y1, roadW + 20, r.y2 - r.y1);
    }
    // Asphalt.
    ctx.fillStyle = C.road;
    for (let i = 0; i < roads.length; i += 1) {
      const r = roads[i];
      if (r.horizontal) ctx.fillRect(r.x1, r.y1 - roadW / 2, r.x2 - r.x1, roadW);
      else ctx.fillRect(r.x1 - roadW / 2, r.y1, roadW, r.y2 - r.y1);
    }
    // Centre lane dashes.
    ctx.fillStyle = C.lane;
    for (let i = 0; i < roads.length; i += 1) {
      const r = roads[i];
      if (r.horizontal) {
        const y = r.y1;
        for (let x = r.x1 + 20; x < r.x2 - 20; x += 64) ctx.fillRect(x, y - 2, 34, 4);
      } else {
        const x = r.x1;
        for (let y = r.y1 + 20; y < r.y2 - 20; y += 64) ctx.fillRect(x - 2, y, 4, 34);
      }
    }
  }

  function drawParks(state) {
    const city = state.city || {};
    const parks = city.parks || [];
    for (let i = 0; i < parks.length; i += 1) {
      const p = parks[i];
      if (!inView(p.x + p.w / 2, p.y + p.h / 2, Math.max(p.w, p.h))) continue;
      ctx.fillStyle = C.park;
      ctx.fillRect(p.x, p.y, p.w, p.h);
      // Trees: a loose grid of two-tone canopies.
      const step = 64;
      let n = 0;
      for (let ty = p.y + 30; ty < p.y + p.h - 20; ty += step) {
        for (let tx = p.x + 30; tx < p.x + p.w - 20; tx += step) {
          n += 1;
          if (n % 3 === 0) continue;
          ctx.fillStyle = n % 2 === 0 ? C.tree : C.treeLight;
          ctx.beginPath();
          ctx.arc(tx, ty, 15, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = 'rgba(0,0,0,0.18)';
          ctx.beginPath();
          ctx.arc(tx - 4, ty + 5, 15, 0, Math.PI);
          ctx.fill();
        }
      }
    }
  }

  function drawBuildings(state) {
    const city = state.city || {};
    const buildings = city.buildings || [];
    for (let i = 0; i < buildings.length; i += 1) {
      const b = buildings[i];
      if (!inView(b.x + b.w / 2, b.y + b.h / 2, Math.max(b.w, b.h))) continue;
      // Drop shadow, offset down-right.
      ctx.fillStyle = C.shadow;
      ctx.fillRect(b.x + 7, b.y + 9, b.w, b.h);
      // Body in the district colour the city assigned.
      ctx.fillStyle = b.color || '#8a6f5c';
      ctx.fillRect(b.x, b.y, b.w, b.h);
      // Roof detail: inset slab, a pale edge, and a few rooftop boxes.
      ctx.fillStyle = C.roofLine;
      ctx.fillRect(b.x + 5, b.y + 5, b.w - 10, 3);
      ctx.strokeStyle = 'rgba(0,0,0,0.22)';
      ctx.lineWidth = 2;
      ctx.strokeRect(b.x + 6, b.y + 6, b.w - 12, b.h - 12);
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      const boxes = Math.max(1, Math.floor((b.w * b.h) / 9000));
      for (let k = 0; k < boxes; k += 1) {
        const bx = b.x + 12 + ((k * 53) % Math.max(1, b.w - 32));
        const by = b.y + 12 + ((k * 37) % Math.max(1, b.h - 32));
        ctx.fillRect(bx, by, 14, 10);
      }
      // Towers read taller: a bright glass glint down one side.
      if (b.kind === 'tower') {
        ctx.fillStyle = 'rgba(255,255,255,0.28)';
        ctx.fillRect(b.x + 8, b.y + 10, 5, b.h - 20);
      }
    }
  }

  function drawCar(car, time) {
    if (!inView(car.x, car.y, 80)) return;
    const length = car.kind === 'truck' ? 62 : car.kind === 'sport' ? 46 : 50;
    const width = car.kind === 'truck' ? 26 : 22;
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle || 0);
    ctx.fillStyle = C.shadow;
    ctx.fillRect(-length / 2 + 3, -width / 2 + 4, length, width);
    ctx.fillStyle = car.kind === 'police' ? C.policeBody : (car.color || '#c0c0c0');
    ctx.beginPath();
    ctx.roundRect(-length / 2, -width / 2, length, width, 6);
    ctx.fill();
    // Cabin + windows.
    ctx.fillStyle = 'rgba(20, 28, 44, 0.85)';
    ctx.fillRect(-length * 0.18, -width / 2 + 3, length * 0.34, width - 6);
    ctx.fillStyle = 'rgba(160, 200, 235, 0.5)';
    ctx.fillRect(-length * 0.18, -width / 2 + 4, 5, width - 8);
    // Headlights and taillights.
    ctx.fillStyle = '#fff6c0';
    ctx.fillRect(length / 2 - 2, -width / 2 + 2, 3, 5);
    ctx.fillRect(length / 2 - 2, width / 2 - 7, 3, 5);
    ctx.fillStyle = '#ff4a3d';
    ctx.fillRect(-length / 2 - 1, -width / 2 + 2, 3, 5);
    ctx.fillRect(-length / 2 - 1, width / 2 - 7, 3, 5);
    // Police light bar, flashing red/blue with the clock.
    if (car.kind === 'police') {
      const redOn = Math.floor(time * 4) % 2 === 0;
      ctx.fillStyle = redOn ? C.policeRed : C.policeBlue;
      ctx.fillRect(-7, -width / 2 - 2, 7, 5);
      ctx.fillStyle = redOn ? C.policeBlue : C.policeRed;
      ctx.fillRect(0, -width / 2 - 2, 7, 5);
    }
    ctx.restore();
  }

  function drawPed(ped) {
    if (!inView(ped.x, ped.y, 40)) return;
    const down = ped.state === 'down';
    ctx.save();
    ctx.translate(ped.x, ped.y);
    if (down) ctx.rotate(Math.PI / 2);
    const shirt = ped.kind === 'cop' ? C.copBlue : ped.kind === 'gang' ? C.gangRed : C.pedShirt;
    ctx.fillStyle = C.shadow;
    ctx.beginPath();
    ctx.ellipse(1, 2, 8, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = shirt;
    ctx.beginPath();
    ctx.arc(0, 0, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e8b98a';
    ctx.beginPath();
    ctx.arc(Math.cos(ped.angle || 0) * 3, Math.sin(ped.angle || 0) * 3, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawEnemy(enemy, time) {
    if (!inView(enemy.x, enemy.y, 40)) return;
    ctx.save();
    ctx.translate(enemy.x, enemy.y);
    ctx.fillStyle = C.shadow;
    ctx.beginPath();
    ctx.ellipse(1, 2, 9, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = C.gangRed;
    ctx.beginPath();
    ctx.arc(0, 0, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1c1c22';
    ctx.beginPath();
    ctx.arc(Math.cos(enemy.angle || 0) * 4, Math.sin(enemy.angle || 0) * 4, 4, 0, Math.PI * 2);
    ctx.fill();
    // Gun barrel pointing at the aim angle.
    ctx.strokeStyle = '#22222a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(enemy.angle || 0) * 16, Math.sin(enemy.angle || 0) * 16);
    ctx.stroke();
    ctx.restore();
  }

  function drawBullets(state) {
    const bullets = state.bullets || [];
    ctx.strokeStyle = C.bullet;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    for (let i = 0; i < bullets.length; i += 1) {
      const b = bullets[i];
      const len = Math.hypot(b.vx, b.vy) || 1;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - (b.vx / len) * 18, b.y - (b.vy / len) * 18);
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
  }

  function drawParticles(state) {
    const particles = state.particles || [];
    for (let i = 0; i < particles.length; i += 1) {
      const p = particles[i];
      if (!inView(p.x, p.y, 20)) continue;
      const alpha = clamp((p.life || 0) * 2, 0, 1);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color || '#ffd76a';
      const size = p.size || 4;
      ctx.fillRect(p.x - size / 2, p.y - size / 2, size, size);
    }
    ctx.globalAlpha = 1;
  }

  function drawPickups(state, time) {
    const pickups = state.pickups || [];
    for (let i = 0; i < pickups.length; i += 1) {
      const p = pickups[i];
      if (!inView(p.x, p.y, 30)) continue;
      const bob = Math.sin(time * 3 + i) * 2;
      const y = p.y + bob;
      if (p.kind === 'cash') {
        ctx.fillStyle = C.cash;
        ctx.beginPath();
        ctx.arc(p.x, y, 11, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#1e6b2e';
        ctx.lineWidth = 2;
        ctx.stroke();
        text('$', p.x, y + 5, 14, '#1e6b2e', 'center', 'bold');
      } else if (p.kind === 'health') {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(p.x - 10, y - 10, 20, 20);
        ctx.fillStyle = '#e23b3b';
        ctx.fillRect(p.x - 3, y - 8, 6, 16);
        ctx.fillRect(p.x - 8, y - 3, 16, 6);
      } else {
        // ammo: yellow crate with dark band
        ctx.fillStyle = '#f2c94c';
        ctx.fillRect(p.x - 9, y - 7, 18, 14);
        ctx.fillStyle = '#7a5b00';
        ctx.fillRect(p.x - 9, y - 2, 18, 4);
      }
    }
  }

  function drawMarker(state, time) {
    const mission = state.mission;
    if (!mission || !mission.marker) return;
    const m = mission.marker;
    const pulse = 1 + Math.sin(time * 5) * 0.18;
    if (inView(m.x, m.y, 60)) {
      ctx.strokeStyle = C.marker;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(m.x, m.y, 26 * pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = C.marker;
      ctx.beginPath();
      ctx.arc(m.x, m.y, 6, 0, Math.PI * 2);
      ctx.fill();
      // Down-pointing chevron above the ring.
      ctx.beginPath();
      ctx.moveTo(m.x - 9, m.y - 34);
      ctx.lineTo(m.x + 9, m.y - 34);
      ctx.lineTo(m.x, m.y - 22);
      ctx.closePath();
      ctx.fill();
    } else {
      // Off-screen: an arrow pinned to the view edge, pointing at the marker.
      const dx = m.x - (camera.x + VIEW_W / 2);
      const dy = m.y - (camera.y + VIEW_H / 2);
      const angle = Math.atan2(dy, dx);
      const ex = camera.x + VIEW_W / 2 + Math.cos(angle) * (VIEW_W / 2 - 46);
      const ey = camera.y + VIEW_H / 2 + Math.sin(angle) * (VIEW_H / 2 - 46);
      const ax = clamp(ex, camera.x + 30, camera.x + VIEW_W - 30);
      const ay = clamp(ey, camera.y + 30, camera.y + VIEW_H - 30);
      ctx.save();
      ctx.translate(ax, ay);
      ctx.rotate(angle);
      ctx.fillStyle = C.marker;
      ctx.beginPath();
      ctx.moveTo(16, 0);
      ctx.lineTo(-10, -11);
      ctx.lineTo(-4, 0);
      ctx.lineTo(-10, 11);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  function drawPlayer(state, time) {
    const player = state.player;
    if (!player || !player.alive || !player.onFoot) return;
    if (!inView(player.x, player.y, 40)) return;
    // Blink while hurt recently: hidden on alternate tenths of a second.
    const blink = Math.floor(time * 10) % 2 === 0 && player.health < 30;
    if (blink) return;
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.rotate(player.angle || 0);
    ctx.fillStyle = C.shadow;
    ctx.beginPath();
    ctx.ellipse(2, 3, 10, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    // Milo: teal jacket, dark jeans.
    ctx.fillStyle = '#1f9d8a';
    ctx.beginPath();
    ctx.arc(0, 0, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2b2b33';
    ctx.fillRect(-4, -8, 8, 5);
    ctx.fillRect(-4, 3, 8, 5);
    ctx.fillStyle = '#e8b98a';
    ctx.beginPath();
    ctx.arc(7, 0, 4.5, 0, Math.PI * 2);
    ctx.fill();
    // Aim line when armed.
    if (player.weapon && player.weapon !== 'fists') {
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(10, 0);
      ctx.lineTo(26, 0);
      ctx.stroke();
    }
    ctx.restore();
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
    // Dim the living city behind the title.
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
    updateCamera(state);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = C.backdrop;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // World space: scale to the view, then shift by the camera.
    ctx.setTransform(view.scale, 0, 0, view.scale, view.x - camera.x * view.scale, view.y - camera.y * view.scale);
    const time = state.time || 0;
    drawGround(state);
    drawRoads(state);
    drawParks(state);
    drawBuildings(state);
    drawPickups(state, time);
    const cars = state.cars || [];
    for (let i = 0; i < cars.length; i += 1) drawCar(cars[i], time);
    const peds = state.peds || [];
    for (let i = 0; i < peds.length; i += 1) drawPed(peds[i]);
    const enemies = state.enemies || [];
    for (let i = 0; i < enemies.length; i += 1) drawEnemy(enemies[i], time);
    drawBullets(state);
    drawParticles(state);
    drawMarker(state, time);
    drawPlayer(state, time);
    // HUD / screens in logical view space.
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
    const dx = sx * view.ratio;
    const dy = sy * view.ratio;
    return {
      x: camera.x + (dx - view.x) / view.scale,
      y: camera.y + (dy - view.y) / view.scale,
    };
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, screenToWorld };
}
