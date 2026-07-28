/* Layout assertions that only a browser can make.
   The stage rail has slipped below the fold twice — once from a scrolling
   strip that hid the later stages, once from a fixed min-height on .app that
   pushed the whole rail past a short or zoomed-in window. Neither is visible
   to the node-only checks, so they get their own pass here. */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const building = process.argv[2] || 'shop-building';

/* Served over HTTP rather than opened as a file, so the shared-library fetch
   resolves the way it does in production instead of tripping CORS. */
const server = createServer((req, res) => {
  const path = req.url.split('?')[0];
  let file = null;
  if (path === `/${building}/` || path === `/${building}/index.html`) {
    file = join(root, 'buildings', building, 'dist', 'index.html');
  } else if (path.startsWith('/layouts/')) {
    file = join(root, path.replace(/^\//, ''));
  }
  if (!file || !existsSync(file)) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'content-type': path.endsWith('.json') ? 'application/json' : 'text/html; charset=utf-8' });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(0, r));
const url = `http://127.0.0.1:${server.address().port}/${building}/`;

/* Real window shapes, each at 100% and at 125% zoom — 125% is common enough
   that it has to be part of the matrix, not an afterthought. */
const SIZES = [
  [1512, 982], [1440, 900], [1366, 768], [1280, 720],
  [1280, 600], [1024, 640], [1440, 560], [1200, 500],
  [1366, 678], [1366, 648], [1280, 700],   // Chromebook panels less browser chrome
  [834, 1112], [430, 932], [390, 844],
];
const ZOOMS = [1, 1.25];

let fails = 0;
const fail = (m) => { console.log('  FAIL ' + m); fails++; };

/* Served at /<id>/, which is the shape the switcher needs to resolve links,
   so it must be present here whenever there is more than one building. */
const SWITCH_EXPECTED = readdirSync(join(root, 'buildings'))
  .filter((n) => existsSync(join(root, 'buildings', n, 'building.json'))).length;

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
    /* The tallest panel is the one that overflows first, and Review is it. */
    await page.click('.tabs button[data-tab="review"]').catch(() => {});
    await page.waitForTimeout(250);

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
      const panel = document.querySelector('.panel.on');
      const pr = panel ? panel.getBoundingClientRect() : null;
      return {
        /* One pixel of slack for fractional track sizing. Anything more than
           that is the inspector hanging out of its row, which is what put a
           panel over the stage rail. */
        panelOverRail: pr ? pr.bottom > rail.top + 1 : false,
        panelBelow: pr ? pr.bottom > vh + 1 : false,
        panelStuck: panel ? panel.scrollHeight > panel.clientHeight + 2
          && getComputedStyle(panel).overflowY === 'visible' : false,
        panelHeight: pr ? pr.height : 0,
        switcher: document.querySelectorAll('.tb-switch option').length,
        railBelow: rail.bottom > vh + 1,
        railHidden: rail.height === 0,
        reachable: compact ? dots : stages.filter(onScreen).length,
        tabsHidden: tabs.filter((t) => !onScreen(t)).length,
        overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        canvas: document.getElementById('cv').getBoundingClientRect().height,
        factsHeight: document.querySelector('.tb-facts').getBoundingClientRect().height,
        factCells: document.querySelectorAll('.tb-facts > div').length,
        titleHeight: document.querySelector('.titleblock').getBoundingClientRect().height,
      };
    });

    const tag = `${w}×${h} @${zoom}×`;
    if (r.railBelow) fail(`${tag}: the stage rail is below the fold`);
    if (r.railHidden) fail(`${tag}: the stage rail has no height`);
    if (r.reachable < 8) fail(`${tag}: only ${r.reachable} of 8 stages reachable`);
    if (r.tabsHidden) fail(`${tag}: ${r.tabsHidden} inspector tab(s) off screen`);
    if (r.overflowX) fail(`${tag}: the page scrolls sideways`);
    if (r.canvas < 60) fail(`${tag}: the viewport collapsed to ${Math.round(r.canvas)}px`);
    if (r.titleHeight < 10) fail(`${tag}: the title block is gone`);
    if (r.factsHeight < 10) fail(`${tag}: the dimensions rail is gone`);
    /* The inspector has to hold its content inside itself. Twice now a panel
       has grown past its row and run over the stage rail instead of
       scrolling — invisible to every other check here. */
    if (r.panelOverRail) fail(`${tag}: the inspector panel runs over the stage rail`);
    if (r.panelBelow) fail(`${tag}: the inspector panel runs off the bottom`);
    if (r.panelStuck) fail(`${tag}: the inspector panel overflows without scrolling`);
    if (r.panelHeight < 40) fail(`${tag}: the inspector panel collapsed to ${Math.round(r.panelHeight)}px`);
    if (SWITCH_EXPECTED && r.switcher !== SWITCH_EXPECTED) {
      fail(`${tag}: building switcher shows ${r.switcher} options, expected ${SWITCH_EXPECTED}`);
    }
    if (r.factCells < 5) fail(`${tag}: only ${r.factCells} dimension cells rendered`);
    if (errors.length) fail(`${tag}: ${errors[0]}`);
    await page.close();
  }
}

await browser.close();
server.close();
console.log(fails
  ? `\n${fails} layout failure(s) across ${SIZES.length * ZOOMS.length} window shapes`
  : `${building}: all ${SIZES.length * ZOOMS.length} window shapes pass`);
process.exit(fails ? 1 : 0);
