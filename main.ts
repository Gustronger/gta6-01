// VELMORA — Sunset Streets: make.fun gta6-01 entry program.
// Copies game/ and screenshots/ from this repository into the output
// directory and writes /output/dossier.json with buildDossier from the
// kit library (vendor/makefun-game.ts). Node 22 standard library only.
// Deterministic: files are copied in stable sorted order and the output
// holds no timestamps or random data, so two runs are byte-identical.
//   MAKEFUN_OUTPUT_DIR=out node main.ts   (default output dir: /output)

import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = dirname(fileURLToPath(import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

if (outDir === repoRoot) {
  throw new Error('main.ts: MAKEFUN_OUTPUT_DIR must not be the repository root');
}

// Copy one directory tree in stable sorted (code-unit) order.
function copyTree(srcDir, dstDir) {
  mkdirSync(dstDir, { recursive: true });
  const names = readdirSync(srcDir).sort();
  for (const name of names) {
    const src = join(srcDir, name);
    const dst = join(dstDir, name);
    const st = statSync(src);
    if (st.isDirectory()) {
      copyTree(src, dst);
    } else if (st.isFile()) {
      writeFileSync(dst, readFileSync(src));
    }
  }
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
copyTree(join(repoRoot, 'game'), join(outDir, 'game'));
copyTree(join(repoRoot, 'screenshots'), join(outDir, 'screenshots'));

const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
});
writeFileSync(join(outDir, 'dossier.json'), dossier);
console.log(`VELMORA entry written to ${outDir} (dossier ${dossier.length} bytes)`);
