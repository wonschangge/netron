#!/usr/bin/env node
// Builds the atlas for distribution. This is what `node package.js build web`
// (and `npm run atlas`) calls, so the atlas ships with the Netron web build.
//
//     node build.js                 -> ../dist/web/atlas
//     node build.js /tmp/atlas      -> custom target
//
// Steps:
//   1. build-data.js  source/onnx-metadata.json -> data/onnx-metadata.js
//   2. bundle.js      everything inlined        -> onnx-operator-atlas.html
//   3. copy the page (multi-file and single-file variants) into the target

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const target = path.resolve(process.argv[2] || path.join(here, '..', 'dist', 'web', 'atlas'));

const run = (script) => {
    execFileSync(process.execPath, [path.join(here, script)], { stdio: 'inherit', cwd: here });
};

run('build-data.js');
run('bundle.js');

fs.rmSync(target, { recursive: true, force: true });
fs.mkdirSync(target, { recursive: true });
const entries = ['index.html', 'styles.css', 'js', 'data', 'onnx-operator-atlas.html'];
for (const entry of entries) {
    fs.cpSync(path.join(here, entry), path.join(target, entry), { recursive: true });
}

console.log(`atlas -> ${path.relative(process.cwd(), target)} (${entries.join(', ')})`);
