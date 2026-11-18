import { DISTRICTS } from './config.js';

export const LINES = [224, 672, 1120, 1568, 2016, 2464, 2912, 3360, 3808];

export const ROAD_W = 88;

const ROOFS = {
  'Old Town': ['#b5563a', '#c97a3d', '#8f5a3c', '#a84f4f', '#7a6a4f', '#96522e'],
  Downtown: ['#3d5a73', '#516e86', '#2f485e', '#6b8aa0', '#44586e', '#7d9bb0'],
  Marina: ['#d98a7a', '#e8b06a', '#7fb0a0', '#c96a6a', '#e0c078', '#8aa8c8'],
  Docks: ['#6e5a4a', '#7a6a58', '#5a6e7a', '#8a7a5a', '#4f5a52', '#9a8a6a'],
};

const WALLS = {
  'Old Town': ['#d9c49a', '#c8a878', '#e0d0b0', '#b89a78', '#d0b088', '#c09070'],
  Downtown: ['#9ab0c0', '#b0c0d0', '#88a0b8', '#c0d0dc', '#7a94a8', '#a8bcc8'],
  Marina: ['#f0e0c0', '#e8d0a0', '#d0e0d8', '#f0c8b0', '#e0d8c0', '#c8d8e8'],
  Docks: ['#8a7a68', '#9a8a72', '#7a6a5a', '#a08a6a', '#6a7a72', '#b09878'],
};

const SHOP_NAMES = ['Sunset Market', 'Velmora Diner', 'Boardwalk Books', 'Harbor Tackle'];

function districtFor(x, y) {
  for (const d of DISTRICTS) {
    if (x >= d.x0 && x < d.x1 && y >= d.y0 && y < d.y1) return d.name;
  }
  return 'Old Town';
}

