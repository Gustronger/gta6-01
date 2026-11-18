// Velmora's map: a 9x9 road grid over a 4096x4096 island city, built once
// from the seeded generator so the same seed always yields the same streets,
// blocks, parks and shops.
import { DISTRICTS, ROAD_LINES, ROAD_WIDTH, WORLD } from './config.js';
import { pick, randFloat, randInt } from './random.js';

export const LINES = ROAD_LINES;
export const ROAD_W = ROAD_WIDTH;

/** District id for a point: NW Old Town, NE Downtown, SW Marina, SE Docks. */
export function districtAt(x, y) {
  for (const d of DISTRICTS) {
    if (x >= d.x0 && x < d.x1 && y >= d.y0 && y < d.y1) return d.id;
  }
  return 'docks';
}

function districtName(id) {
  const found = DISTRICTS.find((d) => d.id === id);
  return found ? found.name : id;
}

/** The solid strips between neighbouring roads, plus the outer rim strips. */
function blockSpans() {
  const half = ROAD_W / 2;
  const edges = [0];
  for (const line of LINES) edges.push(line - half, line + half);
  edges.push(WORLD.width);
  const spans = [];
  for (let i = 0; i + 1 < edges.length; i += 2) {
    spans.push({ from: edges[i], to: edges[i + 1] });
  }
  return spans;
}

/** True when the point sits on asphalt (within half a road width of a line). */
export function isOnRoad(city, x, y) {
  const half = city.roadW / 2;
  for (const line of city.lines) {
    if (Math.abs(x - line) <= half || Math.abs(y - line) <= half) return true;
  }
  return false;
}

/** The closest point on the road network, snapped onto a road centreline. */
export function nearestRoadPoint(city, x, y) {
  let bestX = city.lines[0];
  let bestD = Math.abs(x - bestX);
  for (const line of city.lines) {
    const d = Math.abs(x - line);
    if (d < bestD) { bestD = d; bestX = line; }
  }
  let bestY = city.lines[0];
  bestD = Math.abs(y - bestY);
  for (const line of city.lines) {
    const d = Math.abs(y - line);
    if (d < bestD) { bestD = d; bestY = line; }
  }
  // Snap to whichever centreline is nearer, keeping the other coordinate.
  if (Math.abs(x - bestX) <= Math.abs(y - bestY)) return { x: bestX, y };
  return { x, y: bestY };
}

/** A random point on a random road, with its axis, line and travel direction. */
export function randomRoadPoint(city, rng) {
  const line = pick(rng, city.lines);
  const along = randFloat(rng, 120, WORLD.width - 120);
  const axis = drawAxis(rng);
  const dir = drawDir(rng);
  if (axis === 'x') return { x: along, y: line, axis, line, dir };
  return { x: line, y: along, axis, line, dir };
}

function drawAxis(rng) {
  return rng() < 0.5 ? 'x' : 'y';
}

function drawDir(rng) {
  return rng() < 0.5 ? 1 : -1;
}

const HOUSE_COLORS = ['#c99a72', '#b98a68', '#d8a97e', '#a87f66', '#c98a6a'];
const SHOP_COLORS = ['#d8b25e', '#c9a24a', '#b98a3a', '#d8c25e'];
const TOWER_COLORS = ['#7fa8c9', '#9cc3de', '#6f97b8', '#a8c8e0', '#8fb4d4'];
const WAREHOUSE_COLORS = ['#8a7f74', '#7a6f64', '#9a8f84', '#6f655c'];

/**
 * Build the whole city from the seeded generator. Buildings fill the blocks
 * between roads (1–3 per block, kind and colour by district); four blocks
 * become parks; the strip y >= 3904 is beach; the south-east is warehouses.
 */
