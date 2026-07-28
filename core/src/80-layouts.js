/* ============================================================
   Saving, sharing and comparing layouts: a short code, the browser store,
   and the library published alongside the site.
   ============================================================ */

/* ============================================================
   60 — Saving, sharing and comparing layouts.
   A layout is the spec's differences from the default plus the openings.
   That encodes to a short code you can paste into an email, and it also
   saves to this browser under a name.
   ============================================================ */

const STORE_KEY = () => `layouts-v1-${BUILDING.id}`;
const CODE_PREFIX = () => BUILDING.codePrefix;

/* Where the shared library lives. The page reads it over plain HTTP from
   whatever host it is served from. Writing goes through GitHub itself: a
   static page holds no credentials and should not be given any. */
const SITE = {
  owner: 'jeffpyles',
  repo: 'architectural-design-tools',
  branch: 'main',
  dir: 'layouts',
  index: '../layouts/index.json',
};
let sharedLayouts = null;   // null = loading, false = unavailable, [] = none published

/* The library is a flat list generated at deploy time from layouts/*.json,
   so contributing is one new file and nothing else to keep in step. */
async function loadSharedLayouts() {
  try {
    const res = await fetch(SITE.index, { cache: 'no-cache' });
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    const rows = Array.isArray(data) ? data : (data.layouts || []);
    sharedLayouts = rows.filter((r) => r && r.code && (!r.tool || r.tool === BUILDING.id));
  } catch (e) {
    sharedLayouts = false;    // opened from a file, or from the artifact host
  }
  /* One library entry can mark itself the starting point. A code in the address
     bar always wins, and so does anything already touched on this visit. */
  if (openedFromLink === false && !touched && Array.isArray(sharedLayouts)) {
    const def = sharedLayouts.find((r) => r.default);
    if (def) {
      try { const d = decodeLayout(def.code); applyLayout(d.spec, d.openings); }
      catch (e) { /* fall back to the built-in defaults */ }
    }
  }
  renderLayouts();
}
let openedFromLink = false;
let touched = false;

/* GitHub's own new-file page, pre-filled. Anyone signed in can commit it if
   they have write access, and everyone else is walked into a fork and pull
   request automatically. No token ever touches this page. */
