/* The sheet the framing plan is printed on.

   A drawing set, not a report: the sheets are numbered because a drawing set
   is ordered and that is how you point at one across a shop. Every elevation
   is drawn at ¼" = 1'-0" so they can be compared against each other and
   against anything else printed at an architectural scale. */

import { inches, feet, esc, LEGEND } from './framing-plan.mjs';

const FONTS = 'https://fonts.googleapis.com/css2?family=Archivo:wght@500;600;700'
  + '&family=IBM+Plex+Mono:wght@400;500;600'
  + '&family=Source+Sans+3:ital,wght@0,400;0,600;1,400&display=swap';

const CSS = String.raw`
*{box-sizing:border-box}
:root{
  --paper:#e9eef1; --sheet:#ffffff; --ink:#141e26; --ink2:#4d5c68; --ink3:#77878f;
  --rule:#c7d3da; --rule2:#e4ebee; --blue:#1f4e79; --blue-soft:#e6eef5;
  --warn:#8b5310; --warn-soft:#f8efdd; --crit:#8a2f2f; --crit-soft:#faeaea;
  --good:#2c6349; --good-soft:#e5efea;
  --shadow:0 1px 0 rgba(20,30,38,.05), 0 10px 30px rgba(20,30,38,.08);
  --display:"Archivo","Helvetica Neue",Arial,sans-serif;
  --body:"Source Sans 3","Helvetica Neue",Arial,sans-serif;
  --mono:"IBM Plex Mono",ui-monospace,"SF Mono",Menlo,monospace;
}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
  --paper:#0d1216; --sheet:#161d23; --ink:#e7eef3; --ink2:#a4b4c0; --ink3:#7c8c98;
  --rule:#2a353e; --rule2:#1f2830; --blue:#84b5dd; --blue-soft:#152532;
  --warn:#d69b48; --warn-soft:#2a2113; --crit:#dd8a8a; --crit-soft:#2c1a1a;
  --good:#79b99a; --good-soft:#132520;
  --shadow:0 1px 0 rgba(0,0,0,.3), 0 10px 30px rgba(0,0,0,.35);
}}
:root[data-theme="dark"]{
  --paper:#0d1216; --sheet:#161d23; --ink:#e7eef3; --ink2:#a4b4c0; --ink3:#7c8c98;
  --rule:#2a353e; --rule2:#1f2830; --blue:#84b5dd; --blue-soft:#152532;
  --warn:#d69b48; --warn-soft:#2a2113; --crit:#dd8a8a; --crit-soft:#2c1a1a;
  --good:#79b99a; --good-soft:#132520;
  --shadow:0 1px 0 rgba(0,0,0,.3), 0 10px 30px rgba(0,0,0,.35);
}

body{
  margin:0; background:var(--paper); color:var(--ink);
  font-family:var(--body); font-size:16px; line-height:1.55;
  -webkit-font-smoothing:antialiased;
}
.wrap{max-width:1180px; margin:0 auto; padding:0 20px 96px;
  display:flex; flex-direction:column; gap:26px}

/* ---- title block --------------------------------------------------- */
.titleblock{
  margin-top:26px; background:var(--sheet); border:1px solid var(--rule);
  box-shadow:var(--shadow); display:grid; grid-template-columns:1fr auto;
  gap:18px; align-items:end; padding:22px 24px;
}
.titleblock h1{
  font-family:var(--display); font-weight:700; font-size:clamp(26px,4vw,40px);
  line-height:1.04; letter-spacing:-.018em; margin:0; text-wrap:balance;
}
.titleblock .sub{color:var(--ink2); margin:6px 0 0; font-size:16px}
.stamp{
  font-family:var(--mono); font-size:11.5px; line-height:1.7; color:var(--ink2);
  text-align:right; white-space:nowrap;
}
.stamp b{color:var(--ink); font-weight:600}

/* ---- headline figures ---------------------------------------------- */
.figures{display:grid; grid-template-columns:repeat(auto-fit,minmax(190px,1fr)); gap:1px;
  background:var(--rule); border:1px solid var(--rule); box-shadow:var(--shadow)}
.fig{background:var(--sheet); padding:16px 18px 15px}
.fig .n{font-family:var(--mono); font-weight:600; font-size:30px; letter-spacing:-.02em;
  font-variant-numeric:tabular-nums; line-height:1.1; display:block}
.fig .k{font-family:var(--display); text-transform:uppercase; letter-spacing:.09em;
  font-size:10.5px; font-weight:600; color:var(--ink3); display:block; margin-top:5px}
.fig .d{font-size:13.5px; color:var(--ink2); margin-top:4px; line-height:1.4}

/* ---- sheets --------------------------------------------------------- */
.sheet{background:var(--sheet); border:1px solid var(--rule); box-shadow:var(--shadow)}
.sheet > header{
  display:flex; align-items:baseline; gap:14px; flex-wrap:wrap;
  padding:13px 20px; border-bottom:1px solid var(--rule);
}
.sheet > header .no{
  font-family:var(--mono); font-weight:600; font-size:12px; letter-spacing:.06em;
  color:var(--sheet); background:var(--blue); padding:3px 8px 2px;
}
.sheet > header h2{
  font-family:var(--display); font-weight:600; font-size:17px; letter-spacing:.005em;
  margin:0; flex:1 1 auto;
}
.sheet > header .meta{font-family:var(--mono); font-size:11.5px; color:var(--ink3)}
.sheet .body{padding:20px}
.sheet .body > * + *{margin-top:16px}
.sheet p{margin:0; color:var(--ink2); max-width:70ch}
.sheet p b, .sheet li b{color:var(--ink); font-weight:600}

/* ---- drawings -------------------------------------------------------- */
.plate{overflow-x:auto; background:var(--sheet); border:1px solid var(--rule2); padding:6px 8px}
.plate svg{display:block}
.plate text{font-family:var(--body); fill:var(--ink)}
.plate text.dim{fill:var(--blue)}
.plate text.ttl{font-family:var(--display); font-weight:600; fill:var(--ink)}
.legend{display:flex; flex-wrap:wrap; gap:8px 18px; font-size:13px; color:var(--ink2)}
.legend span{display:inline-flex; align-items:center; gap:7px}
.legend i{width:15px; height:11px; border:1px solid #5a4426; display:inline-block}

/* ---- tables ---------------------------------------------------------- */
.scroll{overflow-x:auto}
table{border-collapse:collapse; width:100%; font-size:14.5px; min-width:520px}
caption{text-align:left; font-family:var(--display); font-size:13px; font-weight:600;
  color:var(--ink3); text-transform:uppercase; letter-spacing:.08em; padding-bottom:8px}
th,td{text-align:left; padding:7px 12px 6px; border-bottom:1px solid var(--rule2); vertical-align:baseline}
th{font-family:var(--display); font-weight:600; font-size:11px; text-transform:uppercase;
  letter-spacing:.075em; color:var(--ink3); border-bottom:1px solid var(--rule); white-space:nowrap}
td.n, th.n{text-align:right; font-family:var(--mono); font-variant-numeric:tabular-nums; white-space:nowrap}
td.m{font-family:var(--mono); font-size:13.5px; white-space:nowrap}
tbody tr:last-child td{border-bottom:0}
tfoot td{border-top:1px solid var(--rule); border-bottom:0; font-weight:600; padding-top:9px}
tr.total td{background:var(--blue-soft)}
.note{font-size:13px; color:var(--ink3); line-height:1.45}

/* ---- callouts -------------------------------------------------------- */
.call{border-left:3px solid var(--blue); background:var(--blue-soft); padding:13px 16px}
.call.warn{border-color:var(--warn); background:var(--warn-soft)}
.call.crit{border-color:var(--crit); background:var(--crit-soft)}
.call.good{border-color:var(--good); background:var(--good-soft)}
.call h3{font-family:var(--display); font-size:14.5px; font-weight:600; margin:0 0 4px;
  letter-spacing:.005em; color:var(--ink)}
.call p{color:var(--ink2); font-size:14.5px}
.call + .call{margin-top:10px}
.tag{font-family:var(--display); text-transform:uppercase; letter-spacing:.08em;
  font-size:10px; font-weight:600; padding:2px 6px 1px; border:1px solid currentColor}
.tag.warn{color:var(--warn)} .tag.crit{color:var(--crit)} .tag.good{color:var(--good)}
.tag.blue{color:var(--blue)}

ul{margin:0; padding-left:1.15em; color:var(--ink2)}
li + li{margin-top:5px}
a{color:var(--blue)}
footer.colophon{color:var(--ink3); font-size:13px; text-align:center; line-height:1.6}

@media print{
  body{background:#fff}
  .sheet,.titleblock,.figures{box-shadow:none; break-inside:avoid}
  .plate{overflow:visible}
  .wrap{max-width:none; padding:0}
}
@media (max-width:640px){
  .titleblock{grid-template-columns:1fr} .stamp{text-align:left}
}
`;

