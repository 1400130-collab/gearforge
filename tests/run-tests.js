/* GearForge test suite — run with: node tests/run-tests.js */
'use strict';
const test = require('node:test');
const assert = require('node:assert');

const GEO = require('../src/geometry.js');
const INV = require('../src/involute.js');

const deg = d => (d * Math.PI) / 180;

// ---------------------------------------------------------------- involute

test('involute inverse round-trips', () => {
  for (const a of [5, 14.5, 20, 25, 30, 38]) {
    const q = INV.inv(deg(a));
    const back = INV.invInverse(q);
    assert.ok(Math.abs(back - deg(a)) < 1e-10, `inv⁻¹(inv(${a}°))`);
  }
});

test('tooth thickness of generated flank matches formula', () => {
  for (const params of [
    { m: 2, z: 20, alphaDeg: 20, x: 0 },
    { m: 2, z: 20, alphaDeg: 20, x: 0.4 },
    { m: 1.5, z: 35, alphaDeg: 14.5, x: -0.2 },
    { m: 3, z: 13, alphaDeg: 25, x: 0.3, backlash: 0.1 },
  ]) {
    const p = INV.normalizeParams(params);
    const g = INV.externalGearData(p);
    const flank = INV.involuteFlank(g, p, Math.max(g.rb * (1 + 1e-9), 0), 200);
    // find the flank point at the pitch radius (interpolate)
    let th = null;
    for (let i = 0; i < flank.length - 1; i++) {
      const r1 = Math.hypot(...flank[i]), r2 = Math.hypot(...flank[i + 1]);
      if ((r1 - g.rp) * (r2 - g.rp) <= 0) {
        const t = (g.rp - r1) / (r2 - r1);
        const a1 = Math.atan2(flank[i][1], flank[i][0]);
        const a2 = Math.atan2(flank[i + 1][1], flank[i + 1][0]);
        th = a1 + t * (a2 - a1);
        break;
      }
    }
    assert.ok(th !== null, 'flank crosses pitch circle');
    const sMeasured = 2 * th * g.rp; // tooth symmetric about theta=0
    assert.ok(Math.abs(sMeasured - g.s) < 1e-3,
      `s: measured ${sMeasured.toFixed(5)} vs formula ${g.s.toFixed(5)} (${JSON.stringify(params)})`);
  }
});

test('span measurement matches known value (m=1 z=20 a=20 x=0, k=3)', () => {
  // W3 = m cos a (pi(k-0.5) + z inv a) = cos20*(2.5pi + 20*0.014904)
  const p = INV.normalizeParams({ m: 1, z: 20, alphaDeg: 20, x: 0 });
  const W = INV.spanMeasurement(p, 3);
  const expected = Math.cos(deg(20)) * (Math.PI * 2.5 + 20 * INV.inv(deg(20)));
  assert.ok(Math.abs(W - expected) < 1e-12);
  assert.ok(Math.abs(W - 7.6604) < 5e-4, `W3=${W}`); // handbook value ≈ 7.660
});

test('measurement over pins agrees with pin placed on generated flanks', () => {
  for (const params of [
    { m: 2, z: 20, alphaDeg: 20, x: 0 },
    { m: 2, z: 21, alphaDeg: 20, x: 0.25 },
    { m: 1, z: 40, alphaDeg: 20, x: -0.1 },
    { m: 3, z: 15, alphaDeg: 25, x: 0.2 },
  ]) {
    const p = INV.normalizeParams(params);
    const g = INV.externalGearData(p);
    const pins = INV.measurementOverPins(p, g);
    assert.ok(isFinite(pins.M) && pins.M > 2 * g.rp, 'M finite and > pitch dia');

    // geometric check: pin center from formula must be tangent to the flank
    // of the adjacent tooth (distance from center to flank == pin radius).
    const flank = INV.involuteFlank(g, p, g.rb * (1 + 1e-9), 400);
    // pin sits in the tooth space centered at theta = pi/z (between tooth 0 and 1)
    const c = [pins.Rc * Math.cos(Math.PI / p.z), pins.Rc * Math.sin(Math.PI / p.z)];
    // adjacent tooth 1 flank facing the space = tooth 0's +theta flank rotated…
    // tooth 0's own +theta flank faces this space directly:
    const dFlank = GEO.pointPolylineDist(c, flank);
    const err = Math.abs(dFlank - pins.dPin / 2);
    assert.ok(err < 5e-3, `pin tangency error ${err.toFixed(5)} mm for ${JSON.stringify(params)}`);
  }
});

