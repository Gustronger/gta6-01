// VELMORA — Sunset Streets: story missions.
//
// Five story jobs handed out by fixer Nadia Sol. Each def describes its steps
// in plain data; startMission plants the mission on the world state and
// updateMission watches the state each step and advances it. This module only
// reads and writes the state shape from DESIGN.md — it never spawns traffic,
// police or enemies itself. The world module is responsible for putting the
// right actors in the world when a mission starts (4 Cobras at the Docks for
// mission 3, the gold sport car Downtown for mission 5).
import { EVENT_MISSION, EVENT_MISSION_DONE } from './config.js';

// Road lines from the city grid; every marker below sits on an intersection
// of two of these lines so it is always reachable by road.
const DOWNTOWN_GARAGE = { x: 2912, y: 1120 }; // NE Downtown
const DOCKS_PICKUP = { x: 3360, y: 2912 }; // SE Docks
const MARINA_DROP_A = { x: 1120, y: 3808 }; // SW Marina, by the beach
const DOCKS_YARD = { x: 2912, y: 2912 }; // SE Docks
const DOCKS_DEAL = { x: 3360, y: 3360 }; // SE Docks, container yard
const HIDEOUT = { x: 672, y: 672 }; // NW Old Town
const AURORA_SPOT = { x: 2464, y: 672 }; // NE Downtown
const MARINA_DROP_B = { x: 1568, y: 3808 }; // SW Marina, boardwalk

export const MISSIONS = [
  {
    id: 'first-wheels',
    title: 'First Wheels',
    briefing:
      "Nadia Sol: 'Milo, you owe, I collect. First job is simple — lift a car, any car, and bring it to my garage Downtown. Don't scratch it more than it already is.'",
    reward: 300,
    landmark: "Nadia's garage",
    steps: [
      { text: 'Steal a car', type: 'steal', x: DOWNTOWN_GARAGE.x, y: DOWNTOWN_GARAGE.y, radius: 120 },
      { text: "Drive to Nadia's garage in Downtown", type: 'goto', x: DOWNTOWN_GARAGE.x, y: DOWNTOWN_GARAGE.y, radius: 120 },
    ],
  },
  {
    id: 'payday-run',
    title: 'Payday Run',
    briefing:
      "Nadia Sol: 'A package is waiting at the Docks. Pick it up and run it to the Marina. The VPD will be on you the moment you grab it — don't stop, don't get cute.'",
    reward: 600,
    landmark: 'the docks cranes',
    // Seconds allowed for the delivery leg, counted from the pickup.
    timeLimit: 150,
    steps: [
      { text: 'Pick up the package at the Docks', type: 'goto', x: DOCKS_PICKUP.x, y: DOCKS_PICKUP.y, radius: 100 },
      { text: 'Deliver the package to the Marina', type: 'deliver', x: MARINA_DROP_A.x, y: MARINA_DROP_A.y, radius: 120 },
    ],
  },
  {
    id: 'dockside-deal',
    title: 'Dockside Deal',
    briefing:
      "Nadia Sol: 'The Cobras skimmed my cut at the Docks. Go down there, put four of them on the ground, and bring me the cash they were sitting on.'",
    reward: 900,
    landmark: 'the container yard',
    steps: [
      { text: 'Go to the Docks', type: 'goto', x: DOCKS_YARD.x, y: DOCKS_YARD.y, radius: 150 },
      { text: 'Eliminate 4 Cobras', type: 'eliminate', x: DOCKS_DEAL.x, y: DOCKS_DEAL.y, radius: 200, count: 4 },
      { text: 'Collect the cash', type: 'goto', x: DOCKS_DEAL.x, y: DOCKS_DEAL.y, radius: 100 },
    ],
  },
  {
    id: 'the-getaway',
    title: 'The Getaway',
    briefing:
      "Nadia Sol: 'Commissioner Hale put three stars on your head, Milo. Shake every last cop, then get to the hideout in Old Town before they box you in. The clock is running.'",
    reward: 1200,
    landmark: 'the Old Town hideout',
    // Whole escape must be finished inside this window.
    timeLimit: 180,
    steps: [
      { text: 'Lose the cops — get your wanted level to zero', type: 'escape', x: HIDEOUT.x, y: HIDEOUT.y, radius: 150 },
      { text: 'Reach the hideout in Old Town', type: 'goto', x: HIDEOUT.x, y: HIDEOUT.y, radius: 120 },
    ],
  },
  {
    id: 'harbor-lights',
    title: 'Harbor Lights',
    briefing:
      "Nadia Sol: 'Last one, and it's the big one. A gold Aurora GT is parked Downtown — the only one in Velmora. Steal it and bring it to the Marina. Do this and your debt is gone.'",
    reward: 2500,
    landmark: 'the Downtown towers',
    steps: [
      { text: 'Steal the gold Aurora GT in Downtown', type: 'steal', x: AURORA_SPOT.x, y: AURORA_SPOT.y, radius: 120 },
      { text: 'Deliver the Aurora GT to the Marina', type: 'deliver', x: MARINA_DROP_B.x, y: MARINA_DROP_B.y, radius: 120 },
    ],
  },
];

