// Seeded randomness for Velmora. Every draw comes from one 32-bit state that
// only moves forward, so the same seed always builds the same city and the
// same traffic — that is what makes the screenshot scenes repeatable.
//
// The generator below is a mulberry32-style scrambler written from scratch
// for this game: advance the state by a golden-ratio constant, xor-shift and
// multiply it twice, and scale the top bits into [0, 1).

/**
 * Build a generator from any integer seed. The returned value is a function
 * (call it for the next float in [0, 1)) that also carries a `.next` method
 * pointing at itself, so callers may use either `rng()` or `rng.next()`.
 */
export function createRandom(seed) {
  // Fold any seed (including 0 and negatives) into a non-zero 32-bit state.
  let state = (seed >>> 0) ^ 0x9e3779b9;
  if (state === 0) state = 0x85ebca6b;

  function next() {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  }

  next.next = next;
  next.seed = seed >>> 0;
  return next;
}

/** Pull the next float in [0, 1) from a generator made by createRandom. */
function draw(rng) {
  if (typeof rng === 'function') return rng();
  return rng.next();
}

/** An integer in [a, b], both ends inclusive. */
export function randInt(rng, a, b) {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return lo + Math.floor(draw(rng) * (hi - lo + 1));
}

/** A float in [a, b). */
export function randFloat(rng, a, b) {
  return a + draw(rng) * (b - a);
}

/** One element of a non-empty array, uniformly. */
export function pick(rng, arr) {
  return arr[Math.floor(draw(rng) * arr.length)];
}
