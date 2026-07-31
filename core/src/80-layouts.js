/* ============================================================
   Saving, sharing and comparing layouts.

   A layout is the spec's differences from the default, the openings, and
   whatever else the building lets you edit. It goes three places: a code you
   paste, a file you keep, and the library published alongside the site.

   The code came first, back when a layout was a dozen numbers. It is now
   carrying an electrical rough-in as well and runs past a thousand characters,
   which is more than a code was ever meant to be — so the file is the primary
   way to hand a layout over, and the code stays for the quick paste.
   ============================================================ */

const STORE_KEY = () => `layouts-v1-${BUILDING.id}`;
const CODE_PREFIX = () => BUILDING.codePrefix;
const FILE_KIND = 'architectural-design-tools/layout';

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
      try { const d = decodeLayout(def.code); applyLayout(d.spec, d.openings, true, d.extra); }
      catch (e) { /* fall back to whatever was baked in */ }
    }
  }
  renderLayouts();
}
let openedFromLink = false;
let touched = false;

/* ---- what a building says about a layout ----
   Bracing is the shop's word for it and racking is the tiny house's, and the
   shell has no business knowing either. A building that says nothing gets a
   count of its openings, which is true of every building there will ever be. */
function layoutFacts(spec, openings, extra) {
  if (BUILDING.layoutFacts) {
    try {
      const f = BUILDING.layoutFacts(spec, openings, extra || {});
      return { line: '', tag: '', level: 'left', summary: [], ...f };
    } catch (e) { /* a layout from an older version — fall through */ }
  }
  return { line: `${openings.length} openings`, tag: '', level: 'left', summary: [] };
}

/* ---- the file ----
   Everything a person opening the folder in six months needs to know which
   building this was and what it was. `code` is the only field read back; the
   rest is there to be read by a human, and is regenerated on every save so it
   cannot drift away from the code beside it. */
function layoutFile(name, note, code, spec, openings, extra) {
  return {
    kind: FILE_KIND,
    tool: BUILDING.id,
    toolName: BUILDING.name,
    name: name || 'Untitled',
    note: note || '',
    saved: new Date().toISOString(),
    describes: [
      ...BUILDING.titleFacts(spec, null).map(([k, v]) => `${k}: ${v}`),
      layoutFacts(spec, openings, extra).line,
    ].filter(Boolean),
    code,
  };
}
function layoutSlug(name) {
  return (name || 'layout').toLowerCase().replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '').slice(0, 48) || 'layout';
}

/* GitHub's own new-file page, pre-filled. Anyone signed in can commit it if
   they have write access, and everyone else is walked into a fork and pull
   request automatically. No token ever touches this page. */