test('center distance / working pressure angle round-trip', () => {
  const p1 = INV.normalizeParams({ m: 2, z: 17, alphaDeg: 20, x: 0.3 });
  const p2 = INV.normalizeParams({ m: 2, z: 43, alphaDeg: 20, x: 0.1 });
  const mesh = INV.meshExternal(p1, p2);
  // recompute x1+x2 from aw
  const invAw = INV.inv(mesh.alphaW);
  const sumX = ((invAw - INV.inv(p1.alpha)) * (p1.z + p2.z)) / (2 * Math.tan(p1.alpha));
  assert.ok(Math.abs(sumX - 0.4) < 1e-9, `x1+x2 recovered: ${sumX}`);
  assert.ok(mesh.aw > mesh.a0, 'positive shift increases center distance');
  assert.ok(mesh.epsAlpha > 1, `contact ratio ${mesh.epsAlpha}`);
});

test('standard pair contact ratio matches independent calculation (z=20/z=40, a=20)', () => {
  const p1 = INV.normalizeParams({ m: 1, z: 20, alphaDeg: 20, x: 0 });
  const p2 = INV.normalizeParams({ m: 1, z: 40, alphaDeg: 20, x: 0 });
  const mesh = INV.meshExternal(p1, p2);
  // independent: (sqrt(ra1²-rb1²)+sqrt(ra2²-rb2²)-a·sinα)/(π·m·cosα) = 1.6352
  assert.ok(Math.abs(mesh.epsAlpha - 1.6352) < 0.001, `eps=${mesh.epsAlpha.toFixed(4)}`);
});

// ------------------------------------------------------------ full outline

function checkOutline(part, label) {
  assert.ok(part.cut.length >= 1, `${label}: has loops`);
  const outer = part.cut[0];
  assert.ok(outer.pts.length > 50, `${label}: enough points`);
  assert.ok(GEO.signedArea(outer.pts) > 0, `${label}: outer loop CCW`);
  assert.ok(!GEO.selfIntersects(outer.pts), `${label}: no self-intersection`);
}

test('standard gear outline: closed, simple, radii in range', () => {
  const part = INV.buildExternalGear({ m: 2, z: 20, alphaDeg: 20, x: 0 });
  checkOutline(part, 'z20');
  const g = part.geo.g;
  for (const q of part.cut[0].pts) {
    const r = Math.hypot(q[0], q[1]);
    assert.ok(r > g.rf - 1e-6 && r < g.ra + 1e-6, `radius ${r} in [rf,ra]`);
  }
  // tip and root actually reached
  const rs = part.cut[0].pts.map(q => Math.hypot(q[0], q[1]));
  assert.ok(Math.max(...rs) > g.ra - 1e-3, 'tip reached');
  assert.ok(Math.min(...rs) < g.rf + 1e-3, 'root reached');
});

test('undercut gear (z=8, x=0) is still a simple closed polygon', () => {
  const part = INV.buildExternalGear({ m: 2, z: 8, alphaDeg: 20, x: 0 });
  checkOutline(part, 'z8 undercut');
  assert.ok(part.warnings.some(w => /undercut/i.test(w.msg)), 'undercut warning issued');
});

test('parameter sweep: closed simple outlines', () => {
  for (const z of [6, 9, 12, 17, 25, 41, 80]) {
    for (const x of [-0.3, 0, 0.5]) {
      for (const alphaDeg of [14.5, 20, 25]) {
        if (z <= 8 && x < 0) continue; // degenerate root, rejected anyway
        let part;
        try {
          part = INV.buildExternalGear({ m: 2, z, alphaDeg, x });
        } catch (e) {
          continue; // explicit rejection is fine
        }
        const outer = part.cut[0];
        assert.ok(!GEO.selfIntersects(outer.pts), `simple polygon z=${z} x=${x} a=${alphaDeg}`);
      }
    }
  }
});

