// print-helper/build/build-exe.mjs
//
// Makes RES-Local.exe = Node + RES Local in ONE program (offline POS, 2026-10-30), so the
// restaurant PC needs nothing else installed. Node's own way ("Single Executable
// Application", SEA): https://nodejs.org/api/single-executable-applications.html
//
//   1. esbuild joins helper.mjs and everything it imports into ONE script (res-local.cjs)
//   2. Node turns that script into a "blob"
//   3. a copy of node.exe becomes RES-Local.exe
//   4. postject puts the blob inside RES-Local.exe
// Output in build/out: RES-Local.exe + raw-print.ps1 (the printing script, it stays a file).
//
// Run (from print-helper):  node build/build-exe.mjs
// Needs: esbuild (in the project), postject (E:\dev-tools\sea-tools, npm install postject).

import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HELPER = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(HELPER, 'build', 'out');
const POSTJECT = process.env.POSTJECT || 'E:/dev-tools/sea-tools/node_modules/postject/dist/cli.js';

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

// 1. one script (CommonJS: what a Node SEA runs). import.meta.url does not exist in
// CommonJS: it is given from the script's own path (only used when NOT inside the .exe).
console.log('1/4  joining the files (esbuild)…');
await build({
  entryPoints: [join(HELPER, 'helper.mjs')],
  outfile: join(OUT, 'res-local.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  define: { 'import.meta.url': '__importMetaUrl' },
  banner: { js: "const __importMetaUrl = require('url').pathToFileURL(__filename).href;" },
  logLevel: 'warning',
});

// 2. the blob
console.log('2/4  preparing the program (node --experimental-sea-config)…');
writeFileSync(
  join(OUT, 'sea-config.json'),
  JSON.stringify({ main: join(OUT, 'res-local.cjs'), output: join(OUT, 'sea-prep.blob'), disableExperimentalSEAWarning: true, useCodeCache: false }, null, 2)
);
execFileSync(process.execPath, ['--experimental-sea-config', join(OUT, 'sea-config.json')], { stdio: 'inherit' });

// 3. a copy of node.exe
console.log('3/4  RES-Local.exe = a copy of node.exe…');
const exe = join(OUT, 'RES-Local.exe');
copyFileSync(process.execPath, exe);

// 4. RES Local inside it
console.log('4/4  putting RES Local inside (postject)…');
execFileSync(process.execPath, [POSTJECT, exe, 'NODE_SEA_BLOB', join(OUT, 'sea-prep.blob'), '--sentinel-fuse', 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2'], { stdio: 'inherit' });

// the files that stay next to the program
copyFileSync(join(HELPER, 'raw-print.ps1'), join(OUT, 'raw-print.ps1'));
rmSync(join(OUT, 'sea-prep.blob'));
rmSync(join(OUT, 'sea-config.json'));
console.log(`\nDONE: ${exe}`);
