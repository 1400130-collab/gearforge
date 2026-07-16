/*
 * geometry.js — shared 2-D computational geometry for GearForge.
 * Works as a classic browser <script> (attaches to window.GearForge.geometry)
 * and as a CommonJS module for the Node test suite.
 */
(function (global) {
  'use strict';

  const TAU = Math.PI * 2;

  // ---------------------------------------------------------------- vectors

  function rot(p, ang) {
    const c = Math.cos(ang), s = Math.sin(ang);
    return [p[0] * c - p[1] * s, p[0] * s + p[1] * c];
  }

  function rotPts(pts, ang) {
    const c = Math.cos(ang), s = Math.sin(ang);
    return pts.map(p => [p[0] * c - p[1] * s, p[0] * s + p[1] * c]);
  }

  function translatePts(pts, dx, dy) {
    return pts.map(p => [p[0] + dx, p[1] + dy]);
  }

  function mirrorY(pts) { // mirror across the X axis (negate y), reversing order
    const out = pts.map(p => [p[0], -p[1]]);
    out.reverse();
    return out;
  }

  function dist(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); }

  // ------------------------------------------------------------------ arcs

  /**
   * Sample a circular arc centered at (cx,cy), radius r, from angle a0 to a1
   * (radians, signed sweep — goes the way the numbers say). Includes both ends.
   * `res` = max angular step in radians (default ~1.5°).
   */
  function arc(cx, cy, r, a0, a1, res) {
    res = res || 0.026;
    const sweep = a1 - a0;
    const n = Math.max(2, Math.ceil(Math.abs(sweep) / res));
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const a = a0 + (sweep * i) / n;
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
    return pts;
  }

  function circle(cx, cy, r, n) {
    n = n || Math.max(32, Math.ceil(TAU / Math.min(0.05, 0.5 / Math.max(r, 1))));
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (TAU * i) / n;
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
    return pts;
  }

  // ---------------------------------------------------------- polygon utils

  function signedArea(pts) {
    let a = 0;
    for (let i = 0, n = pts.length; i < n; i++) {
      const p = pts[i], q = pts[(i + 1) % n];
      a += p[0] * q[1] - q[0] * p[1];
    }
    return a / 2;
  }

  function ensureWinding(pts, ccw) {
    const isCCW = signedArea(pts) > 0;
    if (isCCW === ccw) return pts;
    return pts.slice().reverse();
  }

  /** Remove consecutive duplicate points (within eps). */
  function dedupe(pts, eps) {
    eps = eps || 1e-7;
    const out = [];
    for (const p of pts) {
      const last = out[out.length - 1];
      if (!last || Math.abs(last[0] - p[0]) > eps || Math.abs(last[1] - p[1]) > eps) out.push(p);
    }
    if (out.length > 2) {
      const a = out[0], b = out[out.length - 1];
      if (Math.abs(a[0] - b[0]) <= eps && Math.abs(a[1] - b[1]) <= eps) out.pop();
    }
    return out;
  }

  /** Ramer-Douglas-Peucker polyline simplification (open polyline). */
  function rdp(pts, eps) {
    if (pts.length < 3) return pts.slice();
    const keep = new Uint8Array(pts.length);
    keep[0] = keep[pts.length - 1] = 1;
    const stack = [[0, pts.length - 1]];
    while (stack.length) {
      const [i0, i1] = stack.pop();
      const a = pts[i0], b = pts[i1];
      const abx = b[0] - a[0], aby = b[1] - a[1];
      const l = Math.hypot(abx, aby) || 1e-12;
      let dMax = -1, iMax = -1;
      for (let i = i0 + 1; i < i1; i++) {
        const d = Math.abs(abx * (a[1] - pts[i][1]) - (a[0] - pts[i][0]) * aby) / l;
        if (d > dMax) { dMax = d; iMax = i; }
      }
      if (dMax > eps && iMax > 0) {
        keep[iMax] = 1;
        stack.push([i0, iMax], [iMax, i1]);
      }
    }
    const out = [];
    for (let i = 0; i < pts.length; i++) if (keep[i]) out.push(pts[i]);
    return out;
  }

  /** Segment intersection: returns [x,y] or null. Proper intersections only. */
  function segIntersect(p1, p2, p3, p4) {
    const d1x = p2[0] - p1[0], d1y = p2[1] - p1[1];
    const d2x = p4[0] - p3[0], d2y = p4[1] - p3[1];
    const den = d1x * d2y - d1y * d2x;
    if (Math.abs(den) < 1e-14) return null;
    const t = ((p3[0] - p1[0]) * d2y - (p3[1] - p1[1]) * d2x) / den;
    const u = ((p3[0] - p1[0]) * d1y - (p3[1] - p1[1]) * d1x) / den;
    if (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9) return null;
    return [p1[0] + t * d1x, p1[1] + t * d1y];
  }

  /**
   * First intersection between two open polylines A and B.
   * Returns {pt, ia, ib} where ia = index of A's segment, ib = B's — or null.
   */
  function polylineIntersect(A, B) {
    for (let i = 0; i < A.length - 1; i++) {
      for (let j = 0; j < B.length - 1; j++) {
        const p = segIntersect(A[i], A[i + 1], B[j], B[j + 1]);
        if (p) return { pt: p, ia: i, ib: j };
      }
    }
    return null;
  }

  /** Closest pair of vertices between two polylines: {ia, ib, d}. */
  function closestApproach(A, B) {
    let best = { ia: 0, ib: 0, d: Infinity };
    for (let i = 0; i < A.length; i++) {
      for (let j = 0; j < B.length; j++) {
        const d = dist(A[i], B[j]);
        if (d < best.d) best = { ia: i, ib: j, d };
      }
    }
    return best;
  }

  /** Does a closed polygon self-intersect? O(n²) — used only in tests. */
  function selfIntersects(pts) {
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const a1 = pts[i], a2 = pts[(i + 1) % n];
      for (let j = i + 2; j < n; j++) {
        if (i === 0 && j === n - 1) continue; // adjacent through wrap
        const p = segIntersect(a1, a2, pts[j], pts[(j + 1) % n]);
        if (p) return true;
      }
    }
    return false;
  }

  /** Min distance from point to an open polyline (segments, not just vertices). */
  function pointPolylineDist(pt, pts) {
    let best = Infinity;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const abx = b[0] - a[0], aby = b[1] - a[1];
      const l2 = abx * abx + aby * aby;
      let t = l2 > 0 ? (((pt[0] - a[0]) * abx + (pt[1] - a[1]) * aby) / l2) : 0;
      t = Math.max(0, Math.min(1, t));
      const d = Math.hypot(pt[0] - (a[0] + t * abx), pt[1] - (a[1] + t * aby));
      if (d < best) best = d;
    }
    return best;
  }

  // ------------------------------------------------------------ kerf offset

  /**
   * Offset a closed loop by `delta` along the outward normal of a CCW loop
   * (positive delta grows a CCW loop; to shrink a hole, pass the hole as CCW
   * and a negative delta, or use offsetLoopForKerf below).
   * Vertex-normal (miter-averaged) offset — exact for delta ≪ local radius,
   * which holds for laser kerf (≤ ~0.2 mm) against our fillet radii.
   */
  function offsetClosed(pts, delta) {
    const n = pts.length;
    if (!delta) return pts.slice();
    const out = new Array(n);
    for (let i = 0; i < n; i++) {
      const prev = pts[(i - 1 + n) % n], cur = pts[i], next = pts[(i + 1) % n];
      // edge normals (outward for CCW = rotate direction -90°)
      let n1x = cur[1] - prev[1], n1y = prev[0] - cur[0];
      let n2x = next[1] - cur[1], n2y = cur[0] - next[0];
      const l1 = Math.hypot(n1x, n1y) || 1, l2 = Math.hypot(n2x, n2y) || 1;
      n1x /= l1; n1y /= l1; n2x /= l2; n2y /= l2;
      let nx = n1x + n2x, ny = n1y + n2y;
      const nl = Math.hypot(nx, ny);
      if (nl < 1e-9) { nx = n1x; ny = n1y; }
      else {
        nx /= nl; ny /= nl;
        // miter scale, clamped to avoid spikes at sharp concave corners
        const cosHalf = Math.max(0.35, (nx * n1x + ny * n1y));
        nx /= cosHalf; ny /= cosHalf;
      }
      out[i] = [cur[0] + delta * nx, cur[1] + delta * ny];
    }
    return out;
  }

  /**
   * Kerf-offset a Part loop. Beam centerline must sit kerf/2 outside the
   * material edge: outer boundaries grow, holes shrink.
   * Loop pts are normalized to CCW internally; result keeps CCW.
   */
  function offsetLoopForKerf(loop, kerf) {
    if (!kerf) return { pts: loop.pts.slice(), isHole: !!loop.isHole };
    const ccw = ensureWinding(loop.pts, true);
    const delta = loop.isHole ? -kerf / 2 : kerf / 2;
    return { pts: offsetClosed(ccw, delta), isHole: !!loop.isHole };
  }

  // ----------------------------------------------------- bores and features
  // All bore builders return hole loops (isHole:true) centered at (0,0).

  /** Plain round bore. */
  function boreRound(d) {
    return { pts: circle(0, 0, d / 2, Math.max(48, Math.ceil(d * 6))), isHole: true };
  }

  /** D-shaped bore: circle of dia d with a flat leaving `flatDepth` removed. */
  function boreD(d, flatDepth) {
    const r = d / 2;
    const fx = r - flatDepth;              // x of the flat (flat faces +X)
    if (fx <= -r + 1e-6 || fx >= r - 1e-6) return boreRound(d);
    const a = Math.acos(fx / r);           // half-angle of the removed cap
    const pts = arc(0, 0, r, a, TAU - a);  // big arc, endpoints on the flat line
    return { pts: dedupe(pts), isHole: true };
  }

  /** Regular polygon bore by across-flats size (hex: n=6, square: n=4). */
  function borePolygon(acrossFlats, n) {
    const rIn = acrossFlats / 2;
    const rC = rIn / Math.cos(Math.PI / n); // circumradius
    const pts = [];
    for (let i = 0; i < n; i++) {
      const ang = (TAU * i) / n + Math.PI / n; // flat facing +X
      pts.push([rC * Math.cos(ang), rC * Math.sin(ang)]);
    }
    return { pts, isHole: true };
  }

  /**
   * DIN 6885-1 (≈ ISO 773) parallel-key keyway table for the HUB.
   * For shaft dia range (mm]: key width b, hub-side depth t2 (so slot reaches
   * d/2 + t2 from center). Returns {b, t2, h} or null if out of table.
   */
  const DIN6885 = [
    { min: 6,  max: 8,   b: 2,  h: 2,  t2: 1.0 },
    { min: 8,  max: 10,  b: 3,  h: 3,  t2: 1.4 },
    { min: 10, max: 12,  b: 4,  h: 4,  t2: 1.8 },
    { min: 12, max: 17,  b: 5,  h: 5,  t2: 2.3 },
    { min: 17, max: 22,  b: 6,  h: 6,  t2: 2.8 },
    { min: 22, max: 30,  b: 8,  h: 7,  t2: 3.3 },
    { min: 30, max: 38,  b: 10, h: 8,  t2: 3.3 },
    { min: 38, max: 44,  b: 12, h: 8,  t2: 3.3 },
    { min: 44, max: 50,  b: 14, h: 9,  t2: 3.8 },
    { min: 50, max: 58,  b: 16, h: 10, t2: 4.3 },
  ];

  function keywayForShaft(d) {
    for (const row of DIN6885) if (d > row.min && d <= row.max) return row;
    return null;
  }

  /** Round bore of dia d with a DIN 6885 keyway slot (pointing +X). */
  function boreKeyed(d, key) {
    key = key || keywayForShaft(d);
    if (!key) return { loop: boreRound(d), key: null };
    const r = d / 2;
    const hb = key.b / 2;
    const yTop = hb, yBot = -hb;
    const xOut = r + key.t2;
    // circle from the keyway top corner CCW around to the bottom corner
    const aTop = Math.asin(Math.min(1, yTop / r));
    const aBot = -aTop;
    const pts = arc(0, 0, r, aTop, TAU + aBot);
    pts.push([xOut, yBot], [xOut, yTop]);
    return { loop: { pts: dedupe(pts), isHole: true }, key };
  }

  /** Bolt-circle holes: n holes of dia d on circle dia bcd. */
  function boltCircle(n, d, bcd, startAngleDeg) {
    const loops = [];
    const a0 = ((startAngleDeg || 0) * Math.PI) / 180;
    for (let i = 0; i < n; i++) {
      const a = a0 + (TAU * i) / n;
      const cx = (bcd / 2) * Math.cos(a), cy = (bcd / 2) * Math.sin(a);
      loops.push({ pts: circle(cx, cy, d / 2, 40), isHole: true, circleHint: { cx, cy, r: d / 2 } });
    }
    return loops;
  }

  /** Bounding box of a set of loops: {minX,minY,maxX,maxY,w,h}. */
  function bbox(loops) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const loop of loops) {
      for (const p of loop.pts) {
        if (p[0] < minX) minX = p[0];
        if (p[1] < minY) minY = p[1];
        if (p[0] > maxX) maxX = p[0];
        if (p[1] > maxY) maxY = p[1];
      }
    }
    return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
  }

  const api = {
    TAU, rot, rotPts, translatePts, mirrorY, dist,
    arc, circle,
    signedArea, ensureWinding, dedupe, rdp,
    segIntersect, polylineIntersect, closestApproach, selfIntersects, pointPolylineDist,
    offsetClosed, offsetLoopForKerf,
    boreRound, boreD, borePolygon, boreKeyed, keywayForShaft, DIN6885, boltCircle,
    bbox,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (global.GearForge = global.GearForge || {}).geometry = api;
})(typeof self !== 'undefined' ? self : this);
