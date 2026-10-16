#!/usr/bin/env node
// Regression checks for the atlas: pure-node layout invariants plus a headless
// Chrome pass over the built HTML.
//
//     node verify.js                     # checks ./onnx-operator-atlas.html
//     node verify.js index.html          # checks the multi-file source page
//
// Playwright is not a dependency of this project. The script looks for
// `playwright-core` in a few well-known places, or wherever PLAYWRIGHT_CORE
// points. It always drives the *system* Chrome, because the cached browser
// revision is often not the one the installed playwright wants.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const metaFile = process.env.METADATA
    ? path.resolve(process.env.METADATA)
    : path.resolve(here, '..', 'source', 'onnx-metadata.json');

// Intentional snapshot of the dataset this build is expected to see. Upstream
// metadata bumps move these numbers; re-read them with `node build-data.js`
// (it prints the totals) and update this single block. Both passes read it, so
// there is exactly one place to re-baseline. See AGENTS.md section 3.
const SNAPSHOT = {
    records: 872,
    operators: 406,
    opset1: 291,
    microsoft: 136,
    bars: 28,
    matrix: { rows: 406, cols: 31, hits: 2933 }
};

let failures = 0;
let checks = 0;

function check(name, ok, detail) {
    checks++;
    if (ok) {
        console.log(`  ok    ${name}${detail ? `  (${detail})` : ''}`);
    } else {
        failures++;
        console.log(`  FAIL  ${name}${detail ? `  (${detail})` : ''}`);
    }
}

// --------------------------------------------------------------- node pass

// The js/ files are classic browser scripts (they assign to globalThis.Atlas),
// so they are evaluated here rather than imported.
function loadClassic(file) {
    const code = fs.readFileSync(path.join(here, file), 'utf8');
    new Function(code)();
}

function layoutPass() {
    console.log('\nlayout (pure node)');
    globalThis.window = globalThis;
    loadClassic('js/util.js');
    loadClassic('js/treemap.js');

    const items = [
        { value: 12 }, { value: 1 }, { value: 1 }, { value: 1 }, { value: 1 },
        { value: 7 }, { value: 1 }, { value: 1 }, { value: 1 }, { value: 1 },
        { value: 1 }, { value: 1 }, { value: 1 }, { value: 1 }, { value: 1 },
        { value: 1 }, { value: 1 }, { value: 1 }, { value: 1 }, { value: 1 }
    ];
    const W = 1250;
    const H = 480;
    const rects = Atlas.layoutTreemap(items, 0, 0, W, H);

    check('places every item', rects.length === items.length, `${rects.length}/${items.length}`);

    const area = rects.reduce((sum, r) => sum + r.w * r.h, 0);
    // Regression: a wrong strip orientation leaves large uncovered regions.
    check('covers the container', Math.abs(area - W * H) / (W * H) < 0.001, `${(area / (W * H)).toFixed(4)}`);

    const negative = rects.filter((r) => r.w < 0 || r.h < 0).length;
    check('no negative rects', negative === 0, `count=${negative}`);

    const minSide = Math.min(...rects.map((r) => Math.min(r.w, r.h)));
    // Regression: the orientation bug produced sub-pixel slivers.
    check('no sliver tiles', minSide > 5, `min side=${minSide.toFixed(2)}px`);
}

// ------------------------------------------------------------ dataset pass

function datasetPass() {
    console.log('\ndataset (source/onnx-metadata.json)');
    const records = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
    const byKey = new Map();
    for (const record of records) {
        const key = `${record.module}/${record.name}`;
        if (!byKey.has(key)) {
            byKey.set(key, []);
        }
        byKey.get(key).push(record);
    }

    check(`${SNAPSHOT.records} records`, records.length === SNAPSHOT.records, String(records.length));
    check(`${SNAPSHOT.operators} operators`, byKey.size === SNAPSHOT.operators, String(byKey.size));

    // Regression: arity lives in min_input/max_input (singular), not min_inputs.
    const wrong = records.filter((r) => r.min_input === undefined || r.max_input === undefined || r.min_output === undefined || r.max_output === undefined);
    check('arity fields present', wrong.length === 0, `missing on ${wrong.length}`);

    const atOpset1 = [...byKey.values()].filter((list) => Math.min(...list.map((r) => r.version)) <= 1);
    check(`${SNAPSHOT.opset1} operators exist at opset 1`, atOpset1.length === SNAPSHOT.opset1, String(atOpset1.length));

    const maxPool = byKey.get('ai.onnx/MaxPool').map((r) => r.version).sort((a, b) => a - b);
    check('ai.onnx/MaxPool has 6 revisions', maxPool.length === 6, maxPool.join(','));
}

