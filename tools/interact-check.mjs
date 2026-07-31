#!/usr/bin/env node
/* Does the thing the tool is for actually work?

   Everything else here checks the model or the layout. Nothing checked that
   you can pick an opening and drag it, which is the one interaction the whole
   page exists to support — and it broke: showReadout() lived in the shared
   shell and called sizeHeader() with the shop's argument list, so every pick
   and every drag threw in any building whose sizeHeader took anything else.
   Silent, because it threw inside a pointer handler.

   usage: node tools/interact-check.mjs [building-id] */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const building = process.argv[2] || 'shop-building';

const server = createServer((req, res) => {
  const path = req.url.split('?')[0];
  let file = null;
  if (path === `/${building}/` || path === `/${building}/index.html`) {
    file = join(root, 'buildings', building, 'dist', 'index.html');
  } else if (path.startsWith('/layouts/')) file = join(root, path.replace(/^\//, ''));
  if (!file || !existsSync(file)) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'content-type': path.endsWith('.json') ? 'application/json' : 'text/html; charset=utf-8' });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(0, r));
const url = `http://127.0.0.1:${server.address().port}/${building}/`;

let fails = 0;
const fail = (m) => { console.log('  FAIL ' + m); fails++; };

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  /* The library fetch is expected to fail here; nothing else is. */
  if (m.type() === 'error' && !/index\.json|ERR_FAILED|Failed to load resource/.test(m.text())) {
    errors.push(m.text());
  }
});
await page.goto(url);
await page.waitForTimeout(1400);
console.log(`interaction: ${building}`);
if (errors.length) fail(`page errors at boot: ${errors[0]}`);

/* The wall picker is a row of radios; the offset is the first text box. */
const OFFSET = '#panel-openings .op .op-fields input[type=text]';
const offsets = () => page.$$eval('#panel-openings .op', (cards) => cards.map((c) => {
  const i = c.querySelector('.op-fields input[type=text]');
  return `${c.querySelector('.op-name').textContent}=${i ? i.value : '?'}`;
}));

/* 1. Clicking an opening card must fill the readout. This is the call that
   was throwing, and it throws before anything visible changes. */
{
  const before = errors.length;
  await page.click('#panel-openings .op');
  await page.waitForTimeout(250);
  const r = await page.evaluate(() => ({
    on: document.getElementById('readout').classList.contains('on'),
    title: document.getElementById('roTitle').textContent,
    body: document.getElementById('roBody').textContent,
  }));
  if (errors.length > before) fail(`clicking an opening card threw: ${errors[before]}`);
  if (!r.on) fail('clicking an opening card did not open the readout');
  if (!r.title || r.title === '—') fail('the readout has no title');
  if (!r.body || r.body.length < 20) fail(`the readout body is empty or stubby: "${r.body}"`);
  if (/undefined|NaN/.test(r.title + r.body)) fail(`the readout says "${r.title} / ${r.body}"`);
  console.log(`  ok  readout: ${r.title}`);
}

/* 2. Typing an offset moves the opening. */
{
  const before = errors.length;
  const b0 = await offsets();
  const f = page.locator(OFFSET).first();
  await f.fill(`8'-0"`);
  await f.press('Enter');
  await page.waitForTimeout(400);
  const b1 = await offsets();
  if (errors.length > before) fail(`typing an offset threw: ${errors[before]}`);
  if (b0.join() === b1.join()) fail('typing an offset changed nothing');
  else console.log('  ok  typing an offset moves it');
}

