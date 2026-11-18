// save.js — localStorage persistence for VELMORA: Sunset Streets.
// Every read and write is guarded: in a private window or a blocked
// context localStorage throws, and the game must keep playing regardless.

import { SAVE_KEY } from './config.js';

function readRaw() {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(SAVE_KEY);
  } catch (err) {
    return null;
  }
}

function clampDist(d) {
  const n = Number(d);
  if (!Number.isFinite(n)) return 210;
  return Math.max(160, Math.min(1400, n));
}

function cleanCamera(cam) {
  const mode = cam && (cam.mode === 'follow' || cam.mode === 'chase' || cam.mode === 'high')
    ? cam.mode
    : 'follow';
  return { mode, dist: clampDist(cam ? cam.dist : 210) };
}

export function loadSave() {
  const raw = readRaw();
  if (!raw) return null;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  return {
    missionsDone: Math.max(0, Math.floor(Number(parsed.missionsDone) || 0)),
    cash: Math.max(0, Math.floor(Number(parsed.cash) || 0)),
    bestCash: Math.max(0, Math.floor(Number(parsed.bestCash) || 0)),
    muted: parsed.muted === true,
    camera: cleanCamera(parsed.camera),
  };
}

export function saveGame(data) {
  if (!data || typeof data !== 'object') return false;
  const record = {
    missionsDone: Math.max(0, Math.floor(Number(data.missionsDone) || 0)),
    cash: Math.max(0, Math.floor(Number(data.cash) || 0)),
    bestCash: Math.max(0, Math.floor(Number(data.bestCash) || 0)),
    muted: data.muted === true,
    camera: cleanCamera(data.camera),
  };
  try {
    if (typeof localStorage === 'undefined') return false;
    localStorage.setItem(SAVE_KEY, JSON.stringify(record));
    return true;
  } catch (err) {
    return false;
  }
}

export function clearSave() {
  try {
    if (typeof localStorage === 'undefined') return false;
    localStorage.removeItem(SAVE_KEY);
    return true;
  } catch (err) {
    return false;
  }
}
