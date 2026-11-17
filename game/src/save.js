// Save / load through localStorage. Stores cash, health, ammo, position,
// mission progress and the in-game clock — nothing else leaves the machine.
import { CONFIG } from './config.js';

export function saveGame(game) {
  const p = game.player;
  const data = {
    version: 1,
    cash: p.cash,
    health: p.health,
    ammoMag: p.ammoMag,
    ammoReserve: p.ammoReserve,
    x: p.pos.x,
    z: p.pos.z,
    heading: p.heading,
    clock: game.clockSeconds,
    missions: game.missions.serialize(),
    savedAt: new Date().toISOString(),
  };
  try {
    localStorage.setItem(CONFIG.saveKey, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(CONFIG.saveKey);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.version !== 1) return null;
    return data;
  } catch {
    return null;
  }
}

export function hasSave() {
  try {
    return !!localStorage.getItem(CONFIG.saveKey);
  } catch {
    return false;
  }
}

export function clearSave() {
  try { localStorage.removeItem(CONFIG.saveKey); } catch { /* private mode */ }
}