/* 3. Dragging in the model moves it. Hunt for a point that picks something
   — the readout opening is the signal — then drag from there and check the
   opening actually travelled. */
{
  const before = errors.length;
  const box = await page.locator('#cv').boundingBox();
  let picked = null;
  outer:
  for (let fy = 0.30; fy <= 0.72 && !picked; fy += 0.06) {
    for (let fx = 0.22; fx <= 0.80; fx += 0.045) {
      const x = box.x + box.width * fx, y = box.y + box.height * fy;
      await page.evaluate(() => document.getElementById('readout').classList.remove('on'));
      await page.mouse.move(x, y);
      await page.mouse.down();
      const hit = await page.evaluate(() => document.getElementById('readout').classList.contains('on'));
      await page.mouse.up();
      if (hit) { picked = { x, y }; break outer; }
    }
  }
  if (!picked) {
    fail('found nothing draggable anywhere in the viewport');
  } else {
    const b0 = await offsets();
    await page.mouse.move(picked.x, picked.y);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) {
      await page.mouse.move(picked.x + i * 9, picked.y);
      await page.waitForTimeout(25);
    }
    await page.mouse.up();
    await page.waitForTimeout(400);
    const b1 = await offsets();
    if (errors.length > before) fail(`dragging threw: ${errors[before]}`);
    if (b0.join() === b1.join()) fail('dragging an opening in the model moved nothing');
    else console.log('  ok  dragging an opening in the model moves it');
  }
}

/* 3b. Anything else the building lets you drag has to drag too. The electrical
   boxes are the case this was written for: they are small, they sit on the
   same wall planes as the openings, and they broke the first time because the
   opening pick ran first and swallowed the click. */
{
  const before = errors.length;
  const hasItems = await page.evaluate(() => !!document.querySelector('.tabs button[data-tab="electrical"]'));
  if (hasItems) {
    await page.click('.tabs button[data-tab="electrical"]');
    await page.waitForTimeout(400);
    const fields = () => page.$$eval('#panel-electrical .op', (cards) => cards.map((c) => {
      const i = c.querySelector('.op-fields input[type=text]');
      return `${c.querySelector('.op-name').textContent}=${i ? i.value : '-'}`;
    }));
    const n = (await fields()).length;
    if (n < 4) fail(`only ${n} boxes in the electrical panel`);
    const box = await page.locator('#cv').boundingBox();
    let picked = null;
    outer2:
    for (let fy = 0.26; fy <= 0.84 && !picked; fy += 0.014) {
      for (let fx = 0.10; fx <= 0.90; fx += 0.011) {
        const x = box.x + box.width * fx, y = box.y + box.height * fy;
        await page.evaluate(() => document.getElementById('readout').classList.remove('on'));
        await page.mouse.move(x, y);
        await page.mouse.down();
        const r = await page.evaluate(() => ({
          on: document.getElementById('readout').classList.contains('on'),
          t: document.getElementById('roTitle').textContent,
        }));
        await page.mouse.up();
        if (r.on && /duplex|switch|GFCI|LED|sub-panel|box/i.test(r.t)) { picked = { x, y, t: r.t }; break outer2; }
      }
    }
    if (!picked) {
      fail('found no electrical box to drag anywhere in the viewport');
    } else {
      const b0 = await fields();
      await page.mouse.move(picked.x, picked.y);
      await page.mouse.down();
      for (let i = 1; i <= 8; i++) {
        await page.mouse.move(picked.x + i * 7, picked.y + i * 2);
        await page.waitForTimeout(20);
      }
      await page.mouse.up();
      await page.waitForTimeout(500);
      const b1 = await fields();
      if (errors.length > before) fail(`dragging a box threw: ${errors[before]}`);
      if (b0.join() === b1.join()) fail(`dragging ${picked.t} moved nothing`);
      else console.log(`  ok  dragging an electrical box moves it (${picked.t})`);
      /* Circuits: add one, name it, delete it. And the circuit field on a box
         has to be a picker — it was a numField once, which is a LENGTH field
         despite the name, so circuit 3 read back as 0'-3". */
      await page.click('.tabs button[data-tab="electrical"]');
      await page.waitForTimeout(400);
      const cktRows = () => page.$$eval('#panel-electrical .ckt-row', (rs) => rs.map((r) =>
        `${r.querySelector('.ckt-n').textContent}:${r.querySelector('input').value}`));
      const kind = await page.$$eval('#panel-electrical .op .field', (fs) => fs
        .filter((f) => f.querySelector('label') && /^circuit$/i.test(f.querySelector('label').textContent))
        .map((f) => f.lastElementChild.tagName)[0] || 'none');
      if (kind !== 'SELECT') fail(`the circuit field on a box is a ${kind}, not a picker`);
      const c0 = await cktRows();
      if (!c0.length) fail('no circuits listed');
      await page.click('#panel-electrical button:has-text("Add a circuit")');
      await page.waitForTimeout(400);
      const c1 = await cktRows();
      if (c1.length !== c0.length + 1) fail(`adding a circuit went ${c0.length} → ${c1.length}`);
      const ins = await page.$$('#panel-electrical .ckt-row input');
      await ins[ins.length - 1].fill('Welder');
      await ins[ins.length - 1].press('Enter');
      await page.waitForTimeout(400);
      const c2 = await cktRows();
      if (!c2[c2.length - 1].endsWith(':Welder')) fail(`renaming gave ${c2[c2.length - 1]}`);
      const dels = await page.$$('#panel-electrical .ckt-row button');
      await dels[dels.length - 1].click();
      await page.waitForTimeout(400);
      const c3 = await cktRows();
      if (c3.length !== c0.length) fail(`deleting a circuit went ${c2.length} → ${c3.length}`);
      console.log(`  ok  circuits add, rename and delete (${c3.length} left)`);

      /* Once edited, the layout code has to carry the boxes. */
      await page.click('.tabs button[data-tab="layouts"]');
      await page.waitForTimeout(400);
      const code = await page.$eval('#panel-layouts .code-box', (t) => t.value);
      if (code.length < 600) fail(`the code is ${code.length} chars — the boxes are not in it`);
      else console.log(`  ok  the layout code carries them (${code.length} chars)`);
    }
  }
}

