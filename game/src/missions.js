// missions.js — the five story jobs Nadia Sol hands Milo Vane in Velmora.
// Step coordinates are never hardcoded: startMission derives every marker
// from the live city (garages, hideout, docks and marina quarters), so the
// same definitions work on any seeded city layout.

import {
  EVENT_MISSION,
  EVENT_MISSION_DONE,
  EVENT_WANTED_UP,
} from './config.js';

export const MISSIONS = [
  {
    id: 1,
    title: 'First Wheels',
    briefing: 'Nadia needs wheels. Steal any car and bring it to her garage in Downtown.',
    reward: 300,
    steps: [
      { text: 'Steal any car', type: 'steal', x: 0, y: 0, radius: 90 },
      { text: "Drive to Nadia's garage in Downtown", type: 'goto', x: 0, y: 0, radius: 110 },
    ],
  },
  {
    id: 2,
    title: 'Payday Run',
    briefing: 'Pick up the package at the Docks and deliver it to the Marina. The VPD will be watching.',
    reward: 600,
    steps: [
      { text: 'Pick up the package at the Docks', type: 'goto', x: 0, y: 0, radius: 110 },
      { text: 'Deliver the package to the Marina', type: 'deliver', x: 0, y: 0, radius: 110 },
    ],
  },
  {
    id: 3,
    title: 'Dockside Deal',
    briefing: 'The Cobras are holding Nadia\'s cash at the Docks. Clear them out and collect it.',
    reward: 900,
    steps: [
      { text: 'Reach the Docks', type: 'goto', x: 0, y: 0, radius: 130 },
      { text: 'Eliminate the Cobras (4)', type: 'eliminate', x: 0, y: 0, radius: 260, count: 4 },
      { text: 'Collect the cash', type: 'goto', x: 0, y: 0, radius: 90 },
    ],
  },
  {
    id: 4,
    title: 'The Getaway',
    briefing: 'Three stars and no way out but speed. Lose the VPD, then reach the hideout before the trail goes cold.',
    reward: 1200,
    steps: [
      { text: 'Lose the wanted level', type: 'escape', x: 0, y: 0, radius: 0 },
      { text: 'Reach the hideout in time', type: 'goto', x: 0, y: 0, radius: 110 },
    ],
  },
  {
    id: 5,
    title: 'Harbor Lights',
    briefing: 'The gold Aurora GT is parked in Downtown. Take it and deliver it to the Marina. No scratches.',
    reward: 2500,
    steps: [
      { text: 'Steal the gold Aurora GT in Downtown', type: 'steal', x: 0, y: 0, radius: 110 },
      { text: 'Deliver the Aurora GT to the Marina', type: 'deliver', x: 0, y: 0, radius: 110 },
    ],
  },
];

function dist(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

function nearestTo(list, x, y) {
  let best = null;
  let bestD = Infinity;
  for (const item of list || []) {
    const d = dist(item.x, item.y, x, y);
    if (d < bestD) {
      bestD = d;
      best = item;
    }
  }
  return best;
}

// Quarter centres of the 4096x4096 world: NW Old Town, NE Downtown,
// SW Marina, SE Docks. Used only to pick city features by neighbourhood.
const QUARTERS = {
  downtown: { x: 3072, y: 1024 },
  docks: { x: 3072, y: 3072 },
  marina: { x: 1024, y: 3072 },
  oldtown: { x: 1024, y: 1024 },
};

function garageNear(city, quarter) {
  const g = nearestTo(city.garages || [], quarter.x, quarter.y);
  return g ? { x: g.x, y: g.y } : { x: quarter.x, y: quarter.y };
}

function hideoutPoint(city) {
  if (city.hideout) return { x: city.hideout.x, y: city.hideout.y };
  return { x: QUARTERS.oldtown.x, y: QUARTERS.oldtown.y };
}

function roadPointNear(city, quarter) {
  if (city.roads && city.roads.length) {
    const road = nearestTo(
      city.roads.map((r) => ({ x: (r.x1 + r.x2) / 2, y: (r.y1 + r.y2) / 2 })),
      quarter.x,
      quarter.y,
    );
    if (road) return { x: road.x, y: road.y };
  }
  return { x: quarter.x, y: quarter.y };
}

function freshMission() {
  return { index: -1, step: 0, objective: '', marker: null, timer: 0, progress: 0, spawned: false };
}

export function startMission(state, index) {
  const def = MISSIONS[index];
  if (!def || !state || !state.city) return;
  const city = state.city;
  const downtownGarage = garageNear(city, QUARTERS.downtown);
  const docksPoint = roadPointNear(city, QUARTERS.docks);
  const marinaPoint = roadPointNear(city, QUARTERS.marina);
  const hideout = hideoutPoint(city);

  const steps = def.steps.map((s) => ({ ...s }));
  if (def.id === 1) {
    steps[1].x = downtownGarage.x;
    steps[1].y = downtownGarage.y;
  } else if (def.id === 2) {
    steps[0].x = docksPoint.x;
    steps[0].y = docksPoint.y;
    steps[1].x = marinaPoint.x;
    steps[1].y = marinaPoint.y;
  } else if (def.id === 3) {
    steps[0].x = docksPoint.x;
    steps[0].y = docksPoint.y;
    steps[1].x = docksPoint.x;
    steps[1].y = docksPoint.y;
    steps[2].x = docksPoint.x + 140;
    steps[2].y = docksPoint.y + 60;
  } else if (def.id === 4) {
    steps[1].x = hideout.x;
    steps[1].y = hideout.y;
  } else if (def.id === 5) {
    steps[0].x = downtownGarage.x;
    steps[0].y = downtownGarage.y;
    steps[1].x = marinaPoint.x;
    steps[1].y = marinaPoint.y;
  }

  state.mission = {
    index,
    step: 0,
    objective: steps[0].text,
    marker: steps[0].type === 'steal' && def.id !== 5 ? null : { x: steps[0].x, y: steps[0].y },
    timer: 0,
    progress: 0,
    spawned: false,
    steps,
  };
  // Mission 4 opens hot: three stars from the first second.
  if (def.id === 4) {
    state.player.wanted = 3;
  }
  // Mission 2: the heat turns up once the package is picked up.
  if (def.id === 2) {
    state.mission.chaseOnPickup = true;
  }
}

function advanceStep(state) {
  const m = state.mission;
  m.step += 1;
  m.progress = 0;
  m.spawned = false;
  if (m.step >= m.steps.length) return false;
  const next = m.steps[m.step];
  m.objective = next.text;
  m.marker = { x: next.x, y: next.y };
  if (next.type === 'deliver') m.timer = 75;
  if (next.type === 'escape') m.timer = 90;
  return true;
}

function spawnMissionEnemies(state, step) {
  const count = step.count || 4;
  const baseX = step.x;
  const baseY = step.y;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    state.enemies.push({
      x: baseX + Math.cos(a) * 120,
      y: baseY + Math.sin(a) * 120,
      angle: a,
      hp: 60,
      weapon: 'pistol',
      state: 'chase',
      shootTimer: 1 + i * 0.4,
    });
  }
  state.mission.spawned = true;
}

