# VELMORA — Sunset Streets

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/Gustronger/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/Gustronger/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

An original open-world crime game in the spirit of GTA 6, built for the
make.fun **gta6-01** bounty. Explore the sun-soaked coastal city of Velmora
on foot and by car, steal cars, outrun the VPD, take jobs from fixer
Nadia Sol, and fight the Cobras — all rendered in real 3D (three.js).

## Story

Milo Vane, a getaway driver new in town, owes a debt he cannot pay. Fixer
Nadia Sol has five jobs that can buy his freedom — if the VPD and the
Cobras let him finish them. Five story missions plus side jobs: taxi fares
and hidden cash stashes across four districts (Old Town, Downtown, Marina,
Docks).

## How to play

Serve `game/` with any static file server and open `game/index.html` in
desktop Chrome. No network, no build step — everything loads from files
under `game/`, including the vendored three.js build.

## Controls

| Input | Action |
| --- | --- |
| WASD / Arrows | Move on foot, drive |
| E | Enter / exit car, interact |
| Space | Punch |
| Mouse + Click | Aim, shoot |
| C | Cycle camera |
| Mouse wheel | Zoom camera |
| P / Esc | Pause |
| M | Mute |

Wanted level rises when you steal cars, hit pedestrians, or shoot in
public. Lose the heat at a pay-n-spray, or outrun it. Buy guns and ammo at
the gun shop. Progress saves to your browser automatically.

## Referral

Referral code: **29zfswpd**

## Tech

- three.js 0.187.0 (vendored under `game/vendor/`, minified ES module)
- Fixed 1/60 s simulation steps, seeded RNG, localStorage saves
- Screenshots are real renders of the game in a browser