/* 4. Every tab renders without throwing. A drawing sheet catches its own
   errors so one bad sheet does not take the set down, which means a throw
   turns into a line of text rather than a page error — so look for that too. */
for (const tab of await page.$$eval('.tabs button', (bs) => bs.map((b) => b.dataset.tab))) {
  const before = errors.length;
  await page.click(`.tabs button[data-tab="${tab}"]`);
  await page.waitForTimeout(400);
  const n = await page.$eval(`#panel-${tab}`, (p) => p.children.length);
  if (errors.length > before) fail(`the ${tab} tab threw: ${errors[before]}`);
  if (!n) fail(`the ${tab} tab rendered nothing`);
  const swallowed = await page.$eval(`#panel-${tab}`,
    (p) => (p.textContent.match(/could not be drawn: .*/) || [])[0] || '');
  if (swallowed) fail(`the ${tab} tab swallowed an error: ${swallowed.slice(0, 120)}`);
}
console.log('  ok  every tab renders');

/* 5. If the building draws sheets, each one has to have something on it and
   carry the line that says what it is not. */
{
  const sheets = await page.$$eval('#sheets .sheet', (list) => list.map((sv) => ({
    nodes: sv.querySelectorAll('*').length,
    text: sv.textContent,
    box: sv.getAttribute('viewBox'),
  })));
  if (sheets.length) {
    for (const [i, sh] of sheets.entries()) {
      if (sh.nodes < 120) fail(`sheet ${i + 1} has only ${sh.nodes} elements — it is empty`);
      if (!/Not for construction/i.test(sh.text)) fail(`sheet ${i + 1} has no title block warning`);
      if (/undefined|NaN/.test(sh.text)) fail(`sheet ${i + 1} says "${(sh.text.match(/\S*(undefined|NaN)\S*/) || [])[0]}"`);
      if (!/= 1'-0"|As noted/.test(sh.text)) fail(`sheet ${i + 1} states no scale`);
    }
    console.log(`  ok  ${sheets.length} drawing sheets, all dimensioned and stamped`);
  }
}

await browser.close();
server.close();
console.log(fails ? `\n${fails} interaction failure(s)` : `\n${building}: interaction ok`);
process.exit(fails ? 1 : 0);