// ----------------------------------------------------------- browser pass

function resolvePlaywright() {
    const require = createRequire(import.meta.url);
    const home = os.homedir();
    const candidates = [];

    if (process.env.PLAYWRIGHT_CORE) {
        candidates.push(process.env.PLAYWRIGHT_CORE);
    }
    candidates.push('playwright-core');

    // Any `npx playwright` cache, newest first.
    const npxRoot = path.join(home, '.npm', '_npx');
    if (fs.existsSync(npxRoot)) {
        for (const entry of fs.readdirSync(npxRoot)) {
            candidates.push(path.join(npxRoot, entry, 'node_modules', 'playwright-core'));
        }
    }

    // Runtime bundles that ship playwright for browser automation.
    const runtimeRoot = path.join(home, '.cache', 'codex-runtimes');
    if (fs.existsSync(runtimeRoot)) {
        for (const entry of fs.readdirSync(runtimeRoot)) {
            candidates.push(path.join(runtimeRoot, entry, 'dependencies', 'node', 'node_modules', 'playwright-core'));
        }
    }

    // bun's install cache stores one directory per version.
    const bunRoot = path.join(home, '.bun', 'install', 'cache', 'playwright-core');
    if (fs.existsSync(bunRoot)) {
        for (const entry of fs.readdirSync(bunRoot)) {
            candidates.push(path.join(bunRoot, entry));
        }
    }

    for (const candidate of candidates) {
        try {
            return require(candidate);
        } catch {
            // try the next candidate
        }
    }
    return null;
}

function resolveChrome() {
    if (process.env.CHROME_PATH) {
        return process.env.CHROME_PATH;
    }
    const candidates = [
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    ];
    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
            return candidate;
        }
    }
    return undefined;
}

