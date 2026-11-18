# gta6-01
[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/Gustronger/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/Gustronger/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
VELMORA — Sunset Streets: an original 3D open-world crime game. Explore a sun-soaked coastal city on foot and by car, steal cars, outrun the VPD wanted level, and run five story jobs for fixer Nadia Sol — now rendered in 3D with three.js.

## The 3D version

The simulation still runs on the 2D ground plane (x, y), but the city is drawn in 3D: glass Downtown towers, low Old Town houses, Docks warehouses and cranes, streetlights, park trees, and a pulsing beacon column over the active mission marker. Bullets fly at muzzle height, particles arc up and fall back to the ground, and gunshots, punches and pickups are positional audio — louder and panned by where they happen relative to Milo.

Three cameras, all driven from the same `state.camera` (`mode`, `dist`, `yaw`):

- **follow** — third-person, behind Milo on foot
- **chase** — low behind the car while driving (automatic when you get in a car)
- **high** — elevated wide view over the city

The camera switches automatically between follow and chase as you get in and out of cars, unless you lock in a mode yourself.

## Controls

- **WASD / arrows** — move on foot, drive (W accelerate, S brake/reverse, A/D steer)
- **Mouse** — aim, click to shoot
- **Space** — punch
- **E** — enter / steal a car, exit, buy at the gun shop
- **C** — cycle camera: follow → chase → high (your choice is saved)
- **Mouse wheel** — zoom the camera in and out
- **P / Esc** — pause
- **M** — mute
- **Enter / click** — start, resume, retry

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080. No build step, no network: the game, its three.js renderer and all sound are local files.

## The city

Four districts — Old Town (NW), Downtown (NE), Marina (SW, beach and boardwalk), Docks (SE, warehouses and cranes) — on a 4096×4096 map with a seeded road grid, so the same seed always builds the same Velmora. Five story missions from Nadia Sol, plus taxi fares and cash stashes. Wanted level 0–5, VPD cars and foot cops, pay-n-spray garages, and the gold Aurora GT waiting Downtown.

---
<sub>Entered on [make.fun](https://make.fun/?ref=29zfswpd&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