test('internal gear: annulus with toothed hole', () => {
  const part = INV.buildInternalGear({ m: 2, z: 36, alphaDeg: 20, x: 0 });
  assert.strictEqual(part.cut.length, 2);
  assert.ok(!part.cut[0].isHole && part.cut[1].isHole);
  assert.ok(!GEO.selfIntersects(part.cut[1].pts), 'toothed hole simple');
  const rs = part.cut[1].pts.map(q => Math.hypot(q[0], q[1]));
  const g = part.geo.g;
  assert.ok(Math.min(...rs) > g.ra - 1e-3, 'inner tip radius respected');
  assert.ok(Math.max(...rs) < g.rf + 1e-3, 'outer root radius respected');
});

test('rack: pitch and closure', () => {
  const part = INV.buildRack({ m: 2, alphaDeg: 20, teeth: 8 });
  const outer = part.cut[0];
  assert.ok(GEO.signedArea(outer.pts) > 0);
  assert.ok(!GEO.selfIntersects(outer.pts), 'rack outline simple');
  assert.ok(Math.abs(part.data.circularPitch - Math.PI * 2) < 1e-12);
  assert.ok(Math.abs(part.data.length - 8 * Math.PI * 2) < 1e-9, 'length = n·p');
});

// ---------------------------------------------------------------- features

test('bores: round, D, hex, keyed', () => {
  const base = { m: 2, z: 30, alphaDeg: 20, x: 0 };
  const r = INV.buildExternalGear(base, { bore: { type: 'round', d: 10 } });
  assert.strictEqual(r.cut.length, 2);
  const rs = r.cut[1].pts.map(q => Math.hypot(q[0], q[1]));
  assert.ok(rs.every(v => Math.abs(v - 5) < 1e-6), 'round bore radius');

  const dd = INV.buildExternalGear(base, { bore: { type: 'd', d: 10, flatDepth: 1 } });
  const maxX = Math.max(...dd.cut[1].pts.map(q => q[0]));
  assert.ok(Math.abs(maxX - 4) < 1e-6, `D-flat at x=4, got ${maxX}`);

  const hx = INV.buildExternalGear(base, { bore: { type: 'hex', af: 8 } });
  assert.strictEqual(hx.cut[1].pts.length, 6);

  const kk = INV.buildExternalGear(base, { bore: { type: 'key', d: 12 } });
  const kmax = Math.max(...kk.cut[1].pts.map(q => q[0]));
  assert.ok(Math.abs(kmax - (6 + 1.8)) < 1e-6, `keyway depth d/2+t2, got ${kmax}`);
});

// ------------------------------------------------------------------- kerf

test('kerf offset grows outer loop and shrinks holes radially', () => {
  const kerf = 0.2;
  const outer = { pts: GEO.circle(0, 0, 20, 256), isHole: false };
  const hole = { pts: GEO.circle(0, 0, 5, 128), isHole: true };
  const o2 = GEO.offsetLoopForKerf(outer, kerf);
  const h2 = GEO.offsetLoopForKerf(hole, kerf);
  for (const q of o2.pts) assert.ok(Math.abs(Math.hypot(q[0], q[1]) - 20.1) < 1e-3);
  for (const q of h2.pts) assert.ok(Math.abs(Math.hypot(q[0], q[1]) - 4.9) < 1e-3);
});

test('kerf offset of a gear stays simple', () => {
  const part = INV.buildExternalGear({ m: 2, z: 16, alphaDeg: 20, x: 0.2 });
  const off = GEO.offsetLoopForKerf(part.cut[0], 0.15);
  assert.ok(!GEO.selfIntersects(off.pts), 'offset outline simple');
});

// ---------------------------------------------------------------- pulleys

const PUL = require('../src/pulley.js');

test('GT2 20T pulley matches commercial spec', () => {
  const part = PUL.buildPulley({ profile: 'GT2_2mm', teeth: 20 });
  assert.ok(Math.abs(part.data.outsideDia - 12.2244) < 1e-3, `OD=${part.data.outsideDia}`);
  assert.ok(Math.abs(part.data.pitchDia - 12.7324) < 1e-3, `PD=${part.data.pitchDia}`);
});

