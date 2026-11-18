// input.js — keyboard + mouse + wheel for VELMORA: Sunset Streets.
// createInput returns {read()}; read() builds one fresh input object per
// frame. Edge flags (enter, shoot, punch, confirm, pause, mute, camCycle)
// are true only on the frame the key or click went down, then consumed.

const GAME_KEYS = new Set([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space',
]);

export function createInput(canvas, toWorld) {
  const keys = new Set();
  const pressed = new Set();
  let mouseX = 0;
  let mouseY = 0;
  let mouseDownEdge = false;
  let mouseHeld = false;
  let wheelDelta = 0;
  let camCycleEdge = false;

  function markPressed(code) {
    if (!keys.has(code)) pressed.add(code);
    keys.add(code);
  }

  function onKeyDown(ev) {
    if (GAME_KEYS.has(ev.code)) ev.preventDefault();
    if (ev.repeat) return;
    markPressed(ev.code);
    if (ev.code === 'KeyC') camCycleEdge = true;
  }

  function onKeyUp(ev) {
    keys.delete(ev.code);
  }

  function onMouseMove(ev) {
    const rect = canvas ? canvas.getBoundingClientRect() : { left: 0, top: 0 };
    mouseX = ev.clientX - rect.left;
    mouseY = ev.clientY - rect.top;
  }

  function onMouseDown(ev) {
    onMouseMove(ev);
    if (!mouseHeld) mouseDownEdge = true;
    mouseHeld = true;
  }

  function onMouseUp() {
    mouseHeld = false;
  }

  function onWheel(ev) {
    ev.preventDefault();
    wheelDelta += ev.deltaY > 0 ? 1 : -1;
  }

  function onBlur() {
    keys.clear();
    mouseHeld = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  if (canvas) {
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
  }

  function down(code) {
    return keys.has(code);
  }

  function edge(code) {
    return pressed.has(code);
  }

  function read() {
    const up = down('KeyW') || down('ArrowUp');
    const dn = down('KeyS') || down('ArrowDown');
    const left = down('KeyA') || down('ArrowLeft');
    const right = down('KeyD') || down('ArrowRight');

    // World-space aim when a converter was supplied, else screen coords.
    let wx = mouseX;
    let wy = mouseY;
    if (typeof toWorld === 'function') {
      try {
        const w = toWorld(mouseX, mouseY);
        if (w) {
          wx = w.x;
          wy = w.y;
        }
      } catch (err) {
        // Keep screen coords if the converter fails this frame.
      }
    }

    const click = mouseDownEdge;
    const out = {
      mx: (right ? 1 : 0) - (left ? 1 : 0),
      my: (dn ? 1 : 0) - (up ? 1 : 0),
      accel: (up ? 1 : 0) - (dn ? 1 : 0),
      steer: (right ? 1 : 0) - (left ? 1 : 0),
      enter: edge('KeyE'),
      shoot: click,
      punch: edge('Space'),
      confirm: edge('Enter') || click,
      pause: edge('KeyP') || edge('Escape'),
      mute: edge('KeyM'),
      camCycle: camCycleEdge,
      zoomDelta: wheelDelta,
      mouse: { x: wx, y: wy, down: mouseHeld },
    };

    // Consume this frame's edges so they fire exactly once.
    pressed.clear();
    mouseDownEdge = false;
    wheelDelta = 0;
    camCycleEdge = false;
    return out;
  }

  return { read };
}