async function browserPass(target) {
    console.log(`\nbrowser (${path.relative(process.cwd(), target)})`);
    const playwright = resolvePlaywright();
    if (!playwright) {
        console.log('  skip  playwright-core not found; set PLAYWRIGHT_CORE=/path/to/playwright-core');
        return;
    }
    const chrome = resolveChrome();
    if (!chrome) {
        console.log('  skip  no Chrome/Chromium found; set CHROME_PATH=/path/to/chrome');
        return;
    }

    const browser = await playwright.chromium.launch({
        headless: true,
        executablePath: chrome,
        args: ['--no-sandbox']
    });
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
    page.on('console', (message) => {
        if (message.type() === 'error') {
            errors.push(`console: ${message.text()}`);
        }
    });
    page.on('requestfailed', (request) => errors.push(`requestfailed: ${request.url()}`));

    const url = `file://${target}`;
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForTimeout(1500);

    const boot = await page.evaluate(() => ({
        operators: globalThis.Atlas?.app?.model?.operators.length ?? 0,
        records: globalThis.ONNX_METADATA?.length ?? 0,
        tiles: document.querySelectorAll('.treemap .tile:not(.floor)').length,
        bars: document.querySelectorAll('.chart .bar-group').length,
        external: document.querySelectorAll('script[src],link[href]').length,
        listItems: document.querySelectorAll('.op-item').length
    }));
    check('boots the model', boot.operators === SNAPSHOT.operators && boot.records === SNAPSHOT.records, `${boot.operators} ops / ${boot.records} records`);
    check('overview renders', boot.tiles === SNAPSHOT.operators && boot.bars === SNAPSHOT.bars && boot.listItems === SNAPSHOT.operators, `${boot.tiles} tiles / ${boot.bars} bars`);
    if (path.basename(target) === 'onnx-operator-atlas.html') {
        check('bundle is self-contained', boot.external === 0, `${boot.external} external refs`);
    }

    // Regression: min_inputs vs min_input rendered "arity undefined".
    await page.goto(`${url}#view=detail&op=${encodeURIComponent('ai.onnx/Conv@11')}`, { waitUntil: 'load' });
    await page.waitForTimeout(1000);
    const detail = await page.evaluate(() => {
        const text = document.getElementById('main').innerText;
        return {
            title: document.querySelector('.op-title h1')?.textContent ?? null,
            nodes: document.querySelectorAll('.ladder .node').length,
            undefinedArity: text.includes('undefined')
        };
    });
    check('detail shows Conv', detail.title === 'Conv', String(detail.title));
    check('ladder renders revisions', detail.nodes === 3, `${detail.nodes} nodes`);
    check('no "undefined" in detail', !detail.undefinedArity);

    await page.goto(`${url}#view=detail&op=${encodeURIComponent('ai.onnx/MaxPool@12')}`, { waitUntil: 'load' });
    await page.waitForTimeout(1000);
    const maxPool = await page.evaluate(() => ({
        nodes: document.querySelectorAll('.ladder .node').length,
        diffs: document.querySelectorAll('.diff-card').length
    }));
    check('MaxPool ladder has 6 nodes', maxPool.nodes === 6, `${maxPool.nodes} nodes, ${maxPool.diffs} diff cards`);

    // Regression: the target opset must scope the whole UI.
    await page.goto(`${url}#view=matrix&opset=1`, { waitUntil: 'load' });
    await page.waitForTimeout(1000);
    const opset1 = await page.evaluate(() => ({
        rows: document.querySelectorAll('table.matrix tbody tr').length,
        list: document.getElementById('list-count').textContent
    }));
    check('opset 1 scopes the matrix', opset1.rows === SNAPSHOT.opset1, `${opset1.rows} rows`);
    check('opset 1 scopes the catalog', opset1.list.includes(String(SNAPSHOT.opset1)), opset1.list);

    await page.goto(`${url}#view=matrix`, { waitUntil: 'load' });
    await page.waitForTimeout(1200);
    const matrix = await page.evaluate(() => ({
        rows: document.querySelectorAll('table.matrix tbody tr').length,
        cols: document.querySelectorAll('table.matrix thead th').length,
        on: document.querySelectorAll('.cell.on').length
    }));
    check('matrix covers the spec', matrix.rows === SNAPSHOT.matrix.rows && matrix.cols === SNAPSHOT.matrix.cols && matrix.on === SNAPSHOT.matrix.hits, `${matrix.rows}x${matrix.cols}, ${matrix.on} hits`);

    await page.goto(`${url}#view=compare&op=${encodeURIComponent('ai.onnx/MaxPool@12')}`, { waitUntil: 'load' });
    await page.waitForTimeout(1000);
    const compare = await page.evaluate(() => ({
        sides: document.querySelectorAll('.compare-side').length,
        lines: document.querySelectorAll('.diff-line').length
    }));
    check('compare renders both sides', compare.sides === 2 && compare.lines > 0, `${compare.lines} diff lines`);

    // Cross-filter from the sidebar.
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForTimeout(1200);
    await page.click('.sidebar-filters .chip:has-text("com.microsoft")');
    await page.waitForTimeout(500);
    const filtered = await page.evaluate(() => ({
        count: document.getElementById('list-count').textContent,
        tiles: document.querySelectorAll('.treemap .tile:not(.floor)').length
    }));
    check('domain filter cross-filters the treemap', filtered.tiles === SNAPSHOT.microsoft, filtered.count);

    await page.fill('#search', 'zzzzznotfound');
    await page.waitForTimeout(600);
    const empty = await page.evaluate(() => ({
        count: document.getElementById('list-count').textContent,
        list: document.querySelectorAll('#op-list .empty').length,
        treemap: document.querySelectorAll('.treemap .empty').length
    }));
    check('empty state is handled', empty.count.startsWith('0') && empty.list === 1 && empty.treemap === 1, empty.count);

    check('no console or page errors', errors.length === 0, errors.join(' | '));
    await browser.close();
}

// -------------------------------------------------------------------- run

const target = path.resolve(process.argv[2] || path.join(here, 'onnx-operator-atlas.html'));
if (!fs.existsSync(target)) {
    console.error(`Target not found: ${target}`);
    console.error('Run `node build-data.js && node bundle.js` first.');
    process.exit(1);
}

layoutPass();
datasetPass();
await browserPass(target);

console.log(`\n${checks - failures}/${checks} checks passed`);
process.exit(failures === 0 ? 0 : 1);
