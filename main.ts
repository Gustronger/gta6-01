// VELMORA — Sunset Streets: make.fun gta6-01 entry program (Node 22, stdlib only).
//
// Copies the static game (game/) and its screenshots (screenshots/) from
// beside this file into the output directory and writes dossier.json there
// with buildDossier from the vendored kit library. In the grader sandbox
// the output directory is /output (MAKEFUN_OUTPUT_DIR=/output); locally
// it can be pointed elsewhere, e.g. MAKEFUN_OUTPUT_DIR=/tmp/out node main.ts.
//
// The sandbox runs this as user 65534 on a read-only filesystem: /output
// already exists and is writable, but its parent / is not. So this program
// never removes or recreates the output directory — it only ensures it
// exists (mkdirSync with recursive is a no-op when it does) and copies
// files into it. Two runs are byte-identical: the copies are recursive
// and the dossier holds no timestamps or random data.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(outDir, { recursive: true });
cpSync(join(repoRoot, 'game'), join(outDir, 'game'), { recursive: true });
if (existsSync(join(repoRoot, 'screenshots'))) {
  cpSync(join(repoRoot, 'screenshots'), join(outDir, 'screenshots'), { recursive: true });
}

const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outDir, 'dossier.json'), dossier);
console.log(`VELMORA entry written to ${outDir} (dossier ${dossier.length} bytes)`);
