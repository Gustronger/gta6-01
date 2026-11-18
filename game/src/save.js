// VELMORA — Sunset Streets: save game.
//
// One small record in localStorage: how many story missions are done, cash,
// best cash and the mute flag. Every access is guarded so private mode (or a
// missing localStorage) degrades to "no save" instead of throwing.
import { SAVE_KEY } from './config.js';

function storage() {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

function clean(data) {
  if (!data || typeof data !== 'object') return null;
  return {
    missionsDone: Number.isFinite(data.missionsDone) ? Math.max(0, Math.floor(data.missionsDone)) : 0,
    cash: Number.isFinite(data.cash) ? Math.max(0, Math.floor(data.cash)) : 0,
    bestCash: Number.isFinite(data.bestCash) ? Math.max(0, Math.floor(data.bestCash)) : 0,
    muted: !!data.muted,
  };
}

// Load the save, or null when there is none (or it is unreadable).
export function loadSave() {
  try {
    const store = storage();
    if (!store) return null;
    const raw = store.getItem(SAVE_KEY);
    if (!raw) return null;
    return clean(JSON.parse(raw));
  } catch {
    return null;
  }
}

// Persist a save record. Extra fields on `data` are dropped; only the four
// known fields are stored.
export function saveGame(data) {
  try {
    const store = storage();
    if (!store) return;
    const record = clean(data);
    if (!record) return;
    store.setItem(SAVE_KEY, JSON.stringify(record));
  } catch {
    // Storage can be off (private windows): the save then lasts this visit only.
  }
}

export function clearSave() {
  try {
    const store = storage();
    if (!store) return;
    store.removeItem(SAVE_KEY);
  } catch {
    // Nothing to clear if storage is unavailable.
  }
}