test('all belt profiles produce simple closed pulleys with z grooves', () => {
  for (const prof of PUL.ORDER) {
    const part = PUL.buildPulley({ profile: prof, teeth: 24 });
    const pts = part.cut[0].pts;
    assert.ok(GEO.signedArea(pts) > 0, `${prof} CCW`);
    assert.ok(!GEO.selfIntersects(pts), `${prof} simple`);
    // groove count: count local minima runs of radius below R - depth/2
    const R = part.data.outsideDia / 2;
    const thresh = R - part.data.grooveDepth / 2;
    let grooves = 0, inGroove = false;
    for (const q of pts) {
      const below = Math.hypot(q[0], q[1]) < thresh;
      if (below && !inGroove) grooves++;
      inGroove = below;
    }
    assert.strictEqual(grooves, 24, `${prof} groove count ${grooves}`);
    // pitch consistency: z * p == pi * pitchDia
    assert.ok(Math.abs(24 * part.data.beltPitch - Math.PI * part.data.pitchDia) < 1e-9, `${prof} pitch`);
  }
});

test('pulley rejects overlapping grooves and tiny tooth counts', () => {
  assert.throws(() => PUL.buildPulley({ profile: 'GT2_2mm', teeth: 6 }));
});

// ---------------------------------------------------------------- splines

const SPL = require('../src/spline.js');

test('spline diameters follow ISO 4156 / ANSI B92.1', () => {
  const d = SPL.splineData(1, 20, 'flat');
  assert.strictEqual(d.extMajor, 21);
  assert.strictEqual(d.extMinor, 18.5);
  assert.strictEqual(d.intMinor, 19);
  assert.strictEqual(d.intMajor, 21.5);
  const df = SPL.splineData(2, 15, 'fillet');
  assert.ok(Math.abs(df.extMinor - 2 * 13.2) < 1e-12);
  assert.ok(Math.abs(df.intMajor - 2 * 16.8) < 1e-12);
});

test('spline shaft geometry hits major/minor diameters, simple polygon', () => {
  const part = SPL.buildSplineShaft({ m: 1, z: 20, rootType: 'flat', clearance: 0.04 });
  const pts = part.cut[0].pts;
  assert.ok(!GEO.selfIntersects(pts), 'simple');
  const rs = pts.map(q => Math.hypot(q[0], q[1]));
  assert.ok(Math.abs(Math.max(...rs) - 10.5) < 1e-3, `major ${Math.max(...rs)}`);
  assert.ok(Math.abs(Math.min(...rs) - 9.25) < 1e-3, `minor ${Math.min(...rs)}`);
});

test('spline hub: shaft tooth fits hub space with clearance', () => {
  const hub = SPL.buildSplineHub({ m: 1, z: 20, rootType: 'flat' });
  const hole = hub.cut[1];
  assert.ok(hole.isHole && !GEO.selfIntersects(hole.pts), 'hub hole simple');
  const rs = hole.pts.map(q => Math.hypot(q[0], q[1]));
  assert.ok(Math.min(...rs) > 9.5 - 1e-3, 'hub minor dia = m(z-1)');
  assert.ok(Math.max(...rs) < 10.75 + 1e-3, 'hub major dia = m(z+1.5)');
  // side fit: shaft tooth thickness < hub space width
  const shaft = SPL.buildSplineShaft({ m: 1, z: 20, clearance: 0.04 });
  assert.ok(shaft.data.toothThickness < hub.data.spaceWidth, 'side-fit clearance');
});

// -------------------------------------------------------------- exporters

const EXP = require('../src/exporters.js');

test('SVG export: mm-true dimensions, layers, closed paths', () => {
  const part = INV.buildExternalGear({ m: 2, z: 20, alphaDeg: 20, x: 0 }, { bore: { type: 'round', d: 8 } });
  const svg = EXP.toSVG(part, { kerf: 0.1, margin: 2 });
  const m = svg.match(/width="([\d.]+)mm" height="([\d.]+)mm" viewBox="0 0 ([\d.]+) ([\d.]+)"/);
  assert.ok(m, 'mm-true header');
  assert.strictEqual(m[1], m[3], 'viewBox matches width');
  // tip dia 44 + kerf 0.1 + margins 4 = 48.1
  assert.ok(Math.abs(parseFloat(m[1]) - 48.1) < 1e-2, `svg width ${m[1]}`);
  assert.ok(svg.includes('id="CUT"') && svg.includes('id="ENGRAVE"'));
  assert.ok(/<circle[^>]*r="3.95"/.test(svg), 'bore kerf-shrunk to r=3.95');
  assert.ok(svg.includes(' Z"'), 'closed paths');
});