function distance(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

// 3D beacon for the current mission marker: a tall pulsing column the
// renderer draws over the marker. Null when no mission marker is active.
export function markerBeacon(state) {
  if (!state || !state.mission || !state.mission.marker) return null;
  const marker = state.mission.marker;
  const time = (state && typeof state.time === 'number') ? state.time : 0;
  return {
    x: marker.x,
    y: marker.y,
    height: 120,
    pulse: (Math.sin(time * 5) + 1) / 2,
  };
}

// Plant mission `index` on the state: objective, marker, timer and the kill
// baseline the eliminate step measures against. Wanted is set here for the
// two chases: 2 stars for the Payday Run, 3 for the Getaway.
export function startMission(state, index) {
  if (!state || !state.player || !state.mission) return 0;
  const def = MISSIONS[index];
  if (!def) return 0;
  if (index === 1) state.player.wanted = 2;
  if (index === 3) state.player.wanted = 3;
  state.mission.index = index;
  state.mission.step = 0;
  state.mission.objective = def.steps[0].text;
  state.mission.marker = { x: def.steps[0].x, y: def.steps[0].y };
  // Mission 4's clock runs from the start; mission 2's starts at the pickup.
  state.mission.timer = index === 3 ? def.timeLimit || 0 : 0;
  state.mission.killsStart = state.stats ? state.stats.kills || 0 : 0;
  return EVENT_MISSION;
}

// Advance the active mission one step if its condition is met, pay out and
// auto-advance when the last step clears. Returns EVENT_* flags.
export function updateMission(state, dt) {
  if (!state || !state.mission || !state.player) return 0;
  const index = state.mission.index;
  if (index < 0 || index >= MISSIONS.length) return 0;
  const def = MISSIONS[index];

  // A running clock that hits zero restarts the mission from its briefing.
  if (state.mission.timer > 0) {
    state.mission.timer -= dt;
    if (state.mission.timer <= 0) {
      state.mission.timer = 0;
      startMission(state, index);
      return EVENT_MISSION;
    }
  }

  const step = def.steps[state.mission.step];
  if (!step) return 0;
  let done = false;
  if (step.type === 'goto' || step.type === 'deliver') {
    done = distance(state.player.x, state.player.y, step.x, step.y) <= step.radius;
  } else if (step.type === 'steal') {
    const car = state.player.car;
    // Harbor Lights needs the Aurora GT specifically: the gold sport car.
    // Any other steal just needs to be behind the wheel of something.
    if (index === 4) done = !!car && car.kind === 'sport';
    else done = !!car;
  } else if (step.type === 'eliminate') {
    const kills = state.stats ? state.stats.kills || 0 : 0;
    const start = state.mission.killsStart || 0;
    done = kills - start >= (step.count || 1);
  } else if (step.type === 'escape') {
    done = (state.player.wanted || 0) <= 0;
  }
  if (!done) return 0;

  state.mission.step += 1;
  if (state.mission.step >= def.steps.length) {
    const reward = def.reward || 0;
    state.player.cash = (state.player.cash || 0) + reward;
    if (state.stats) {
      state.stats.cashEarned = (state.stats.cashEarned || 0) + reward;
      state.stats.missionsDone = (state.stats.missionsDone || 0) + 1;
    }
    const next = index + 1;
    if (next < MISSIONS.length) {
      startMission(state, next);
      return EVENT_MISSION_DONE | EVENT_MISSION;
    }
    state.mission.index = MISSIONS.length;
    state.mission.step = 0;
    state.mission.objective = 'All missions complete — Velmora is yours.';
    state.mission.marker = null;
    state.mission.timer = 0;
    return EVENT_MISSION_DONE;
  }

  const nextStep = def.steps[state.mission.step];
  state.mission.objective = nextStep.text;
  state.mission.marker = { x: nextStep.x, y: nextStep.y };
  // The Payday Run delivery clock starts the moment the package is picked up.
  if (index === 1 && nextStep.type === 'deliver') {
    state.mission.timer = def.timeLimit || 150;
  }
  return EVENT_MISSION;
}
