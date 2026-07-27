#!/usr/bin/env node
/* Assemble _site/ exactly as the Pages workflow does, then serve it, so the
   shared-library fetch can be exercised before anything is deployed. */
import { mkdirSync, cpSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, dirname, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const site = join(root, '_site');

execFileSync('node', ['build.mjs'], { cwd: join(root, 'shop-building'), stdio: 'inherit' });
execFileSync('node', [join(root, 'tools', 'build-layout-index.mjs')], { stdio: 'inherit' });

mkdirSync(join(site, 'shop-building'), { recursive: true });
mkdirSync(join(site, 'layouts'), { recursive: true });
cpSync(join(root, 'index.html'), join(site, 'index.html'));
cpSync(join(root, 'shop-building', 'dist', 'index.html'), join(site, 'shop-building', 'index.html'));
cpSync(join(root, 'layouts'), join(site, 'layouts'), { recursive: true });
writeFileSync(join(site, '.nojekyll'), '');

const TYPES = { '.html': 'text/html', '.json': 'application/json', '.js': 'text/javascript', '.css': 'text/css' };
const port = Number(process.argv[2] || 8099);
createServer((req, res) => {
  let p = normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
  if (p.endsWith('/')) p += 'index.html';
  const file = join(site, p);
  if (!file.startsWith(site) || !existsSync(file)) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
  res.end(readFileSync(file));
}).listen(port, () => console.log(`\n_site on http://localhost:${port}/`));
