// random.js — deterministic seeded RNG for VELMORA: Sunset Streets.
// Pure module, no imports. mulberry32 gives a stable stream per seed so
// replays, screenshots and the fixed-step loop stay identical run to run.

export function createRandom(seed) {
  let a = (seed >>> 0) || 0x9e3779b9;
  function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function int(min, max) {
    const lo = Math.ceil(min);
    const hi = Math.floor(max);
    if (hi <= lo) return lo;
    return lo + Math.floor(next() * (hi - lo + 1));
  }
  function pick(arr) {
    if (!arr || arr.length === 0) return undefined;
    return arr[Math.floor(next() * arr.length)];
  }
  return { next, int, pick };
}

export function randInt(rng, min, max) {
  if (rng && typeof rng.int === 'function') return rng.int(min, max);
  const lo = Math.ceil(min);
  const hi = Math.floor(max);
  if (hi <= lo) return lo;
  return lo + Math.floor(rng.next() * (hi - lo + 1));
}

export function pick(rng, arr) {
  if (!arr || arr.length === 0) return undefined;
  if (rng && typeof rng.pick === 'function') return rng.pick(arr);
  return arr[Math.floor(rng.next() * arr.length)];
}