function repoSaveURL(name, note, code) {
  const slug = (name || 'layout').toLowerCase().replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '').slice(0, 48) || 'layout';
  const body = JSON.stringify({ tool: BUILDING.id, name: name || 'Untitled', note: note || '', code }, null, 2);
  return `https://github.com/${SITE.owner}/${SITE.repo}/new/${SITE.branch}`
    + `?filename=${encodeURIComponent(`${SITE.dir}/${BUILDING.id}/${slug}.json`)}`
    + `&value=${encodeURIComponent(body)}`;
}
function downloadLayout(name, note, code) {
  const body = JSON.stringify({ tool: BUILDING.id, name: name || 'Untitled', note: note || '', code }, null, 2);
  const slug = (name || 'layout').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'layout';
  const url = URL.createObjectURL(new Blob([body], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url; a.download = `${slug}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* A link that opens this exact building, for pasting into a message. */
function shareURL(code) {
  if (!/^https?:$/.test(location.protocol)) return null;
  return `${location.origin}${location.pathname}?c=${code.replace(CODE_PREFIX(), '')}`;
}

/* ---- encoding ---- */
function b64urlEncode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(str) {
  const pad = str.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(pad + '='.repeat((4 - pad.length % 4) % 4));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
function encodeLayout(spec, openings) {
  const base = BUILDING.defaults().spec;
  const diff = {};
  for (const k of Object.keys(base)) {
    if (spec[k] !== base[k]) diff[k] = spec[k];
  }
  const ops = openings.map((o) => [o.wall, o.stock, o.kind, o.off, o.head,
    o.w == null ? 0 : o.w, o.h == null ? 0 : o.h]);
  return CODE_PREFIX() + b64urlEncode(JSON.stringify({ v: 1, s: diff, o: ops }));
}
function decodeLayout(code) {
  const raw = String(code).trim().replace(/\s+/g, '');
  if (!raw) throw new Error('Nothing pasted.');
  const body = raw.startsWith(CODE_PREFIX()) ? raw.slice(CODE_PREFIX().length) : raw;
  let data;
  try { data = JSON.parse(b64urlDecode(body)); } catch (e) {
    throw new Error('That does not look like a layout code. Copy the whole thing, starting with ${CODE_PREFIX()}.');
  }
  if (!data || data.v !== 1 || !Array.isArray(data.o)) {
    throw new Error('That code is from a different version of this page.');
  }
  const spec = { ...BUILDING.defaults().spec, ...(data.s || {}) };
  const openings = data.o.map((a, i) => ({
    id: `l${i}`, wall: a[0], stock: a[1], kind: a[2], off: a[3], head: a[4],
    ...(a[5] ? { w: a[5] } : {}), ...(a[6] ? { h: a[6] } : {}),
  }));
  return { spec, openings };
}

/* ---- this browser's saved layouts ---- */
function storageOK() {
  try { localStorage.setItem('__t', '1'); localStorage.removeItem('__t'); return true; }
  catch (e) { return false; }
}
function loadSaved() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY()) || '[]'); }
  catch (e) { return []; }
}
function writeSaved(list) {
  try { localStorage.setItem(STORE_KEY(), JSON.stringify(list)); return true; }
  catch (e) { return false; }
}

/* ---- a plain-language description, for pasting into an email ---- */
function layoutSummary(spec, openings) {
  const L = [];
  L.push(BUILDING.name.toUpperCase());
  for (const [k, v] of BUILDING.titleFacts(spec, null)) L.push(`${k}: ${v}`);
  L.push('');
  L.push('OPENINGS');
  for (const w of ['N', 'E', 'S', 'W']) {
    const ops = openingsOn(w, openings);
    if (!ops.length) { L.push(`  ${WALLS[w].label}: none`); continue; }
    L.push(`  ${WALLS[w].label} wall:`);
    for (const o of ops) {
      const st = stockFor(o);
      L.push(`    ${fmtFt(st.w)} w x ${fmtFt(st.h)} h  —  ${fmtFt(o.off)} from the `
        + `${WALLS[w].from}, head at ${fmtFt(o.head)}`);
    }
  }
  L.push('');
  L.push('BRACING  (1.00 or better is passing)');
  for (const d of bracingCheck(spec, openings)) {
    for (const l of d.lines) {
      L.push(`  ${WALLS[l.wall].label.padEnd(5)} ${l.ratio.toFixed(2)}  `
        + `${fmtFt(l.braced)} of panel, needs ${l.required === Infinity ? '—' : fmtFt(l.required)}`
        + (l.braced === 0 ? `  (widest run only ${fmtFt(l.widest)})` : ''));
    }
  }
  const notes = BUILDING.audit(spec, openings).filter((n) => n.level !== 'info');
  if (notes.length) {
    L.push('');
    L.push('THINGS TO SORT OUT');
    for (const n of notes) L.push(`  - ${n.title}`);
  }
  L.push('');
  L.push('Layout code (paste this into the model to see it):');
  L.push(encodeLayout(spec, openings));
  return L.join('\n');
}

/* ---- clipboard, with a fallback for sandboxed frames ---- */
async function copyText(text, sourceEl) {
  try {
    await navigator.clipboard.writeText(text);
    return 'Copied';
  } catch (e) {
    if (sourceEl) {
      sourceEl.focus();
      sourceEl.select();
      try { if (document.execCommand('copy')) return 'Copied'; } catch (e2) { /* fall through */ }
      return 'Selected — press Ctrl+C (⌘C)';
    }
    return 'Could not copy';
  }
}

/* ---- panel ---- */
function applyLayout(spec, openings) {
  touched = true;
  state.spec = { ...spec };
  state.openings = openings.map((o, i) => ({ ...o, id: o.id || `k${i}` }));
  state.selected = null;
  document.getElementById('readout').classList.remove('on');
  scheduleRebuild();
}
function renderLayouts() {
  const p = $('#panel-layouts');
  if (!p) return;
  p.textContent = '';
  const code = encodeLayout(state.spec, state.openings);

  p.append(note('A layout is the whole building — sizes, openings, everything on the '
    + 'Structure tab. Copy the code below into an email and whoever pastes it back in '
    + 'sees exactly this building.'));

  /* share */
  p.append(el('h3', null, 'Share this layout'));
  const ta = document.createElement('textarea');
  ta.className = 'code-box';
  ta.readOnly = true;
  ta.rows = 3;
  ta.value = code;
  ta.setAttribute('aria-label', 'Layout code for this building');
  p.append(ta);

  const shareRow = el('div', 'btn-row');
  const status = el('span', 'copy-status');
  const bCode = el('button', 'btn', 'Copy code');
  bCode.addEventListener('click', async () => { status.textContent = await copyText(code, ta); });
  const bSum = el('button', 'btn', 'Copy written summary');
  bSum.addEventListener('click', async () => {
    const text = layoutSummary(state.spec, state.openings);
    ta.value = text; ta.rows = 8;
    status.textContent = await copyText(text, ta);
  });
  shareRow.append(bCode, bSum);
  const link = shareURL(code);
  if (link) {
    const bLink = el('button', 'btn', 'Copy link');
    bLink.title = 'A web address that opens this exact building';
    bLink.addEventListener('click', async () => { status.textContent = await copyText(link, ta); });
    shareRow.append(bLink);
  }
  shareRow.append(status);
  p.append(shareRow);

  /* publish */
  p.append(el('h3', null, 'Add it to the shared library'));
  p.append(note('Publishing puts the layout in this repository so it shows up for '
    + 'everyone who opens the tool. GitHub does the saving — if you can write to the '
    + 'repository it commits straight away, and if you cannot it opens a pull request '
    + 'for review. The page itself never holds a password.'));
  const pubName = document.createElement('input');
  pubName.type = 'text'; pubName.className = 'name-input';
  pubName.placeholder = 'Name it, e.g. "Openings ganged, 10ft walls"';
  pubName.setAttribute('aria-label', 'Name for the published layout');
  const pubNote = document.createElement('input');
  pubNote.type = 'text'; pubNote.className = 'name-input';
  pubNote.placeholder = 'One line about it (optional)';
  pubNote.setAttribute('aria-label', 'Description for the published layout');
  const pubFields = el('div', 'field');
  pubFields.style.gap = '6px';
  pubFields.append(pubName, pubNote);
  p.append(pubFields);

  const pubRow = el('div', 'btn-row');
  const bPub = el('button', 'btn', 'Publish on GitHub');
  bPub.addEventListener('click', () => {
    window.open(repoSaveURL(pubName.value.trim(), pubNote.value.trim(), code), '_blank', 'noopener');
  });
  const bDown = el('button', 'btn', 'Download .json');
  bDown.addEventListener('click', () => downloadLayout(pubName.value.trim(), pubNote.value.trim(), code));
  pubRow.append(bPub, bDown);
  p.append(pubRow);

  /* load */
  p.append(el('h3', null, 'Load a layout'));
  const inWrap = el('div', 'field');
  const inp = document.createElement('textarea');
  inp.className = 'code-box';
  inp.rows = 2;
  inp.placeholder = `Paste a ${CODE_PREFIX()} code here`;
  inp.setAttribute('aria-label', 'Paste a layout code');
  inWrap.append(inp);
  p.append(inWrap);
  const loadRow = el('div', 'btn-row');
  const loadMsg = el('span', 'copy-status');
  const bLoad = el('button', 'btn', 'Load it');
  bLoad.addEventListener('click', () => {
    try {
      const { spec, openings } = decodeLayout(inp.value);
      applyLayout(spec, openings);
      loadMsg.textContent = 'Loaded';
    } catch (err) {
      loadMsg.textContent = err.message;
      loadMsg.classList.add('bad');
    }
  });
  loadRow.append(bLoad, loadMsg);
  p.append(loadRow);

  /* shared library */
  p.append(el('h3', null, 'Shared library'));
  if (sharedLayouts === false) {
    p.append(note('This copy of the page cannot reach the library — it is open from a '
      + 'file, or from somewhere other than the site it is published on. Paste a code '
      + 'above to load a layout, or open the tool at '
      + 'jeffpyles.github.io/architectural-design-tools to browse them.'));
  } else {
    if (sharedLayouts === null) {
      p.append(note('Loading…'));
    } else if (!sharedLayouts.length) {
      p.append(note('Nothing published yet. Yours would be the first.'));
    } else {
      for (const item of sharedLayouts) {
        const row = el('div', 'saved-row');
        const meta = el('div');
        meta.append(el('b', null, item.name || 'Untitled'));
        let tagTxt = '', tagCls = 'left', spec = null, openings = null;
        try {
          const d = decodeLayout(item.code);
          spec = d.spec; openings = d.openings;
          const worst = Math.min(...bracingCheck(spec, openings).flatMap((x) => x.lines.map((l) => l.ratio)));
          tagTxt = worst >= 1 ? 'bracing ok' : `worst ${worst.toFixed(2)}`;
          tagCls = worst >= 1 ? 'used' : 'over';
        } catch (e) { tagTxt = 'unreadable'; tagCls = 'over'; }
        const sub = el('div', null, item.note || (spec ? `${fmtFt(spec.wallHeight)} walls, ${openings.length} openings` : ''));
        sub.style.cssText = 'font-size:11.5px;color:var(--ink-3)';
        meta.append(sub);
        const b = el('button', 'btn', 'Load');
        b.disabled = !spec;
        b.addEventListener('click', () => applyLayout(spec, openings));
        row.append(meta, el('span', 'tag ' + tagCls, tagTxt), b);
        p.append(row);
      }
    }
  }

  /* saved on this device */
  p.append(el('h3', null, 'Saved in this browser'));
  if (!storageOK()) {
    p.append(note('This browser will not let the page store anything, so saving is off. '
      + 'The share code above still works.'));
    return;
  }
  const saveRow = el('div', 'btn-row');
  const nameI = document.createElement('input');
  nameI.type = 'text';
  nameI.placeholder = 'Name this layout';
  nameI.className = 'name-input';
  nameI.setAttribute('aria-label', 'Name for the saved layout');
  const bSave = el('button', 'btn', 'Save');
  bSave.addEventListener('click', () => {
    const name = nameI.value.trim() || `Layout ${new Date().toLocaleString()}`;
    const list = loadSaved().filter((x) => x.name !== name);
    list.unshift({ name, code, at: Date.now() });
    writeSaved(list.slice(0, 30));
    renderLayouts();
  });
  saveRow.append(nameI, bSave);
  p.append(saveRow);

  const saved = loadSaved();
  if (!saved.length) {
    p.append(note('Nothing saved yet. Saved layouts live in this browser only — '
      + 'use the code above to move one between machines.'));
  }
  for (const item of saved) {
    const row = el('div', 'saved-row');
    const meta = el('div');
    meta.append(el('b', null, item.name));
    let worstTxt = '';
    try {
      const { spec, openings } = decodeLayout(item.code);
      const worst = Math.min(...bracingCheck(spec, openings).flatMap((d) => d.lines.map((l) => l.ratio)));
      worstTxt = `${fmtFt(spec.wallHeight)} walls · ${openings.length} openings · worst bracing ${worst.toFixed(2)}`;
    } catch (e) { worstTxt = 'Saved with an older version'; }
    const sub = el('div', null, worstTxt);
    sub.style.cssText = 'font-size:11.5px;color:var(--ink-3)';
    meta.append(sub);
    const bL = el('button', 'btn', 'Load');
    bL.addEventListener('click', () => {
      try { const d = decodeLayout(item.code); applyLayout(d.spec, d.openings); }
      catch (e) { /* nothing to load */ }
    });
    const bD = el('button', 'btn danger', 'Delete');
    bD.addEventListener('click', () => {
      writeSaved(loadSaved().filter((x) => x.name !== item.name));
      renderLayouts();
    });
    const acts = el('div', 'btn-row');
    acts.append(bL, bD);
    row.append(meta, el('span'), acts);
    p.append(row);
  }
}

/* A code in the address bar wins over the defaults, when the page is not
   framed in a way that hides it. */
function layoutFromHash() {
  const src = (location.search || '') + (location.hash || '');
  const m = src.match(/[?#&]c=([A-Za-z0-9\-_]+)/);
  if (!m) return null;
  try { return decodeLayout(CODE_PREFIX() + m[1]); } catch (e) { return null; }
}
