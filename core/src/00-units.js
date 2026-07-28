/* ============================================================
   Units and formatting. Everything internal is inches; feet only appear
   at the glass.
   ============================================================ */

/* ============================================================
   00 — Units, spec, and the opening schedule
   Everything internal is INCHES. Feet only appear at the glass.
   ============================================================ */

const FT = 12;
const D2R = Math.PI / 180;
/* ============================================================
   10 — Numbers. Loads, header sizing, truss layout, bracing check.
   Preliminary sizing for an ag-exempt build, not a stamped design.
   ============================================================ */

/* ---- formatting ---- */
const SIXTEENTHS = ['', '¹⁄₁₆', '⅛', '³⁄₁₆', '¼', '⁵⁄₁₆', '⅜', '⁷⁄₁₆', '½',
                    '⁹⁄₁₆', '⅝', '¹¹⁄₁₆', '¾', '¹³⁄₁₆', '⅞', '¹⁵⁄₁₆'];
function fmtIn(inches) {
  const neg = inches < 0;
  let v = Math.abs(inches);
  let whole = Math.floor(v);
  let six = Math.round((v - whole) * 16);
  if (six === 16) { whole += 1; six = 0; }
  return (neg ? '-' : '') + whole + SIXTEENTHS[six] + '"';
}
function fmtFt(inches) {
  const neg = inches < 0;
  let v = Math.abs(inches);
  let ft = Math.floor(v / 12);
  let rem = v - ft * 12;
  let whole = Math.floor(rem);
  let six = Math.round((rem - whole) * 16);
  if (six === 16) { whole += 1; six = 0; }
  if (whole === 12) { ft += 1; whole = 0; }
  return `${neg ? '-' : ''}${ft}'-${whole}${SIXTEENTHS[six]}"`;
}
const fmtN = (n, d = 0) => n.toLocaleString('en-US', {
  minimumFractionDigits: d, maximumFractionDigits: d,
});

/* Accepts 12, 12", 1'-6", 1' 6 1/2", 18.5 — whatever gets typed on a jobsite. */
function parseFeetInches(str) {
  const s = String(str).trim().replace(/[”″]/g, '"').replace(/[’′]/g, "'");
  if (!s) return null;
  let m = s.match(/^(-?\d+(?:\.\d+)?)\s*'\s*[-\s]?\s*(\d+(?:\.\d+)?)?\s*(?:(\d+)\s*\/\s*(\d+))?\s*"?$/);
  if (m) {
    const ft = parseFloat(m[1]);
    const inch = m[2] ? parseFloat(m[2]) : 0;
    const fr = m[3] ? parseInt(m[3], 10) / parseInt(m[4], 10) : 0;
    return ft * 12 + Math.sign(ft || 1) * (inch + fr);
  }
  m = s.match(/^(-?\d+(?:\.\d+)?)\s*(?:(\d+)\s*\/\s*(\d+))?\s*"?$/);
  if (m) {
    const inch = parseFloat(m[1]);
    const fr = m[2] ? parseInt(m[2], 10) / parseInt(m[3], 10) : 0;
    return inch + Math.sign(inch || 1) * fr;
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}
