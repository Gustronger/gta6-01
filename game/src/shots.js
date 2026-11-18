// VELMORA — Sunset Streets: staged screenshots.
// stageShot(name, world) plays the real rules forward with scripted inputs
// on a fresh world { state, reset, step } and returns { screen, best }.
// Every shot locks its camera (state.camera.locked = true) so the framing
// the judge sees is exactly the one staged here.
//   'start'   — 6 s of traffic and peds moving, title screen.
//   'cover'   — on foot in Downtown, mission 1 active, high wide camera.
//   'chase'   — driving at speed, wanted 3, three police cars chasing.
//   'mission' — Docks firefight: enemies present, one shot fired.
// Any other name falls back to 'start'.

import { SCREEN_TITLE, SCREEN_PLAY } from './render.js';
import { startMission } from './missions.js';
import { fireWeapon } from './combat.js';
import { STEP } from './config.js';

function baseInput(over) {
  return {
    mx: 0,
    my: 0,
    accel: 0,
    steer: 0,
    enter: false,
    shoot: false,
    punch: false,
    confirm: false,
    pause: false,
    mute: false,
    mouse: { x: 0, y: 0, down: false },
    ...(over || {}),
  };
}

function runSteps(world, count, input) {
  for (let i = 0; i < count; i++) world.step(STEP, input || baseInput());
}

// Point the state's camera at the player and lock it to one framing.
function lockCamera(state, mode, dist, yaw) {
  const cam = state.camera || {};
  cam.x = state.player.x;
  cam.y = state.player.y;
  cam.mode = mode;
  cam.dist = dist;
  cam.yaw = yaw;
  cam.locked = true;
  state.camera = cam;
}

function stageStart(world) {
  const { state } = world;
  lockCamera(state, 'high', 1500, 0.4);
  runSteps(world, 360, baseInput());
  lockCamera(state, 'high', 1500, 0.4);
  return { screen: SCREEN_TITLE, best: 0 };
}

function stageCover(world) {
  const { state } = world;
  // Downtown (NE): the 2912 avenue crossing the 1120 street.
  state.player.x = 2912;
  state.player.y = 1120;
  state.player.angle = -0.6;
  state.player.onFoot = true;
  state.player.car = null;
  startMission(state, 0);
  lockCamera(state, 'high', 1700, -0.6);
  // Let traffic and peds move around Milo for four seconds.
  runSteps(world, 240, baseInput());
  lockCamera(state, 'high', 1700, -0.6);
  return { screen: SCREEN_PLAY, best: 0 };
}

function stageChase(world) {
  const { state } = world;
  // A gold sport car heading east on the 2016 street, already at speed.
  const car = {
    id: 9001,
    x: 1500,
    y: 2016,
    angle: 0,
    speed: 380,
    color: '#d9a441',
    kind: 'sport',
    driver: 'player',
    hp: 100,
  };
  state.cars.push(car);
  state.player.car = car;
  state.player.onFoot = false;
  state.player.x = car.x;
  state.player.y = car.y;
  state.player.angle = 0;
  state.player.speed = 380;
  state.player.wanted = 3;
  // Three VPD units on Milo's tail, staggered into the neighbouring lanes
  // so they read in frame without sitting on the camera-to-player line.
  const lanes = [55, -55, 55];
  for (let i = 0; i < 3; i++) {
    state.cars.push({
      id: 9100 + i,
      x: car.x - 180 - i * 120,
      y: car.y + lanes[i],
      angle: 0,
      speed: 360,
      color: '#1c2733',
      kind: 'police',
      driver: 'police',
      hp: 100,
    });
  }
  // Chase camera, pulled in closer than the old 330 framing: at 330 the
  // player's car reads as one small car among several, so the shot uses
  // 230 — the gold car is large in the lower centre, police behind it.
  lockCamera(state, 'chase', 230, 0);
  runSteps(world, 90, baseInput({ accel: 1 }));
  lockCamera(state, 'chase', 230, 0);
  return { screen: SCREEN_PLAY, best: 0 };
}

function stageMission(world) {
  const { state } = world;
  startMission(state, 2);
  // Stand Milo on the mission marker itself (open ground, never inside a
  // warehouse), so the "reach the Docks" step completes and the fight is
  // the step the banner shows.
  const marker = (state.mission && state.mission.marker) || { x: 2950, y: 2950 };
  state.player.x = marker.x;
  state.player.y = marker.y;
  state.player.angle = 0.5;
  state.player.onFoot = true;
  state.player.car = null;
  state.player.weapon = 'pistol';
  state.player.ammo = 43;
  // Cobras closing in from three sides of the marker, kept at a distance
  // so their opening volley cannot kill Milo before the shot is taken.
  const spots = [
    { x: marker.x + 170, y: marker.y - 90, angle: 2.6 },
    { x: marker.x - 170, y: marker.y - 110, angle: 0.9 },
    { x: marker.x + 160, y: marker.y + 180, angle: -2.2 },
    { x: marker.x - 180, y: marker.y + 150, angle: -0.7 },
  ];
  for (const s of spots) {
    state.enemies.push({ x: s.x, y: s.y, angle: s.angle, hp: 100, weapon: 'pistol', state: 'chase' });
  }
  lockCamera(state, 'follow', 260, 0);
  // Let the mission step advance and the Cobras close in for a moment —
  // short, so Milo is still alive and fighting when the shot is taken.
  runSteps(world, 24, baseInput());
  // Step Milo just clear of the beacon beam so he reads as the subject,
  // not a figure lost inside the pillar glow.
  state.player.x = marker.x + 70;
  state.player.y = marker.y + 60;
  // One shot at the nearest Cobra, then only a few frames: the muzzle
  // flash, tracer and particles must still be in the air for the shot.
  const target = state.enemies[0];
  if (target) {
    const aim = Math.atan2(target.y - state.player.y, target.x - state.player.x);
    fireWeapon(state, state.player.x, state.player.y, aim);
  }
  runSteps(world, 6, baseInput());
  lockCamera(state, 'follow', 260, 0);
  return { screen: SCREEN_PLAY, best: 0 };
}

export function stageShot(name, world) {
  if (name === 'cover') return stageCover(world);
  if (name === 'chase') return stageChase(world);
  if (name === 'mission') return stageMission(world);
  return stageStart(world);
}