test('DXF export: parses as valid group-code pairs with expected entities', () => {
  const part = PUL.buildPulley({ profile: 'GT2_2mm', teeth: 20, bore: { type: 'round', d: 5 } });
  const dxf = EXP.toDXF(part, { kerf: 0.08 });
  const rows = dxf.trim().split(/\r\n/);
  assert.ok(rows.length % 2 === 0, 'even group-code/value pairs');
  const count = tag => rows.filter((r, i) => i % 2 === 1 && r === tag).length;
  assert.ok(count('POLYLINE') >= 1, 'has POLYLINE');
  assert.strictEqual(count('SEQEND'), count('POLYLINE'), 'SEQEND per POLYLINE');
  assert.ok(count('CIRCLE') >= 2, 'bore + engrave circles');
  assert.strictEqual(rows[rows.length - 1], 'EOF');
  // closed flag present
  const i70 = rows.findIndex((r, i) => i % 2 === 0 && r === '70' && rows[i - 1] === '1');
  assert.ok(i70 > 0, 'closed polyline flag');
});

test('report includes inspection values', () => {
  const part = INV.buildExternalGear({ m: 2, z: 20, alphaDeg: 20, x: 0.2 });
  const rep = EXP.toReport(part, { kerf: 0.1 });
  assert.ok(/Measurement Over Pins/.test(rep));
  assert.ok(/Span Measurement/.test(rep));
  assert.ok(/Kerf compensated\s+0.1/.test(rep));
});

// --------------------------------------------------- flank join smoothness

test('fillet-involute join is smooth (radius monotonic up each flank)', () => {
  for (const params of [
    { m: 2, z: 20, alphaDeg: 20, x: 0 },
    { m: 2, z: 12, alphaDeg: 20, x: 0.3 },
    { m: 2, z: 8, alphaDeg: 20, x: 0 },    // undercut
    { m: 1, z: 60, alphaDeg: 20, x: -0.2 },
    { m: 3, z: 17, alphaDeg: 14.5, x: 0.4 },
  ]) {
    const part = INV.buildExternalGear(params);
    const pts = part.cut[0].pts;
    const z = params.z;
    const n = Math.ceil(pts.length / z) + 2;
    const seq = pts.slice(0, n).map(q => Math.hypot(q[0], q[1]));
    let worst = 0;
    for (let i = 2; i < seq.length; i++) {
      const d1 = seq[i - 1] - seq[i - 2], d2 = seq[i] - seq[i - 1];
      if (d1 * d2 < -1e-12) worst = Math.max(worst, Math.min(Math.abs(d1), Math.abs(d2)));
    }
    // allow only sub-micron wobble along a single tooth boundary
    assert.ok(worst < 1e-3, `join wiggle ${(worst * 1000).toFixed(2)} µm for ${JSON.stringify(params)}`);
  }
});

// ------------------------------------------------------------ mesh rolling

test('gear pair rolls through a full pitch with zero interpenetration', () => {
  const inPoly = (pt, poly) => {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
      if (((yi > pt[1]) !== (yj > pt[1])) && (pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  };
  const rot = (pts, a) => pts.map(([x, y]) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)]);
  const z1 = 20, z2 = 40, m = 2, bl = 0.05;
  const p1 = INV.normalizeParams({ m, z: z1, alphaDeg: 20, x: 0, backlash: bl });
  const p2 = INV.normalizeParams({ m, z: z2, alphaDeg: 20, x: 0, backlash: bl });
  const mesh = INV.meshExternal(p1, p2);
  const g1 = INV.buildExternalGear({ m, z: z1, alphaDeg: 20, x: 0, backlash: bl }, { label: '' });
  const g2 = INV.buildExternalGear({ m, z: z2, alphaDeg: 20, x: 0, backlash: bl }, { label: '' });
  const beta2 = Math.PI - Math.PI / z2;
  const tip1 = m * z1 / 2 + m;
  for (let k = 0; k <= 12; k++) {
    const th1 = (k / 12) * (2 * Math.PI / z1);
    const th2 = beta2 - th1 * z1 / z2;
    const P1 = rot(g1.cut[0].pts, th1);
    const P2 = rot(g2.cut[0].pts, th2).map(([x, y]) => [x + mesh.aw, y]);
    for (const q of P2) {
      if (Math.hypot(q[0], q[1]) < tip1 + 0.05) {
        assert.ok(!inPoly(q, P1), `interpenetration at phase ${th1.toFixed(3)}`);
      }
    }
  }
});