export function createCity(random) {
  const rng = random;
  const spans = blockSpans();
  const buildings = [];
  const parks = [];

  // Four park blocks, picked as fixed block-grid cells so they never move
  // with the seed but the trees inside them still vary.
  const parkCells = new Set(['2,2', '7,3', '3,7', '6,6']);

  for (let bx = 0; bx < spans.length; bx += 1) {
    for (let by = 0; by < spans.length; by += 1) {
      const sx = spans[bx];
      const sy = spans[by];
      const cx = (sx.from + sx.to) / 2;
      const cy = (sy.from + sy.to) / 2;
      const district = districtAt(cx, cy);
      // The bottom row of blocks is the beach strip, not buildings.
      if (sy.from >= 3808) continue;
      if (parkCells.has(`${bx},${by}`)) {
        parks.push({
          x: sx.from + 14, y: sy.from + 14,
          w: sx.to - sx.from - 28, h: sy.to - sy.from - 28,
          district,
        });
        continue;
      }
      const lotCount = randInt(rng, 1, 3);
      const bw = (sx.to - sx.from - 24) / lotCount;
      for (let lot = 0; lot < lotCount; lot += 1) {
        const pad = 12;
        const bx0 = sx.from + 12 + lot * bw;
        const by0 = sy.from + 12;
        const w = bw - pad * 2;
        const h = sy.to - sy.from - 24;
        if (w < 40 || h < 40) continue;
        let kind = 'house';
        let color = pick(rng, HOUSE_COLORS);
        let roof = rng() < 0.5 ? 'gable' : 'flat';
        if (district === 'downtown') {
          kind = 'tower';
          color = pick(rng, TOWER_COLORS);
          roof = 'glass';
        } else if (district === 'docks') {
          kind = 'warehouse';
          color = pick(rng, WAREHOUSE_COLORS);
          roof = 'flat';
        } else if (district === 'marina' && rng() < 0.35) {
          kind = 'shop';
          color = pick(rng, SHOP_COLORS);
          roof = 'flat';
        } else if (district === 'oldtown' && rng() < 0.2) {
          kind = 'shop';
          color = pick(rng, SHOP_COLORS);
          roof = 'flat';
        }
        // Towers rise taller than their footprint suggests; keep the rect
        // itself honest so collision stays simple and the renderer can draw
        // height from the kind.
        buildings.push({
          x: bx0, y: by0, w, h,
          kind, district, color, roof,
        });
      }
    }
  }

  const roads = [];
  for (const line of LINES) {
    roads.push({ x1: 0, y1: line, x2: WORLD.width, y2: line, horizontal: true });
    roads.push({ x1: line, y1: 0, x2: line, y2: WORLD.height, horizontal: false });
  }

  // Garages sit on roadside lots: Pay-n-Spray in Downtown, the gun shop
  // (Ironworks Arms) in the Docks, plus a second spray shop near Marina.
  const garages = [
    { x: 2464, y: 1120 + 66, kind: 'spray', name: "Pay-n-Spray" },
    { x: 2912 + 66, y: 2912, kind: 'arms', name: 'Ironworks Arms' },
    { x: 672, y: 2912 + 66, kind: 'spray', name: "Pay-n-Spray" },
  ];
  const shops = garages.map((g) => ({ x: g.x, y: g.y, name: g.name, kind: g.kind }));

  // Nadia's garage (mission 1 destination, Downtown) and the hideout (Old Town).
  const hideout = { x: 672, y: 672 };
  const nadiaGarage = { x: 2912, y: 1120 };

  const spawns = {
    player: { x: 1120, y: 672 },
    cars: [],
    police: [
      { x: 2464, y: 224 },
      { x: 2016, y: 1120 },
      { x: 3360, y: 1568 },
    ],
  };
  // Parked cars along random roads, angled with the road they sit on.
  for (let i = 0; i < 12; i += 1) {
    const p = randomRoadPoint({ lines: LINES, roadW: ROAD_W }, rng);
    const off = 26;
    if (p.axis === 'x') spawns.cars.push({ x: p.x, y: p.y + (rng() < 0.5 ? off : -off), angle: p.dir > 0 ? 0 : Math.PI });
    else spawns.cars.push({ x: p.x + (rng() < 0.5 ? off : -off), y: p.y, angle: p.dir > 0 ? Math.PI / 2 : -Math.PI / 2 });
  }

  const city = {
    lines: [...LINES],
    roadW: ROAD_W,
    buildings,
    parks,
    roads,
    beach: { y0: 3904 },
    garages,
    shops,
    hideout,
    nadiaGarage,
    spawns,
    districts: DISTRICTS.map((d) => ({ ...d, label: d.name })),
  };
  return city;
}

export { districtName };
