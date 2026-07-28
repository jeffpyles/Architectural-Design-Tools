#!/usr/bin/env node
/* Assemble _site/ exactly as the Pages workflow does, then serve it, so the
   shared-library fetch and the relative paths behave as they will in
   production. */
import { mkdirSync, cpSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, dirname, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { listBuildings } from './build.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const site = join(root, '_site');

execFileSync('node', [join(root, 'tools', 'build.mjs')], { stdio: 'inherit' });
execFileSync('node', [join(root, 'tools', 'build-layout-index.mjs')], { stdio: 'inherit' });
execFileSync('node', [join(root, 'tools', 'build-landing.mjs')], { stdio: 'inherit' });

mkdirSync(site, { recursive: true });
cpSync(join(root, 'index.html'), join(site, 'index.html'));
cpSync(join(root, 'layouts'), join(site, 'layouts'), { recursive: true });
for (const b of listBuildings()) {
  mkdirSync(join(site, b.id), { recursive: true });
  cpSync(join(root, 'buildings', b.id, 'dist', 'index.html'), join(site, b.id, 'index.html'));
}
writeFileSync(join(site, '.nojekyll'), '');

const TYPES = { '.html': 'text/html; charset=utf-8', '.json': 'application/json',
  '.js': 'text/javascript', '.css': 'text/css' };
const port = Number(process.argv[2] || 8099);
createServer((req, res) => {
  let p = normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
  if (p.endsWith('/')) p += 'index.html';
  const file = join(site, p);
  if (!file.startsWith(site) || !existsSync(file)) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
  res.end(readFileSync(file));
}).listen(port, () => console.log(`\n_site on http://localhost:${port}/`));
