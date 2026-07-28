/* Load a building's dist/page.html in the same wrapper an Artifact uses,
   report every console error, and take screenshots so the model can be
   eyeballed.  usage: node tools/shoot.mjs '[{"name":"iso","stage":7}]' [id] */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const shots = JSON.parse(process.argv[2] || '[]');
const building = process.argv[3] || 'shop-building';

const body = readFileSync(join(root, 'buildings', building, 'dist', 'page.html'), 'utf8');
const wrapped = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${building}</title></head><body>${body}</body></html>`;
mkdirSync(join(root, 'build'), { recursive: true });
const preview = join(root, 'build', `shoot-${building}.html`);
writeFileSync(preview, wrapped);

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  // ANGLE's software path composites correctly headless; plain --use-gl=swiftshader
  // paints sibling layers over the canvas at the wrong offset.
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });

const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}\n${(e.stack || '').split('\n').slice(1, 4).join('\n')}`));

await page.goto('file://' + preview);
await page.waitForTimeout(1200);

// Sanity probes from inside the page
const probe = await page.evaluate(() => {
  const cv = document.getElementById('cv');
  const gl = cv && cv.getContext('webgl');
  return {
    canvas: cv ? `${cv.width}×${cv.height}` : 'missing',
    glLost: gl ? gl.isContextLost() : 'no context',
    stages: document.querySelectorAll('.stage').length,
    openings: document.querySelectorAll('.op').length,
    facts: document.querySelectorAll('.tb-facts > div').length,
    findings: document.querySelectorAll('.finding').length,
    cutRows: document.querySelectorAll('#panel-takeoff tbody tr').length,
    fonts: [...document.fonts].map((f) => `${f.family} ${f.weight} ${f.status}`),
    bodyScrollX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  };
});
console.log(JSON.stringify(probe, null, 2));

for (const s of shots) {
  if (s.theme) await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), s.theme);
  if (s.tab) await page.click(`.tabs button[data-tab="${s.tab}"]`);
  if (s.view) await page.click(`[data-view="${s.view}"]`);
  if (s.stage != null) await page.evaluate((i) => document.querySelectorAll('.stage')[i].click(), s.stage);
  if (s.size) await page.setViewportSize(s.size);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `build/${s.name}.png` });
  console.log('shot →', `build/${s.name}.png`);
}

console.log(errors.length ? '\n--- CONSOLE ---\n' + errors.join('\n') : '\nno console errors');
await browser.close();
