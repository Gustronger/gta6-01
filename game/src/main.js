// Boot and the one loop: input is read once per frame, the world advances in fixed
// 1/60 s steps (several in a slow frame, none in a fast one), and the renderer paints
// what is there. The game moves between four screens: title, play, paused, game over.
//
// ?seed=N fixes the city and traffic. ?shot=cover|chase|mission|start (with &seed=N)
// stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.
import {
  EVENT_BUSTED, EVENT_CRASH, EVENT_HIT, EVENT_MISSION, EVENT_MISSION_DONE,
  EVENT_PICKUP, EVENT_PUNCH, EVENT_SHOT, EVENT_STEAL, EVENT_WANTED_DOWN,
  EVENT_WANTED_UP, EVENT_WASTED, STEP,
} from './config.js';
import { createRandom } from './random.js';
import { createCity } from './city.js';
import { createWorld } from './world.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { loadSave, saveGame } from './save.js';
import { MISSIONS, startMission } from './missions.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;
/** How long a mission card stays on screen, in milliseconds. */
const MESSAGE_MS = 4500;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const rng = createRandom(seed);
const city = createCity(rng);
const world = createWorld(rng, city);
const renderer = createRenderer(canvas);

let save = null;
try {
  save = loadSave();
} catch {
  save = null;
}

function runShot(name) {
  const scene = stageShot(name, world);
  const ui = { best: scene.best, save, message: null, overKind: null };
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, ui);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  const audio = createAudio();
  if (save && save.muted) audio.setMuted(true);
  let screen = SCREEN_TITLE;
  let best = (save && save.bestCash) || 0;
  // Jobs finished across visits: the world resets its own stats on every
  // start, so this counter lives here and survives world.reset().
  let missionsDone = (save && save.missionsDone) || 0;
  let overKind = null;
  let message = null;
  let messageUntil = 0;
  let accumulator = 0;
  let last = performance.now();

  // Screen readers (and anyone watching the page's text) hear the screen changes.
  function announce(text) {
    status.textContent = text;
  }

  function persist() {
    const state = world.state;
    const cash = Math.round(state.player.cash || 0);
    if (cash > best) best = cash;
    try {
      saveGame({
        missionsDone,
        cash,
        bestCash: best,
        muted: audio.muted,
      });
    } catch {
      // Storage can be off (private windows): progress then lasts this visit only.
    }
  }

  function showMessage(text) {
    message = text;
    messageUntil = performance.now() + MESSAGE_MS;
  }

  function startGame() {
    world.reset();
    // Resume the story where the save left it (replay the finale once done).
    startMission(world.state, Math.min(missionsDone, MISSIONS.length - 1));
    accumulator = 0;
    overKind = null;
    message = null;
    screen = SCREEN_PLAY;
    audio.ensure();
    audio.musicStart();
    announce('Playing. Milo is on the streets of Velmora.');
  }

  function endGame(kind) {
    overKind = kind;
    screen = SCREEN_OVER;
    persist();
    audio.musicStop();
    announce(kind === 'busted'
      ? 'Busted. The VPD took Milo in. Cash ' + Math.round(world.state.player.cash || 0) + '. Best ' + best + '.'
      : 'Wasted. Milo went down. Cash ' + Math.round(world.state.player.cash || 0) + '. Best ' + best + '.');
  }

  function handleEvents(events) {
    if (!events) return;
    if (events & EVENT_SHOT) audio.sfx('shot');
    if (events & EVENT_PUNCH) audio.sfx('punch');
    if (events & EVENT_PICKUP) {
      audio.sfx('pickup');
      announce('Picked up. Cash ' + Math.round(world.state.player.cash || 0) + '.');
    }
    if (events & EVENT_CRASH) audio.sfx('crash');
    if (events & EVENT_STEAL) {
      audio.sfx('steal');
      announce('Car stolen. The heat is on.');
    }
    if (events & EVENT_HIT) announce('Milo took a hit. Health ' + Math.round(world.state.player.health || 0) + '.');
    if (events & EVENT_WANTED_UP) {
      audio.sfx('siren');
      announce('Wanted level ' + (world.state.player.wanted || 0) + '. Lose the cops.');
    }
    if (events & EVENT_WANTED_DOWN) announce('The heat is dying down.');
    if (events & EVENT_MISSION) {
      audio.sfx('mission');
      const objective = world.state.mission && world.state.mission.objective;
      showMessage(objective ? 'New job — ' + objective : 'New job from Nadia.');
      announce('New job: ' + (objective || ''));
    }
    if (events & EVENT_MISSION_DONE) {
      audio.sfx('cash');
      missionsDone += 1;
      showMessage('Job complete — Nadia pays up.');
      announce('Job complete. Missions done: ' + missionsDone + '.');
      persist();
    }
    if (events & EVENT_BUSTED) {
      audio.sfx('busted');
      endGame('busted');
    } else if (events & EVENT_WASTED) {
      audio.sfx('wasted');
      endGame('wasted');
    }
  }

  // Idle input for the ambient city behind the title screen.
  function idleWorldInput() {
    return {
      mx: 0, my: 0, accel: 0, steer: 0,
      enter: false, shoot: false, punch: false, confirm: false, pause: false, mute: false,
      mouse: { x: 0, y: 0, down: false },
    };
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    const raw = input.read();

    // Mute is global: it works on every screen and is remembered in the save.
    if (raw.mute) {
      audio.ensure();
      audio.setMuted(!audio.muted);
      persist();
      announce(audio.muted ? 'Muted.' : 'Sound on.');
    }

    // Screen transitions from the edge flags of this frame's input.
    let justStarted = false;
    if (raw.confirm && (screen === SCREEN_TITLE || screen === SCREEN_OVER)) {
      startGame();
      justStarted = true;
    } else if (raw.pause && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if ((raw.pause || raw.confirm) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Playing.');
    }

    // The input the world sees: mouse converted from screen coords to world coords.
    // A press made on the title screen must not act on the first play frame.
    const aim = renderer.screenToWorld(raw.mouse.x, raw.mouse.y);
    const worldInput = {
      mx: raw.mx, my: raw.my, accel: raw.accel, steer: raw.steer,
      enter: justStarted ? false : raw.enter,
      shoot: justStarted ? false : raw.shoot,
      punch: justStarted ? false : raw.punch,
      confirm: false, pause: false, mute: false,
      mouse: { x: aim.x, y: aim.y, down: justStarted ? false : raw.mouse.down },
    };

    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      let firstStep = true;
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        if (screen === SCREEN_TITLE) {
          world.step(STEP, idleWorldInput());
        } else {
          const events = world.step(STEP, worldInput);
          handleEvents(events);
          if (!firstStep) {
            // Edge flags fire once per frame, not once per fixed step.
            worldInput.enter = false;
            worldInput.punch = false;
          }
          firstStep = false;
        }
        accumulator -= STEP;
      }
      // Engine hum + siren follow the live state while playing.
      if (screen === SCREEN_PLAY) {
        const player = world.state.player;
        audio.engine(player.car ? Math.abs(player.car.speed || 0) : 0, !player.onFoot);
        audio.siren((player.wanted || 0) > 0);
      }
    } else {
      accumulator = 0;
    }

    if (message && now > messageUntil) message = null;
    renderer.draw(world.state, screen, { best, save, message, overKind });
  }

  // Leaving the tab pauses a running game rather than letting the city move unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Velmora Sunset Streets. Press Enter or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