export function updateMission(state, dt) {
  if (!state || !state.mission) return 0;
  const m = state.mission;
  if (m.index < 0 || m.index >= MISSIONS.length) return 0;
  if (m.step >= m.steps.length) return 0;
  const def = MISSIONS[m.index];
  const step = m.steps[m.step];
  let flags = 0;
  const p = state.player;

  if (m.timer > 0) {
    m.timer -= dt;
    if (m.timer <= 0) {
      // Out of time: the job falls through and Nadia stops waiting.
      state.mission = freshMission();
      state.mission.objective = 'Mission failed — the window closed.';
      return EVENT_MISSION;
    }
  }

  if (step.type === 'steal') {
    if (p.car) {
      if (def.id === 5) {
        // The Aurora GT is the gold sport car: only that steal counts.
        if (p.car.kind === 'sport') {
          if (advanceStep(state)) flags |= EVENT_MISSION;
        }
      } else if (advanceStep(state)) {
        flags |= EVENT_MISSION;
      }
    } else if (m.marker) {
      // Keep the beacon on the target car while the player is on foot.
      m.marker = { x: step.x, y: step.y };
    }
  } else if (step.type === 'goto' || step.type === 'deliver') {
    if (dist(p.x, p.y, step.x, step.y) < step.radius) {
      if (def.id === 2 && m.step === 0) {
        // Picked up: the VPD is now on the tail for the delivery leg.
        p.wanted = Math.max(p.wanted, 2);
        flags |= EVENT_WANTED_UP;
      }
      if (advanceStep(state)) {
        flags |= EVENT_MISSION;
      } else {
        flags |= completeMission(state, def);
      }
    }
  } else if (step.type === 'eliminate') {
    if (!m.spawned) spawnMissionEnemies(state, step);
    const alive = state.enemies.filter((e) => e.hp > 0).length;
    m.progress = (step.count || 4) - alive;
    if (alive === 0) {
      if (advanceStep(state)) flags |= EVENT_MISSION;
    }
  } else if (step.type === 'escape') {
    if (p.wanted === 0) {
      if (advanceStep(state)) {
        // The hideout leg is timed: 60 seconds once the heat is off.
        if (def.id === 4) m.timer = 60;
        flags |= EVENT_MISSION;
      }
    }
  }

  // A step that just finished the last entry completes the mission.
  if (m.step >= m.steps.length && flags === 0) {
    flags |= completeMission(state, def);
  }
  return flags;
}

function completeMission(state, def) {
  const m = state.mission;
  state.player.cash += def.reward;
  state.stats.cashEarned += def.reward;
  state.stats.missionsDone += 1;
  state.mission = {
    index: m.index,
    step: m.steps.length,
    objective: def.title + ' complete — $' + def.reward + ' earned.',
    marker: null,
    timer: 0,
    progress: 0,
    spawned: false,
    steps: m.steps,
  };
  return EVENT_MISSION_DONE;
}

export function markerBeacon(state) {
  if (!state || !state.mission || !state.mission.marker) return null;
  const mk = state.mission.marker;
  const pulse = 0.5 + 0.5 * Math.sin((state.time || 0) * 4);
  return { x: mk.x, y: mk.y, height: 120, pulse };
}
