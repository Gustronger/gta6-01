// Keyboard + pointer input for Velmora. Held keys steer and move; one-shot presses
// (enter a car, punch, confirm, pause, mute) are latched and handed out once, on the
// next read() call, so a quick tap between two frames is never lost or double-counted.
// read() returns the input object world.step expects, with mouse x/y in SCREEN coords
// (CSS pixels relative to the canvas); main.js converts them to world coords.
// C cycles the 3D camera (camToggle edge flag); the mouse wheel zooms it
// (zoom: accumulated wheel delta, consumed — reset to 0 — on each read()).

const MOVE_UP = new Set(['KeyW', 'ArrowUp']);
const MOVE_DOWN = new Set(['KeyS', 'ArrowDown']);
const MOVE_LEFT = new Set(['KeyA', 'ArrowLeft']);
const MOVE_RIGHT = new Set(['KeyD', 'ArrowRight']);
const ENTER_KEYS = new Set(['KeyE']);
const PUNCH_KEYS = new Set(['Space']);
const CONFIRM_KEYS = new Set(['Enter']);
const PAUSE_KEYS = new Set(['KeyP', 'Escape']);
const MUTE_KEYS = new Set(['KeyM']);
const CAMERA_KEYS = new Set(['KeyC']);

// Every key that belongs to the game: these never scroll the page or trigger the browser.
const GAME_KEYS = new Set([
  ...MOVE_UP, ...MOVE_DOWN, ...MOVE_LEFT, ...MOVE_RIGHT,
  ...ENTER_KEYS, ...PUNCH_KEYS, ...CONFIRM_KEYS, ...PAUSE_KEYS, ...MUTE_KEYS,
  ...CAMERA_KEYS,
]);

export function createInput(canvas) {
  const held = new Set();
  let mouseX = 0;
  let mouseY = 0;
  let mouseDown = false;
  // Latched one-shot presses, cleared when read() hands them out.
  let enterQueued = false;
  let punchQueued = false;
  let confirmQueued = false;
  let pauseQueued = false;
  let muteQueued = false;
  let camToggleQueued = false;
  // Mouse-wheel zoom, accumulated since the last read() and consumed there.
  let wheelDelta = 0;

  window.addEventListener('keydown', (event) => {
    if (!GAME_KEYS.has(event.code)) return;
    event.preventDefault();
    if (event.repeat) return;
    held.add(event.code);
    if (ENTER_KEYS.has(event.code)) enterQueued = true;
    else if (PUNCH_KEYS.has(event.code)) punchQueued = true;
    else if (CONFIRM_KEYS.has(event.code)) confirmQueued = true;
    else if (PAUSE_KEYS.has(event.code)) pauseQueued = true;
    else if (MUTE_KEYS.has(event.code)) muteQueued = true;
    else if (CAMERA_KEYS.has(event.code)) camToggleQueued = true;
  });

  window.addEventListener('keyup', (event) => {
    held.delete(event.code);
  });

  // A key let go while the tab is hidden never sends keyup: drop everything on blur.
  window.addEventListener('blur', () => {
    held.clear();
    mouseDown = false;
  });

  function trackPointer(event) {
    const rect = canvas.getBoundingClientRect();
    mouseX = event.clientX - rect.left;
    mouseY = event.clientY - rect.top;
  }

  canvas.addEventListener('pointermove', trackPointer);
  canvas.addEventListener('pointerdown', (event) => {
    trackPointer(event);
    mouseDown = true;
    // A click on the canvas is also a confirm (start on the title screen, retry after game over).
    confirmQueued = true;
  });
  window.addEventListener('pointerup', () => {
    mouseDown = false;
  });
  canvas.addEventListener('pointerleave', () => {
    mouseDown = false;
  });

  // Mouse wheel: zoom the 3D camera in/out. Accumulated here, consumed by
  // read() as `zoom` (reset to 0 after each read).
  canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    wheelDelta += event.deltaY;
  }, { passive: false });

  function anyHeld(codes) {
    for (const code of codes) if (held.has(code)) return true;
    return false;
  }

  return {
    /** Fresh input for this frame; edge flags are true only on the read after the press. */
    read() {
      const up = anyHeld(MOVE_UP);
      const down = anyHeld(MOVE_DOWN);
      const left = anyHeld(MOVE_LEFT);
      const right = anyHeld(MOVE_RIGHT);
      const input = {
        mx: (right ? 1 : 0) - (left ? 1 : 0),
        my: (down ? 1 : 0) - (up ? 1 : 0),
        accel: (up ? 1 : 0) - (down ? 1 : 0),
        steer: (right ? 1 : 0) - (left ? 1 : 0),
        enter: enterQueued,
        shoot: mouseDown,
        punch: punchQueued,
        confirm: confirmQueued,
        pause: pauseQueued,
        mute: muteQueued,
        camToggle: camToggleQueued,
        zoom: wheelDelta,
        mouse: { x: mouseX, y: mouseY, down: mouseDown },
      };
      enterQueued = false;
      punchQueued = false;
      confirmQueued = false;
      pauseQueued = false;
      muteQueued = false;
      camToggleQueued = false;
      wheelDelta = 0;
      return input;
    },
  };
}
