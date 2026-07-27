/* Layout assertions that only a browser can make.
   The stage rail has slipped below the fold twice — once from a scrolling
   strip that hid the later stages, once from a fixed min-height on .app that
   pushed the whole rail past a short or zoomed-in window. Neither is visible
   to the node-only checks, so they get their own pass here. */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const repo = join(root, '..');

/* Served over HTTP rather than opened as a file, so the shared-library fetch
   resolves the way it does in production instead of tripping CORS. */
const server = createServer((req, res) => {
  const path = req.url.split('?')[0];
  let file = null;
  if (path === '/shop-building/' || path === '/shop-building/index.html') {
    file = join(root, 'dist', 'index.html');
  } else if (path.startsWith('/layouts/')) {
    file = join(repo, path.replace(/^\//, ''));
  }
  if (!file || !existsSync(file)) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'content-type': path.endsWith('.json') ? 'application/json' : 'text/html; charset=utf-8' });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(0, r));
const url = `http://127.0.0.1:${server.address().port}/shop-building/`;

/* Real window shapes, each at 100% and at 125% zoom — 125% is common enough
   that it has to be part of the matrix, not an afterthought. */
const SIZES = [
  [1512, 982], [1440, 900], [1366, 768], [1280, 720],
  [1280, 600], [1024, 640], [1440, 560], [1200, 500],
  [834, 1112], [430, 932], [390, 844],
];
const ZOOMS = [1, 1.25];

let fails = 0;
const fail = (m) => { console.log('  FAIL ' + m); fails++; };

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});

for (const [w, h] of SIZES) {
  for (const zoom of ZOOMS) {
    const page = await browser.newPage({
      viewport: { width: Math.round(w / zoom), height: Math.round(h / zoom) },
      deviceScaleFactor: zoom,
    });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(url);
    await page.waitForTimeout(700);

    const r = await page.evaluate(() => {
      const vw = window.innerWidth, vh = window.innerHeight;
      const rail = document.querySelector('.stagerail').getBoundingClientRect();
      const compact = getComputedStyle(document.querySelector('.rail-compact')).display !== 'none';
      const stages = [...document.querySelectorAll('.stage')];
      const dots = document.querySelectorAll('.rc-dot').length;
      const onScreen = (el) => {
        const b = el.getBoundingClientRect();
        return b.width > 0 && b.height > 0 && b.right <= vw + 1 && b.left >= -1
          && b.bottom <= vh + 1 && b.top >= -1;
      };
      const tabs = [...document.querySelectorAll('.tabs button')];
      return {
        railBelow: rail.bottom > vh + 1,
        railHidden: rail.height === 0,
        reachable: compact ? dots : stages.filter(onScreen).length,
        tabsHidden: tabs.filter((t) => !onScreen(t)).length,
        overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        canvas: document.getElementById('cv').getBoundingClientRect().height,
      };
    });

    const tag = `${w}×${h} @${zoom}×`;
    if (r.railBelow) fail(`${tag}: the stage rail is below the fold`);
    if (r.railHidden) fail(`${tag}: the stage rail has no height`);
    if (r.reachable < 8) fail(`${tag}: only ${r.reachable} of 8 stages reachable`);
    if (r.tabsHidden) fail(`${tag}: ${r.tabsHidden} inspector tab(s) off screen`);
    if (r.overflowX) fail(`${tag}: the page scrolls sideways`);
    if (r.canvas < 60) fail(`${tag}: the viewport collapsed to ${Math.round(r.canvas)}px`);
    if (errors.length) fail(`${tag}: ${errors[0]}`);
    await page.close();
  }
}

await browser.close();
server.close();
console.log(fails
  ? `\n${fails} layout failure(s) across ${SIZES.length * ZOOMS.length} window shapes`
  : `all ${SIZES.length * ZOOMS.length} window shapes pass`);
process.exit(fails ? 1 : 0);