const sheet = (no, title, meta, body) => `<section class="sheet">
  <header><span class="no">${esc(no)}</span><h2>${esc(title)}</h2>
  ${meta ? `<span class="meta">${esc(meta)}</span>` : ''}</header>
  <div class="body">${body}</div></section>`;

const call = (level, head, text) =>
  `<div class="call ${level}"><h3>${esc(head)}</h3><p>${text}</p></div>`;

export function page(d) {
  const { meta, spec, figures, elevations, hdrs, plates, patterns, byRole,
    screws, findings, shopping, stick, alternatives } = d;

  const elevationSheets = elevations.map((e, i) => sheet(
    `A${i + 1}`, `${e.label} wall`, e.note,
    `<div class="plate">${e.svg}</div>
     <div class="legend">${LEGEND.map(([c, n]) =>
    `<span><i style="background:${c}"></i>${esc(n)}</span>`).join('')}
       <span><i style="background:transparent;border:1px dashed #1f4e79"></i>Rough opening</span></div>
     <p class="note">Drawn at ¼"&nbsp;=&nbsp;1'-0". Dimensions run to the edges of each rough
       opening; ticks along the top are the ${esc(inches(spec.studSpacing))} stud module. The bottom
       plate is drawn running through the door openings — it does, until the wall is standing and
       plumb, and then you cut it out.</p>`)).join('');

  const hdrRows = hdrs.map((h) => {
    const changed = h.pick.label !== h.tool.label;
    return `<tr>
      <td class="m">${esc(h.o.wall)}</td>
      <td>${esc(h.o.name || h.st.label)}</td>
      <td class="n">${esc(inches(h.o.off))}</td>
      <td class="n">${esc(inches(h.ro.w))} &times; ${esc(inches(h.ro.h))}</td>
      <td class="n">${esc(inches(h.o.head))}</td>
      <td class="m">${esc(h.pick.label)} @ ${esc(inches(h.len))}</td>
      <td class="n">${h.bearing ? (h.pick.ratio).toFixed(2) : '—'}</td>
      <td>${h.loft ? `<span class="tag warn">${esc(h.loft.name)}</span>`
    : changed ? `<span class="tag good">was ${esc(h.tool.label)}</span>` : ''}</td>
    </tr>`;
  }).join('');

  const plateRows = plates.map((r) => `<tr>
      <td class="m">${esc(r.wall)}</td><td>${esc(r.course)}</td>
      <td class="n">${esc(inches(r.len))}</td>
      <td class="m">${r.segs.map((s) => esc(inches(s))).join('  +  ')}</td>
      <td class="n">${r.segs.length}</td></tr>`).join('');

  const patRows = patterns.map((p) => `<tr>
      <td class="n">${p.count}</td>
      <td class="m">${p.cuts.map((c) => esc(inches(c))).join('  +  ')}</td>
      <td class="n">${esc(inches(p.drop))}</td>
      <td>${esc(p.what)}</td></tr>`).join('');

  const roleRows = byRole.map((r) => `<tr>
      <td>${esc(r.kind)}</td><td class="n">${r.count}</td>
      <td class="m">${r.lens.map(esc).join(', ')}</td></tr>`).join('');

  const screwRows = screws.map((r) => `<tr>
      <td>${esc(r.what)}</td>
      <td class="n">${r.n}</td><td class="n">${r.each}</td><td class="n">${r.total}</td>
      <td class="note">${esc(r.basis)}</td></tr>`).join('');

  return `<title>${esc(meta.title)}</title>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS}">
<style>${CSS}</style>
<div class="wrap">

  <div class="titleblock">
    <div>
      <h1>${esc(meta.h1)}</h1>
      <p class="sub">${esc(meta.sub)}</p>
    </div>
    <div class="stamp">
      <div>LAYOUT&nbsp;&nbsp;<b>${esc(meta.layout)}</b></div>
      <div>SAVED&nbsp;&nbsp;<b>${esc(meta.saved)}</b></div>
      <div>STOCK&nbsp;&nbsp;<b>${esc(feet(stick))} 2x4</b></div>
      <div>SCALE&nbsp;&nbsp;<b>&frac14;" = 1'-0"</b></div>
    </div>
  </div>

  <div class="figures">
    ${figures.map((f) => `<div class="fig"><span class="n">${esc(f.n)}</span>
      <span class="k">${esc(f.k)}</span><span class="d">${esc(f.d)}</span></div>`).join('')}
  </div>

  ${findings.length ? sheet('00', 'Read this first',
    `${findings.length} thing${findings.length > 1 ? 's' : ''} the layout turned up`,
    findings.map((f) => call(f.level, f.head, f.text)).join('')) : ''}

  ${elevationSheets}

  ${sheet('A5', 'Header schedule', `${hdrs.length} openings`,
    `<p>Sized here for what each header actually carries, which is not always what the tool
      shows on screen — see sheet 00. <b>Ratio</b> is bending demand over capacity; anything
      under 1.00 carries.</p>
     <div class="scroll"><table>
       <thead><tr><th>Wall</th><th>Opening</th><th class="n">Off</th><th class="n">Rough opening</th>
         <th class="n">Head</th><th>Header</th><th class="n">Ratio</th><th></th></tr></thead>
       <tbody>${hdrRows}</tbody></table></div>`)}

  ${sheet('A6', 'Plate splices', 'where each course breaks',
    `<p>Every splice lands on the centre of a stud. The cap plate breaks at least
      ${esc(inches(spec.studSpacing))} clear of the plate beneath it, which is what lets the two
      courses tie the wall together instead of hinging at the same place.</p>
     <div class="scroll"><table>
       <thead><tr><th>Wall</th><th>Course</th><th class="n">Run</th><th>Cut into</th>
         <th class="n">Pieces</th></tr></thead>
       <tbody>${plateRows}</tbody></table></div>`)}

  ${sheet('A7', 'Cut list', `${feet(stick)} 2x4 only`,
    `<p>Nothing here is cut longer than <b>${esc(inches(stick - d.trim))}</b>, so a stick that
      turns up a little short or with a chewed end still makes its piece. Drop is what is left
      after the ${esc(inches(0.125))} saw kerfs.</p>
     <div class="scroll"><table>
       <caption>What comes off each stick</caption>
       <thead><tr><th class="n">Sticks</th><th>Cut into</th><th class="n">Drop</th>
         <th>What it makes</th></tr></thead>
       <tbody>${patRows}</tbody></table></div>
     <div class="scroll"><table>
       <caption>The same pieces, by what they are</caption>
       <thead><tr><th>Piece</th><th class="n">Qty</th><th>Lengths</th></tr></thead>
       <tbody>${roleRows}</tbody></table></div>
     <div class="scroll"><table>
       <caption>What one stock length costs against another</caption>
       <thead><tr><th>Stock</th><th class="n">Sticks</th><th class="n">Linear feet</th>
         <th class="n">Yield</th><th></th></tr></thead>
       <tbody>${alternatives.map((v) => `<tr${v.stock === stick ? ' class="total"' : ''}>
         <td class="m">${esc(feet(v.stock))}</td><td class="n">${v.sticks}</td>
         <td class="n">${v.ft}</td><td class="n">${v.yield.toFixed(0)}%</td>
         <td class="note">${v.stock === stick ? 'the list above' : ''}</td></tr>`).join('')}</tbody>
     </table></div>
     <p class="note">Fewer, longer sticks is always fewer sticks, but not always less wood — a
       ${esc(inches(d.studLen))} stud drops ${esc(inches(stick - d.trim - d.studLen))} off a
       ${esc(feet(stick))} and a good deal more off anything longer.</p>`)}

  ${sheet('A8', 'Fasteners', '3" structural screws',
    `<p>One 3" structural screw stands in for one 16d common nail, which is the unit the IRC
      fastening schedule is written in. Use a code-listed structural screw — a GRK RSS, Simpson
      SDWS or Spax PowerLag. <b>Not</b> a drywall or deck screw: those are hardened and snap in
      shear, which is exactly the load a wall puts on them.</p>
     <div class="scroll"><table>
       <thead><tr><th>Connection</th><th class="n">Places</th><th class="n">Each</th>
         <th class="n">Screws</th><th>Where the count comes from</th></tr></thead>
       <tbody>${screwRows}</tbody>
       <tfoot>
         <tr class="total"><td>Wall framing, code minimum</td><td class="n"></td><td class="n"></td>
           <td class="n">${d.screwTotal}</td><td class="note"></td></tr>
         <tr><td>With 10% for drops, backouts and re-drives</td><td class="n"></td><td class="n"></td>
           <td class="n">${d.screwBuy}</td>
           <td class="note">${esc(d.screwBoxes)}</td></tr>
       </tfoot></table></div>
     <p class="note">The bottom plate down to the trailer is not in this count — that is a
       different fastener into steel, and it wants a self-drilling structural screw or a bolt
       through the rail on the spacing your hold-down detail calls for.</p>`)}

  ${sheet('A9', 'Buy this', 'wall framing only',
    `<div class="scroll"><table>
       <thead><tr><th>Item</th><th class="n">Qty</th><th>Notes</th></tr></thead>
       <tbody>${shopping.map((s) => `<tr><td>${esc(s.item)}</td><td class="n">${esc(s.qty)}</td>
         <td class="note">${esc(s.note)}</td></tr>`).join('')}</tbody></table></div>`)}

  <footer class="colophon">
    Generated from <b>${esc(meta.source)}</b> by <span style="font-family:var(--mono)">tools/framing-plan.mjs</span>.<br>
    Re-run it after any change to the layout and this sheet moves with it.
  </footer>
</div>`;
}