function repoSaveURL(name, note, code, spec, openings, extra) {
  const body = JSON.stringify(layoutFile(name, note, code, spec, openings, extra), null, 2);
  return `https://github.com/${SITE.owner}/${SITE.repo}/new/${SITE.branch}`
    + `?filename=${encodeURIComponent(`${SITE.dir}/${BUILDING.id}/${layoutSlug(name)}.json`)}`
    + `&value=${encodeURIComponent(body)}`;
}
function downloadLayout(name, note, code, spec, openings, extra) {
  const body = JSON.stringify(layoutFile(name, note, code, spec, openings, extra), null, 2) + '\n';
  const file = `${BUILDING.id}-${layoutSlug(name)}.json`;
  const url = URL.createObjectURL(new Blob([body], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url; a.download = file;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return file;
}

/* What can arrive as a file: one we wrote, an entry from the library, the
   whole published index, or a text file with nothing in it but a code. All
   four are somebody handing over a layout, so all four load. */
function readLayoutFile(text, fileName) {
  const raw = String(text).trim();
  if (!raw) throw new Error('That file is empty.');
  let data = null;
  try { data = JSON.parse(raw); } catch (e) { data = null; }
  if (data == null || typeof data !== 'object') {
    /* Not JSON. Take the whole thing as a code and let decodeLayout judge it. */
    return { code: raw, name: String(fileName || '').replace(/\.[a-z0-9]+$/i, ''), note: '', found: 1 };
  }
  const rows = Array.isArray(data) ? data
    : Array.isArray(data.layouts) ? data.layouts : [data];
  const coded = rows.filter((r) => r && typeof r.code === 'string' && r.code.trim());
  if (!coded.length) throw new Error('There is no layout in that file — nothing in it has a code.');
  const mine = coded.filter((r) => !r.tool || r.tool === BUILDING.id);
  if (!mine.length) {
    const other = coded.find((r) => r.tool);
    throw new Error(`That file holds a ${other ? other.tool : 'different'} layout, and this page is `
      + `${BUILDING.id}. Open the other tool and load it there.`);
  }
  return { ...mine[0], found: mine.length };
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
function encodeLayout(spec, openings, extra) {
  const base = BUILDING.defaults().spec;
  const diff = {};
  for (const k of Object.keys(base)) {
    if (spec[k] !== base[k]) diff[k] = spec[k];
  }
  const ops = openings.map((o) => [o.wall, o.stock, o.kind, o.off, o.head,
    o.w == null ? 0 : o.w, o.h == null ? 0 : o.h]);
  const body = { v: 1, s: diff, o: ops };
  /* Whatever else the building lets you edit, packed by the building — the
     shell has no idea what is in there and does not need one. A building that
     packs to nothing keeps the code the length it always was. */
  if (BUILDING.packExtra) {
    const x = BUILDING.packExtra(extra || {}, spec, openings);
    if (x != null) body.x = x;
  }
  return CODE_PREFIX() + b64urlEncode(JSON.stringify(body));
}
function decodeLayout(code) {
  const raw = String(code).trim().replace(/\s+/g, '');
  if (!raw) throw new Error('Nothing pasted.');
  const body = raw.startsWith(CODE_PREFIX()) ? raw.slice(CODE_PREFIX().length) : raw;
  let data;
  try { data = JSON.parse(b64urlDecode(body)); } catch (e) {
    /* Only once it has failed to decode is a leading prefix worth reading —
       base64url is full of capitals and hyphens, so guessing at one first
       would accuse perfectly good codes of being somebody else's. */
    const other = raw.match(/^([A-Z][A-Z0-9]{2,9})-/);
    if (other && other[1] + '-' !== CODE_PREFIX()) {
      throw new Error(`That is a ${other[1]} code and this page reads `
        + `${CODE_PREFIX().replace(/-$/, '')} codes. Open the other tool and load it there.`);
    }
    throw new Error('That does not look like a layout code. Copy the whole thing, '
      + `starting with ${CODE_PREFIX()}.`);
  }
  if (!data || data.v !== 1 || !Array.isArray(data.o)) {
    throw new Error('That code is from a different version of this page.');
  }
  const spec = { ...BUILDING.defaults().spec, ...(data.s || {}) };
  const openings = data.o.map((a, i) => ({
    id: `l${i}`, wall: a[0], stock: a[1], kind: a[2], off: a[3], head: a[4],
    ...(a[5] ? { w: a[5] } : {}), ...(a[6] ? { h: a[6] } : {}),
  }));
  const extra = data.x != null && BUILDING.unpackExtra
    ? BUILDING.unpackExtra(data.x, spec, openings) : {};
  return { spec, openings, extra };
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
function layoutSummary(spec, openings, extra) {
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
  for (const [head, lines] of layoutFacts(spec, openings, extra).summary) {
    L.push('');
    L.push(head);
    for (const line of lines) L.push('  ' + line);
  }
  const notes = BUILDING.audit(spec, openings, extra || {}).filter((n) => n.level !== 'info');
  if (notes.length) {
    L.push('');
    L.push('THINGS TO SORT OUT');
    for (const n of notes) L.push(`  - ${n.title}`);
  }
  L.push('');
  L.push('Layout code (paste this into the model to see it):');
  L.push(encodeLayout(spec, openings, extra));
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
/* `quiet` applies a layout as a starting point rather than a choice, so a
   later-arriving library default can still replace it. */
function applyLayout(spec, openings, quiet, extra) {
  if (!quiet) touched = true;
  state.spec = { ...spec };
  state.openings = openings.map((o, i) => ({ ...o, id: o.id || `k${i}` }));
  state.extra = extra || {};
  state.selected = null;
  document.getElementById('readout').classList.remove('on');
  scheduleRebuild();
}

/* One row in either list of layouts. Both used to compute their own bracing
   number, which is how the tiny house ended up labelling every saved layout
   "unreadable" — the shell was calling a function only the shop has. */
function layoutRow(item, onLoad, onDelete) {
  const row = el('div', 'saved-row');
  const meta = el('div');
  meta.append(el('b', null, item.name || 'Untitled'));
  let facts = null, d = null;
  try {
    d = decodeLayout(item.code);
    facts = layoutFacts(d.spec, d.openings, d.extra);
  } catch (e) { /* older version, or a code from somewhere else */ }
  const sub = el('div', null, item.note || (facts ? facts.line : 'Saved with an older version'));
  sub.style.cssText = 'font-size:11.5px;color:var(--ink-3)';
  meta.append(sub);
  const bL = el('button', 'btn', 'Load');
  bL.disabled = !d;
  bL.addEventListener('click', () => onLoad(d));
  const acts = el('div', 'btn-row');
  acts.append(bL);
  if (onDelete) {
    const bD = el('button', 'btn danger', 'Delete');
    bD.addEventListener('click', onDelete);
    acts.append(bD);
  }
  row.append(meta,
    facts ? el('span', facts.tag ? 'tag ' + facts.level : null, facts.tag)
      : el('span', 'tag over', 'unreadable'),
    acts);
  return row;
}

/* Loading a layout rebuilds the model, which re-renders this panel and takes
   the "Loaded" message down with it before anybody reads it. So the message
   outlives one render — and the name you typed outlives all of them, because
   saving in the browser re-renders too and used to empty the box you had just
   filled in. */
let layoutStatus = null;      // { where: 'save' | 'load', text, bad }
let layoutName = '';
let layoutNote = '';
function statusSpan(where) {
  const s = el('span', 'copy-status');
  if (layoutStatus && layoutStatus.where === where) {
    s.textContent = layoutStatus.text;
    s.classList.toggle('bad', layoutStatus.bad);
    layoutStatus = null;
  }
  return s;
}
function setStatus(span, where, text, bad) {
  layoutStatus = { where, text, bad: !!bad };
  span.textContent = text;
  span.classList.toggle('bad', !!bad);
}

function renderLayouts() {
  const p = $('#panel-layouts');
  if (!p) return;
  p.textContent = '';
  const code = encodeLayout(state.spec, state.openings, state.extra);

  p.append(note('A layout is the whole building — sizes, openings, and everything else '
    + 'you have edited. It travels as a file you keep or a code you paste.'));

  /* ---- name it once, save it anywhere ---- */
  p.append(el('h3', null, 'Save this layout'));
  const nameI = document.createElement('input');
  nameI.type = 'text'; nameI.className = 'name-input';
  nameI.placeholder = 'Name it, e.g. "Openings ganged, 10ft walls"';
  nameI.setAttribute('aria-label', 'Name for this layout');
  nameI.value = layoutName;
  nameI.addEventListener('input', () => { layoutName = nameI.value; });
  const noteI = document.createElement('input');
  noteI.type = 'text'; noteI.className = 'name-input';
  noteI.placeholder = 'One line about it (optional)';
  noteI.setAttribute('aria-label', 'Description for this layout');
  noteI.value = layoutNote;
  noteI.addEventListener('input', () => { layoutNote = noteI.value; });
  const nameFields = el('div', 'field');
  nameFields.style.gap = '6px';
  nameFields.append(nameI, noteI);
  p.append(nameFields);

  const saveRow = el('div', 'btn-row');
  const saveMsg = statusSpan('save');
  const named = () => nameI.value.trim() || `Layout ${new Date().toLocaleString()}`;

  const bFile = el('button', 'btn', 'Save to a file');
  bFile.title = 'A .json file on this computer. Load it back with the box below.';
  bFile.addEventListener('click', () => {
    const f = downloadLayout(named(), noteI.value.trim(), code,
      state.spec, state.openings, state.extra);
    setStatus(saveMsg, 'save', `Saved ${f}`);
  });
  saveRow.append(bFile);

  if (storageOK()) {
    const bStore = el('button', 'btn', 'Save in this browser');
    bStore.title = 'Stays on this machine, in this browser';
    bStore.addEventListener('click', () => {
      const name = named();
      const list = loadSaved().filter((x) => x.name !== name);
      list.unshift({ name, note: noteI.value.trim(), code, at: Date.now() });
      const ok = writeSaved(list.slice(0, 30));
      layoutStatus = { where: 'save', text: ok ? `Saved "${name}" here` : 'This browser refused to store it', bad: !ok };
      renderLayouts();
    });
    saveRow.append(bStore);
  }

  const bPub = el('button', 'btn', 'Publish on GitHub');
  bPub.title = 'Adds it to the shared library, through a pull request if you cannot commit';
  bPub.addEventListener('click', () => {
    window.open(repoSaveURL(nameI.value.trim(), noteI.value.trim(), code,
      state.spec, state.openings, state.extra), '_blank', 'noopener');
  });
  saveRow.append(bPub, saveMsg);
  p.append(saveRow);
  p.append(note('The file holds the code plus enough plain text to tell, six months later, '
    + 'which building it was. Publishing writes the same file into this repository — GitHub '
    + 'does the saving, so the page never holds a password.'));

  /* ---- load ---- */
  p.append(el('h3', null, 'Load a layout'));
  const loadMsg = statusSpan('load');
  const say = (text, bad) => setStatus(loadMsg, 'load', text, bad);
  const takeFile = (file) => {
    if (!file) return;
    const r = new FileReader();
    r.onerror = () => say('That file could not be read.', true);
    r.onload = () => {
      try {
        const found = readLayoutFile(r.result, file.name);
        const d = decodeLayout(found.code);
        applyLayout(d.spec, d.openings, false, d.extra);
        say(`Loaded ${found.name || file.name}`
          + (found.found > 1 ? ` — first of ${found.found} in the file` : ''));
      } catch (err) {
        say(err.message, true);
      }
    };
    r.readAsText(file);
  };

  const drop = el('div', 'drop');
  drop.append(el('b', null, 'Drop a layout file here'));
  const pick = document.createElement('input');
  pick.type = 'file';
  pick.accept = '.json,.txt,application/json,text/plain';
  pick.style.display = 'none';
  pick.addEventListener('change', () => { takeFile(pick.files[0]); pick.value = ''; });
  const bPick = el('button', 'btn', 'Choose a file');
  bPick.addEventListener('click', () => pick.click());
  drop.append(bPick, pick);
  for (const ev of ['dragenter', 'dragover']) {
    drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); });
  }
  for (const ev of ['dragleave', 'dragend']) {
    drop.addEventListener(ev, () => drop.classList.remove('over'));
  }
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('over');
    takeFile(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]);
  });
  p.append(drop);

  p.append(note('A file saved above, one downloaded from somebody else, or a text file with '
    + 'nothing in it but a code — all of them load.'));

  const inp = document.createElement('textarea');
  inp.className = 'code-box';
  inp.rows = 2;
  inp.placeholder = `…or paste a ${CODE_PREFIX()} code here`;
  inp.setAttribute('aria-label', 'Paste a layout code');
  p.append(inp);
  const loadRow = el('div', 'btn-row');
  const bLoad = el('button', 'btn', 'Load the code');
  bLoad.addEventListener('click', () => {
    try {
      const { spec, openings, extra } = decodeLayout(inp.value);
      applyLayout(spec, openings, false, extra);
      say('Loaded');
    } catch (err) {
      say(err.message, true);
    }
  });
  loadRow.append(bLoad, loadMsg);
  p.append(loadRow);

  /* ---- share ---- */
  p.append(el('h3', null, 'Send it to somebody'));
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
    const text = layoutSummary(state.spec, state.openings, state.extra);
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
  /* The code was short when a layout was a dozen numbers. It now carries the
     openings and the electrical rough-in too, so say how long it has got
     rather than letting somebody find out in a mail client. */
  p.append(note(`${code.length.toLocaleString()} characters. `
    + (code.length > 1000
      ? 'Long enough that mail will wrap it — pasting copes with the wrapping, but a file '
        + 'is the safer way to hand this one over.'
      : 'Short enough to paste into a message as it stands.')));

  /* ---- shared library ---- */
  p.append(el('h3', null, 'Shared library'));
  if (sharedLayouts === false) {
    p.append(note('This copy of the page cannot reach the library — it is open from a '
      + 'file, or from somewhere other than the site it is published on. Load a file or '
      + 'paste a code above, or open the tool at '
      + 'jeffpyles.github.io/architectural-design-tools to browse them.'));
  } else if (sharedLayouts === null) {
    p.append(note('Loading…'));
  } else if (!sharedLayouts.length) {
    p.append(note('Nothing published yet. Yours would be the first.'));
  } else {
    for (const item of sharedLayouts) {
      p.append(layoutRow(item, (d) => applyLayout(d.spec, d.openings, false, d.extra)));
    }
  }

  /* ---- saved on this device ---- */
  p.append(el('h3', null, 'Saved in this browser'));
  if (!storageOK()) {
    p.append(note('This browser will not let the page store anything, so saving here is off. '
      + 'Files and the share code both still work.'));
    return;
  }
  const saved = loadSaved();
  if (!saved.length) {
    p.append(note('Nothing saved yet. These live in this browser only, and go when it is '
      + 'cleared — save to a file for anything worth keeping.'));
  }
  for (const item of saved) {
    p.append(layoutRow(item,
      (d) => applyLayout(d.spec, d.openings, false, d.extra),
      () => { writeSaved(loadSaved().filter((x) => x.name !== item.name)); renderLayouts(); }));
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