function clamp(v, lo, hi) {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

function nearestLine(lines, v) {
  let best = lines[0];
  let bestD = Math.abs(v - lines[0]);
  for (let i = 1; i < lines.length; i++) {
    const d = Math.abs(v - lines[i]);
    if (d < bestD) {
      bestD = d;
      best = lines[i];
    }
  }
  return best;
}

export function isOnRoad(city, x, y) {
  const half = city.roadW / 2;
  for (const line of city.lines) {
    if (Math.abs(x - line) <= half) return true;
    if (Math.abs(y - line) <= half) return true;
  }
  return false;
}

export function nearestRoadPoint(city, x, y) {
  const nx = nearestLine(city.lines, x);
  const ny = nearestLine(city.lines, y);
  const dx = Math.abs(x - nx);
  const dy = Math.abs(y - ny);
  if (dx <= dy) return { x: nx, y: clamp(y, 0, 4096) };
  return { x: clamp(x, 0, 4096), y: ny };
}

export function randomRoadPoint(city, rng) {
  const line = rng.pick(city.lines);
  const t = rng.int(120, 3976);
  const dir = rng.pick([-1, 1]);
  if (rng.next() < 0.5) return { x: t, y: line, axis: 'x', line, dir };
  return { x: line, y: t, axis: 'y', line, dir };
}

function roadEdgePoint(rng, line, alongMin, alongMax, side) {
  const along = rng.int(alongMin, alongMax);
  const off = ROAD_W / 2 + 18;
  if (side === 'v') return { x: line + off, y: along };
  if (side === 'v-') return { x: line - off, y: along };
  if (side === 'h-') return { x: along, y: line - off };
  return { x: along, y: line + off };
}

export function createCity(random) {
  const cuts = [0];
  for (const line of LINES) {
    cuts.push(line - ROAD_W / 2);
    cuts.push(line + ROAD_W / 2);
  }
  cuts.push(4096);

  const xSpans = [];
  for (let i = 0; i < cuts.length; i += 2) xSpans.push([cuts[i], cuts[i + 1]]);
  const ySpans = [];
  for (let i = 0; i < cuts.length; i += 2) ySpans.push([cuts[i], cuts[i + 1]]);

  const blocks = [];
  for (const xs of xSpans) {
    for (const ys of ySpans) {
      if (ys[0] >= 3852) continue;
      const cx = (xs[0] + xs[1]) / 2;
      const cy = (ys[0] + ys[1]) / 2;
      blocks.push({ x0: xs[0], y0: ys[0], x1: xs[1], y1: ys[1], cx, cy, district: districtFor(cx, cy) });
    }
  }

  const parkIdx = new Set();
  while (parkIdx.size < 4) {
    parkIdx.add(random.int(0, blocks.length - 1));
  }

  const buildings = [];
  const parks = [];
  blocks.forEach((b, i) => {
    if (parkIdx.has(i)) {
      parks.push({ x: b.x0, y: b.y0, w: b.x1 - b.x0, h: b.y1 - b.y0 });
      return;
    }
    const bw = b.x1 - b.x0;
    const bh = b.y1 - b.y0;
    const inset = bw < 220 || bh < 220 ? 8 : random.int(10, 20);
    const w = bw - inset * 2;
    const h = bh - inset * 2;
    let kind = 'house';
    let height = random.int(14, 26);
    if (b.district === 'Docks') {
      kind = 'warehouse';
      height = random.int(22, 34);
    } else if (b.district === 'Downtown') {
      if (random.next() < 0.16) {
        kind = 'shop';
        height = random.int(18, 30);
      } else {
        kind = 'tower';
        height = random.int(90, 160);
      }
    } else if (random.next() < 0.12) {
      kind = 'shop';
      height = random.int(18, 30);
    }
    buildings.push({
      x: b.x0 + inset,
      y: b.y0 + inset,
      w,
      h,
      kind,
      district: b.district,
      color: random.pick(WALLS[b.district]),
      roof: random.pick(ROOFS[b.district]),
      height,
      winSeed: random.int(0, 999999),
    });
  });

  const trees = [];
  for (const p of parks) {
    for (let i = 0; i < 6; i++) {
      trees.push({
        x: p.x + random.int(24, Math.max(25, p.w - 24)),
        y: p.y + random.int(24, Math.max(25, p.h - 24)),
      });
    }
  }

  const lamps = [];
  for (let i = 0; i < 45; i++) {
    const line = random.pick(LINES);
    const along = random.int(90, 4006);
    const side = random.pick([-1, 1]);
    const off = ROAD_W / 2 + 14;
    if (random.next() < 0.5) lamps.push({ x: line + side * off, y: along });
    else lamps.push({ x: along, y: line + side * off });
  }

  const cranes = [];
  for (let i = 0; i < 3; i++) {
    cranes.push({
      x: random.int(2300, 3900),
      y: random.int(2300, 3700),
      angle: random.next() * Math.PI * 2,
    });
  }

  const spraySpot = roadEdgePoint(random, LINES[2], 500, 1500, 'v');
  const armsSpot = roadEdgePoint(random, LINES[5], 500, 1500, 'v-');
  const garages = [
    { x: spraySpot.x, y: spraySpot.y, kind: 'spray', name: 'Pay-n-Spray' },
    { x: armsSpot.x, y: armsSpot.y, kind: 'arms', name: 'Gun Shop' },
  ];

  const shopLines = [LINES[1], LINES[3], LINES[6], LINES[7]];
  const shops = SHOP_NAMES.map((name, i) => {
    const spot = roadEdgePoint(random, shopLines[i], 300 + i * 700, 900 + i * 700, i % 2 === 0 ? 'h' : 'v');
    return { x: spot.x, y: spot.y, name };
  });

  const hideout = { x: LINES[1] + 70, y: random.int(500, 1600) };
  const playerSpawn = { x: LINES[1], y: hideout.y };

  const carSpawns = [];
  for (let i = 0; i < 12; i++) {
    const p = randomRoadPoint({ lines: LINES, roadW: ROAD_W }, random);
    carSpawns.push({ x: p.x, y: p.y, angle: p.axis === 'x' ? (p.dir > 0 ? 0 : Math.PI) : (p.dir > 0 ? Math.PI / 2 : -Math.PI / 2) });
  }

  const policeSpawns = [];
  const policeLines = [LINES[5], LINES[6], LINES[7]];
  for (let i = 0; i < 3; i++) {
    policeSpawns.push({ x: policeLines[i], y: random.int(300, 1800) });
  }

  const roads = [];
  for (const line of LINES) {
    roads.push({ x1: line, y1: 0, x2: line, y2: 4096, horizontal: false });
    roads.push({ x1: 0, y1: line, x2: 4096, y2: line, horizontal: true });
  }

  return {
    lines: LINES.slice(),
    roadW: ROAD_W,
    buildings,
    parks,
    roads,
    beach: { y0: 3904 },
    garages,
    shops,
    hideout,
    spawns: { player: playerSpawn, cars: carSpawns, police: policeSpawns },
    districts: DISTRICTS,
    lamps,
    cranes,
    trees,
  };
}
