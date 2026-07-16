/*
 * spline.js — involute splines per ISO 4156 / ANSI B92.1 (30° pressure angle)
 * for GearForge. Generates the external (shaft) cross-section and the
 * internal (hub) cross-section as laser-cuttable plates.
 *
 * Basic geometry (module m, teeth z):
 *   pitch dia  D  = m·z          base dia  Db = m·z·cos 30°
 *   external:  major = m(z+1)    minor = m(z−1.5) flat root | m(z−1.8) fillet root
 *   internal:  minor = m(z−1)    major = m(z+1.5) flat root | m(z+1.8) fillet root
 *   basic circular tooth thickness = basic space width = π·m/2 at the pitch circle.
 *
 * A laser cannot cut interference fits, so a side-fit clearance parameter
 * thins the external tooth (and correspondingly widens nothing on the hub —
 * the hub is cut to basic space width; put all clearance on the shaft or
 * split it as you prefer).
 */
(function (global) {
  'use strict';

  const GEO = (typeof module !== 'undefined' && module.exports)
    ? require('./geometry.js')
    : global.GearForge.geometry;

  const { arc, circle, dedupe, rotPts, mirrorY } = GEO;
  const ALPHA = (30 * Math.PI) / 180;
  const inv = t => Math.tan(t) - t;

  function splineData(m, z, rootType) {
    const fillet = rootType === 'fillet';
    return {
      D: m * z,
      Db: m * z * Math.cos(ALPHA),
      extMajor: m * (z + 1),
      extMinor: fillet ? m * (z - 1.8) : m * (z - 1.5),
      intMinor: m * (z - 1),
      intMajor: fillet ? m * (z + 1.8) : m * (z + 1.5),
      sBasic: (Math.PI * m) / 2,
    };
  }

  /** Involute flank point at radius r for half-thickness angle psi at pitch rp. */
  function flankPts(rb, rp, psi, r0, r1, external, n) {
    const pts = [];
    const t0 = Math.sqrt(Math.max(0, (r0 / rb) ** 2 - 1));
    const t1 = Math.sqrt(Math.max(0, (r1 / rb) ** 2 - 1));
    for (let i = 0; i <= n; i++) {
      const t = t0 + ((t1 - t0) * i) / n;
      const r = rb * Math.sqrt(1 + t * t);
      const ar = Math.atan(t);
      // external teeth narrow outward; internal teeth widen outward
      const th = external ? psi + inv(ALPHA) - inv(ar) : psi - inv(ALPHA) + inv(ar);
      pts.push([r * Math.cos(th), r * Math.sin(th)]);
    }
    return pts;
  }

  /**
   * Tangent-arc root fillet from the end of a flank polyline to a root circle.
   * rootIsMin=true  (external spline): root circle is the part's minimum
   *   radius — fillet center at rRoot + rho, arc bottoms out exactly at rRoot.
   * rootIsMin=false (hub): root circle is the hole's maximum radius —
   *   fillet center at rRoot - rho, arc peaks exactly at rRoot.
   */
  function tangentFillet(flankEnd, rRoot, rho, rootIsMin) {
    const [A, B] = flankEnd; // last two points, B is the very end
    let tx = B[0] - A[0], ty = B[1] - A[1];
    const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
    let nx = -ty, ny = tx;
    // normal should point toward the tooth space (positive theta side)
    if (B[0] * ny - B[1] * nx < 0) { nx = -nx; ny = -ny; }
    let C = [B[0] + nx * rho, B[1] + ny * rho];
    const target = rootIsMin ? rRoot + rho : rRoot - rho;
    const cl = Math.hypot(C[0], C[1]) || 1;
    C = [C[0] * (target / cl), C[1] * (target / cl)];
    const a0 = Math.atan2(B[1] - C[1], B[0] - C[0]);
    let a1 = Math.atan2(C[1], C[0]);           // tangency with the root circle:
    if (rootIsMin) a1 += Math.PI;              // toward the center when root is the minimum
    let sweep = a1 - a0;
    while (sweep > Math.PI) sweep -= 2 * Math.PI;
    while (sweep < -Math.PI) sweep += 2 * Math.PI;
    return arc(C[0], C[1], rho, a0, a0 + sweep, 0.05).slice(1);
  }

  /**
   * External spline shaft cross-section.
   * opts: {m, z, rootType:'flat'|'fillet', clearance, bore, kerf, label}
   */
  function buildSplineShaft(opts) {
    const o = Object.assign({ m: 1, z: 20, rootType: 'flat', clearance: 0.04 }, opts || {});
    const { m, z } = o;
    if (z < 10) throw new Error('Splines per ISO 4156 need z ≥ 10');
    const d = splineData(m, z, o.rootType);
    const warnings = [];

    const rp = d.D / 2, rb = d.Db / 2, ra = d.extMajor / 2, rf = d.extMinor / 2;
    const s = d.sBasic - o.clearance;
    const psi = s / (2 * rp);
    const rho = (o.rootType === 'fillet' ? 0.4 : 0.2) * m;

    const rStart = Math.max(rb * (1 + 1e-9), rf + rho * 0.5);
    const flank = flankPts(rb, rp, psi, rStart, ra, true, 24); // root -> tip, +theta side
    // flank runs tip-ward with theta decreasing; fillet hangs off the root end
    const rootward = flank.slice().reverse(); // tip -> root
    const fil = tangentFillet(rootward.slice(-2), rf, rho, true);

    const spaceAng = Math.PI / z;
    // half tooth from space center to tooth center: root arc, fillet(rev), flank, tip arc half
    const filEndAng = Math.atan2(fil[fil.length - 1][1], fil[fil.length - 1][0]);
    const half = [];
    if (filEndAng < spaceAng - 1e-6) half.push(...arc(0, 0, rf, spaceAng, filEndAng, 0.02));
    half.push(...fil.slice().reverse().filter(q => Math.atan2(q[1], q[0]) < spaceAng - 1e-6));
    half.push(...flank);
    const tipAng = Math.atan2(half[half.length - 1][1], half[half.length - 1][0]);
    if (tipAng < 0) throw new Error('Pointed spline tooth — reduce clearance.');

    const tooth = half.slice();
    tooth.push(...arc(0, 0, ra, tipAng, -tipAng, 0.02).slice(1));
    tooth.push(...mirrorY(half).slice(1));

    const all = [];
    for (let k = 0; k < z; k++) all.push(...rotPts(tooth, -(2 * Math.PI * k) / z));
    const outline = dedupe(all, 1e-7);
    outline.reverse(); // CCW

    const loops = [{ pts: outline, isHole: false }];
    if (o.bore && o.bore.type === 'round' && o.bore.d > 0) {
      if (o.bore.d / 2 >= rf * 0.85) warnings.push({ level: 'warn', msg: 'Bore leaves a thin spline wall.' });
      const bl = GEO.boreRound(o.bore.d); bl.circleHint = { cx: 0, cy: 0, r: o.bore.d / 2 };
      loops.push(bl);
    }

    const data = {
      type: `External involute spline (ISO 4156, 30°, ${o.rootType} root)`,
      module: m, teeth: z, pressureAngleDeg: 30,
      pitchDia: d.D, baseDia: d.Db, majorDia: d.extMajor, minorDia: d.extMinor,
      toothThickness: s, basicToothThickness: d.sBasic, sideClearance: o.clearance,
      designation: `EXT ${z}z x ${m}m x 30P ${o.rootType === 'fillet' ? 'fillet' : 'flat'} root`,
    };
    return {
      cut: loops,
      engrave: [
        { kind: 'circle', cx: 0, cy: 0, r: rp },
        ...(o.label === '' ? [] : [{ kind: 'text', x: 0, y: -rp * 0.3, h: Math.max(2, rp * 0.12), text: o.label !== undefined ? o.label : `SPL ${z}×${m}` }]),
      ],
      data, warnings,
    };
  }

  /**
   * Internal spline hub: plate with a spline-shaped hole.
   * opts: {m, z, rootType, od (plate outer dia), boltCircle, kerf, label}
   */
  function buildSplineHub(opts) {
    const o = Object.assign({ m: 1, z: 20, rootType: 'flat' }, opts || {});
    const { m, z } = o;
    if (z < 10) throw new Error('Splines per ISO 4156 need z ≥ 10');
    const d = splineData(m, z, o.rootType);
    const warnings = [];

    const rp = d.D / 2, rb = d.Db / 2;
    const rTip = d.intMinor / 2;   // teeth point inward
    const rRoot = d.intMajor / 2;
    const s = d.sBasic;            // basic — clearance lives on the shaft
    const psi = s / (2 * rp);
    const rho = (o.rootType === 'fillet' ? 0.4 : 0.2) * m;

    const rIn = Math.max(rTip, rb * (1 + 1e-9));
    if (rTip < rb) warnings.push({ level: 'info', msg: 'Internal tooth tip below base circle — tip trimmed to base circle.' });

    const flank = flankPts(rb, rp, psi, rIn, rRoot - rho * 0.5, false, 24); // tip -> root, widening
    const fil = tangentFillet(flank.slice(-2), rRoot, rho, false);

    const spaceAng = Math.PI / z;
    const half = [];
    half.push(...flank, ...fil.filter(q => Math.atan2(q[1], q[0]) < spaceAng - 1e-6));
    const endAng = Math.atan2(half[half.length - 1][1], half[half.length - 1][0]);
    if (endAng < spaceAng - 1e-6) half.push(...arc(0, 0, rRoot, endAng, spaceAng, 0.02).slice(1));

    const tipHalfAng = Math.atan2(flank[0][1], flank[0][0]);
    const minus = mirrorY(half);
    const tooth = [];
    tooth.push(...minus);
    if (tipHalfAng > 1e-9) tooth.push(...arc(0, 0, rIn, -tipHalfAng, tipHalfAng, 0.02).slice(1));
    tooth.push(...half.slice(1));

    const all = [];
    for (let k = 0; k < z; k++) all.push(...rotPts(tooth, (2 * Math.PI * k) / z));
    const hole = dedupe(all, 1e-7);

    const rOut = (o.od || d.intMajor + 6 * m) / 2;
    if (rOut <= rRoot + m) throw new Error('Hub outer diameter too small.');
    const loops = [
      { pts: circle(0, 0, rOut, Math.max(120, z * 5)), isHole: false, circleHint: { cx: 0, cy: 0, r: rOut } },
      { pts: hole, isHole: true },
    ];
    if (o.boltCircle && o.boltCircle.n > 0 && o.boltCircle.d > 0 && o.boltCircle.bcd > 0) {
      const bc = o.boltCircle;
      if (bc.bcd / 2 + bc.d / 2 >= rOut || bc.bcd / 2 - bc.d / 2 <= rRoot) {
        warnings.push({ level: 'error', msg: 'Bolt circle collides with hub bounds — holes skipped.' });
      } else loops.push(...GEO.boltCircle(bc.n, bc.d, bc.bcd, bc.startDeg || 0));
    }

    const data = {
      type: `Internal involute spline hub (ISO 4156, 30°, ${o.rootType} root)`,
      module: m, teeth: z, pressureAngleDeg: 30,
      pitchDia: d.D, baseDia: d.Db, majorDia: d.intMajor, minorDia: d.intMinor,
      spaceWidth: d.sBasic, hubOuterDia: 2 * rOut,
      designation: `INT ${z}z x ${m}m x 30P ${o.rootType === 'fillet' ? 'fillet' : 'flat'} root`,
    };
    return {
      cut: loops,
      engrave: [
        { kind: 'circle', cx: 0, cy: 0, r: rp },
        ...(o.label === '' ? [] : [{ kind: 'text', x: 0, y: -rOut * 0.55, h: Math.max(2, rp * 0.12), text: o.label !== undefined ? o.label : `SPL HUB ${z}×${m}` }]),
      ],
      data, warnings,
    };
  }

  const api = { splineData, buildSplineShaft, buildSplineHub };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (global.GearForge = global.GearForge || {}).spline = api;
})(typeof self !== 'undefined' ? self : this);
