/* app.js — GearForge UI: forms, live preview, mesh animation, exports. */
(function () {
  'use strict';

  const GF = window.GearForge;
  const { geometry: GEO, involute: INV, pulley: PUL, spline: SPL, exporters: EXP } = GF;

  const $ = sel => document.querySelector(sel);

  // ------------------------------------------------------------ form spec

  const F = {
    num: (key, label, def, opts) => Object.assign({ kind: 'num', key, label, def }, opts),
    sel: (key, label, def, choices) => ({ kind: 'sel', key, label, def, choices }),
    chk: (key, label, def) => ({ kind: 'chk', key, label, def }),
    txt: (key, label, def) => ({ kind: 'txt', key, label, def }),
  };

  const PA_CHOICES = [['20', '20° (standard)'], ['14.5', '14.5°'], ['25', '25°']];

  const BORE_GROUP = {
    legend: 'Bore & features',
    fields: [
      F.sel('boreType', 'Bore', 'round', [['none', 'none'], ['round', 'round'], ['d', 'D-flat'],
        ['hex', 'hex (across flats)'], ['square', 'square'], ['key', 'round + DIN 6885 keyway']]),
      F.num('boreD', 'Bore Ø / across-flats', 5, { min: 0.5, step: 0.1, hint: 'mm' }),
      F.num('flatDepth', 'D-flat depth', 0.5, { min: 0.05, step: 0.05, hint: 'mm, D-flat only' }),
      F.num('bcN', 'Bolt holes (0 = none)', 0, { min: 0, max: 24, step: 1 }),
      F.num('bcD', 'Bolt hole Ø', 3.2, { min: 0.5, step: 0.1 }),
      F.num('bcBCD', 'Bolt circle Ø', 20, { min: 1, step: 0.5 }),
    ],
  };

  const MFG_GROUP = {
    legend: 'Manufacturing',
    fields: [
      F.num('kerf', 'Laser kerf', 0.15, { min: 0, max: 0.6, step: 0.01, hint: 'mm — beam width, compensated on export' }),
      F.chk('engrave', 'Engrave pitch circle + label', true),
      F.txt('label', 'Label (blank = auto)', ''),
    ],
  };

  const TYPES = {
    spur: {
      name: 'Spur gear',
      groups: [
        {
          legend: 'Gear',
          fields: [
            F.num('m', 'Module', 2, { min: 0.3, max: 20, step: 0.1, hint: 'mm — tooth size; pitch Ø = m·z' }),
            F.num('z', 'Teeth', 20, { min: 4, max: 250, step: 1 }),
            F.sel('alphaDeg', 'Pressure angle', '20', PA_CHOICES),
            F.num('x', 'Profile shift x', 0, { min: -1, max: 1.5, step: 0.05, hint: 'avoids undercut on small z' }),
            F.num('backlash', 'Backlash allowance', 0.05, { min: 0, max: 1, step: 0.01, hint: 'mm circular tooth thinning' }),
          ],
        },
        {
          legend: 'Mating gear (pair mode)',
          fields: [
            F.num('z2', 'Teeth', 40, { min: 4, max: 250, step: 1 }),
            F.num('x2', 'Profile shift x₂', 0, { min: -1, max: 1.5, step: 0.05 }),
          ],
        },
        BORE_GROUP, MFG_GROUP,
      ],
      build(v) {
        return INV.buildExternalGear(
          { m: v.m, z: v.z, alphaDeg: +v.alphaDeg, x: v.x, backlash: v.backlash },
          { bore: boreOf(v), boltCircle: bcOf(v), kerf: v.kerf, label: v.label || undefined });
      },
      pair: true,
    },
    internal: {
      name: 'Internal / ring gear',
      groups: [
        {
          legend: 'Ring gear',
          fields: [
            F.num('m', 'Module', 2, { min: 0.3, max: 20, step: 0.1 }),
            F.num('z', 'Teeth', 36, { min: 12, max: 300, step: 1 }),
            F.sel('alphaDeg', 'Pressure angle', '20', PA_CHOICES),
            F.num('x', 'Profile shift x', 0, { min: -1, max: 1.5, step: 0.05 }),
            F.num('backlash', 'Backlash allowance', 0.05, { min: 0, max: 1, step: 0.01 }),
            F.num('rim', 'Rim thickness', 8, { min: 1, step: 0.5, hint: 'mm beyond root circle' }),
          ],
        },
        {
          legend: 'Bolt circle',
          fields: [
            F.num('bcN', 'Bolt holes (0 = none)', 0, { min: 0, max: 24, step: 1 }),
            F.num('bcD', 'Bolt hole Ø', 3.2, { min: 0.5, step: 0.1 }),
            F.num('bcBCD', 'Bolt circle Ø', 90, { min: 1, step: 0.5 }),
          ],
        },
        MFG_GROUP,
      ],
      build(v) {
        return INV.buildInternalGear(
          { m: v.m, z: v.z, alphaDeg: +v.alphaDeg, x: v.x, backlash: v.backlash },
          { rim: v.rim, boltCircle: bcOf(v), kerf: v.kerf, label: v.label || undefined });
      },
    },
    rack: {
      name: 'Rack',
      groups: [
        {
          legend: 'Rack',
          fields: [
            F.num('m', 'Module', 2, { min: 0.3, max: 20, step: 0.1 }),
            F.num('teeth', 'Teeth', 12, { min: 2, max: 200, step: 1 }),
            F.sel('alphaDeg', 'Pressure angle', '20', PA_CHOICES),
            F.num('backlash', 'Backlash allowance', 0.05, { min: 0, max: 1, step: 0.01 }),
            F.num('height', 'Blank below root', 6, { min: 1, step: 0.5, hint: 'mm body height' }),
            F.num('holesN', 'Mounting holes (0 = none)', 0, { min: 0, max: 20, step: 1 }),
            F.num('holesD', 'Hole Ø', 3.2, { min: 0.5, step: 0.1 }),
          ],
        },
        MFG_GROUP,
      ],
      build(v) {
        return INV.buildRack(
          { m: v.m, alphaDeg: +v.alphaDeg, teeth: v.teeth, backlash: v.backlash },
          { height: v.height, holes: v.holesN > 0 ? { n: v.holesN, d: v.holesD } : null, kerf: v.kerf });
      },
    },
    pulley: {
      name: 'Timing pulley',
      groups: [
        {
          legend: 'Pulley',
          fields: [
            F.sel('profile', 'Belt profile', 'GT2_2mm', PUL.ORDER.map(k => [k, PUL.LABELS[k]])),
            F.num('teeth', 'Teeth', 20, { min: 8, max: 200, step: 1 }),
            F.num('clearanceW', 'Belt fit clearance', 0.2, { min: 0, max: 0.6, step: 0.05, hint: 'mm groove widening for easy fit' }),
          ],
        },
        BORE_GROUP, MFG_GROUP,
      ],
      build(v) {
        return PUL.buildPulley({
          profile: v.profile, teeth: v.teeth, clearanceW: v.clearanceW,
          bore: boreOf(v), boltCircle: bcOf(v), kerf: v.kerf, label: v.label || undefined,
        });
      },
    },
    splineShaft: {
      name: 'Spline shaft',
      groups: [
        {
          legend: 'Spline (ISO 4156, 30° PA)',
          fields: [
            F.num('m', 'Module', 1, { min: 0.25, max: 10, step: 0.25 }),
            F.num('z', 'Teeth', 20, { min: 10, max: 100, step: 1 }),
            F.sel('rootType', 'Root form', 'flat', [['flat', 'flat root'], ['fillet', 'fillet root']]),
            F.num('clearance', 'Side-fit clearance', 0.04, { min: 0, max: 0.4, step: 0.01, hint: 'mm tooth thinning vs. basic' }),
            F.num('boreD2', 'Center bore Ø (0 = none)', 0, { min: 0, step: 0.1 }),
          ],
        },
        MFG_GROUP,
      ],
      build(v) {
        return SPL.buildSplineShaft({
          m: v.m, z: v.z, rootType: v.rootType, clearance: v.clearance,
          bore: v.boreD2 > 0 ? { type: 'round', d: v.boreD2 } : null,
          kerf: v.kerf, label: v.label || undefined,
        });
      },
    },
    splineHub: {
      name: 'Spline hub',
      groups: [
        {
          legend: 'Spline (ISO 4156, 30° PA)',
          fields: [
            F.num('m', 'Module', 1, { min: 0.25, max: 10, step: 0.25 }),
            F.num('z', 'Teeth', 20, { min: 10, max: 100, step: 1 }),
            F.sel('rootType', 'Root form', 'flat', [['flat', 'flat root'], ['fillet', 'fillet root']]),
            F.num('od', 'Hub outer Ø (0 = auto)', 0, { min: 0, step: 0.5 }),
            F.num('bcN', 'Bolt holes (0 = none)', 0, { min: 0, max: 24, step: 1 }),
            F.num('bcD', 'Bolt hole Ø', 3.2, { min: 0.5, step: 0.1 }),
            F.num('bcBCD', 'Bolt circle Ø', 32, { min: 1, step: 0.5 }),
          ],
        },
        MFG_GROUP,
      ],
      build(v) {
        return SPL.buildSplineHub({
          m: v.m, z: v.z, rootType: v.rootType, od: v.od > 0 ? v.od : undefined,
          boltCircle: bcOf(v), kerf: v.kerf, label: v.label || undefined,
        });
      },
    },
  };

  const PRESETS = [
    { name: 'GT2 20T idler, 5 mm bore', type: 'pulley', set: { profile: 'GT2_2mm', teeth: 20, boreType: 'round', boreD: 5 } },
    { name: 'GT2 60T, 8 mm bore', type: 'pulley', set: { profile: 'GT2_2mm', teeth: 60, boreType: 'round', boreD: 8 } },
    { name: 'HTD 5M 36T, 12 mm keyed', type: 'pulley', set: { profile: 'HTD_5mm', teeth: 36, boreType: 'key', boreD: 12 } },
    { name: 'Gear m2 z20 : z40 pair', type: 'spur', set: { m: 2, z: 20, x: 0, z2: 40, x2: 0, boreType: 'round', boreD: 8 }, pair: true },
    { name: 'Pinion m2 z12 (shifted x=0.3)', type: 'spur', set: { m: 2, z: 12, x: 0.3, z2: 36, x2: 0 } },
    { name: 'Ring gear m2 z60', type: 'internal', set: { m: 2, z: 60 } },
    { name: 'Rack m2, 12 teeth', type: 'rack', set: { m: 2, teeth: 12 } },
    { name: 'Spline 20×1 shaft + hub', type: 'splineShaft', set: { m: 1, z: 20 } },
  ];

  function boreOf(v) {
    if (!v.boreType || v.boreType === 'none') return null;
    return { type: v.boreType, d: v.boreD, af: v.boreD, flatDepth: v.flatDepth };
  }
  function bcOf(v) {
    return v.bcN > 0 ? { n: v.bcN, d: v.bcD, bcd: v.bcBCD } : null;
  }

  // -------------------------------------------------------------- state

  let curType = 'spur';
  let curPart = null;
  let curMesh = null;      // pair data when pair mode on
  let matePart = null;
  let view = { cx: 0, cy: 0, scale: 6 }; // mm -> px
  let anim = { on: false, t0: 0, raf: 0 };

  // ---------------------------------------------------------- build form

  function renderTabs() {
    const nav = $('#typeTabs');
    nav.innerHTML = '';
    for (const [key, t] of Object.entries(TYPES)) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = t.name;
      b.className = key === curType ? 'active' : '';
      b.onclick = () => { curType = key; renderTabs(); renderForm(); rebuild(true); };
      nav.appendChild(b);
    }
  }

  function fieldRow(f) {
    const row = document.createElement('div');
    row.className = 'row';
    const lab = document.createElement('label');
    lab.textContent = f.label;
    if (f.hint) {
      const s = document.createElement('small');
      s.textContent = f.hint;
      lab.appendChild(s);
    }
    let input;
    if (f.kind === 'sel') {
      input = document.createElement('select');
      for (const [val, txt] of f.choices) {
        const o = document.createElement('option');
        o.value = val; o.textContent = txt;
        input.appendChild(o);
      }
      input.value = f.def;
    } else if (f.kind === 'chk') {
      input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = !!f.def;
    } else if (f.kind === 'txt') {
      input = document.createElement('input');
      input.type = 'text';
      input.value = f.def;
    } else {
      input = document.createElement('input');
      input.type = 'number';
      input.value = f.def;
      if (f.min !== undefined) input.min = f.min;
      if (f.max !== undefined) input.max = f.max;
      if (f.step !== undefined) input.step = f.step;
    }
    input.id = 'f_' + f.key;
    input.addEventListener('input', () => rebuild(false));
    lab.htmlFor = input.id;
    row.append(lab, input);
    return row;
  }

  function renderForm() {
    const form = $('#paramForm');
    form.innerHTML = '';
    for (const g of TYPES[curType].groups) {
      const fs = document.createElement('fieldset');
      const lg = document.createElement('legend');
      lg.textContent = g.legend;
      fs.appendChild(lg);
      for (const f of g.fields) fs.appendChild(fieldRow(f));
      form.appendChild(fs);
    }
    $('#pairCtl').classList.toggle('hidden', !TYPES[curType].pair);
    $('#animCtl').classList.toggle('hidden', !TYPES[curType].pair);
  }

  function formValues() {
    const v = {};
    for (const g of TYPES[curType].groups) {
      for (const f of g.fields) {
        const el = document.getElementById('f_' + f.key);
        if (!el) continue;
        if (f.kind === 'chk') v[f.key] = el.checked;
        else if (f.kind === 'sel' || f.kind === 'txt') v[f.key] = el.value;
        else {
          let n = parseFloat(el.value);
          if (!isFinite(n)) n = f.def;
          if (f.min !== undefined) n = Math.max(f.min, n);
          if (f.max !== undefined) n = Math.min(f.max, n);
          v[f.key] = n;
        }
      }
    }
    return v;
  }

  // ------------------------------------------------------------- rebuild

  function rebuild(refit) {
    const v = formValues();
    const errBox = $('#errBox');
    try {
      curPart = TYPES[curType].build(v);
      errBox.classList.add('hidden');
    } catch (e) {
      curPart = null;
      errBox.textContent = '✗ ' + e.message;
      errBox.classList.remove('hidden');
      $('#warnings').innerHTML = '';
      return;
    }

    curMesh = null; matePart = null;
    if (curType === 'spur' && $('#chkPair').checked) {
      try {
        const p1 = INV.normalizeParams({ m: v.m, z: v.z, alphaDeg: +v.alphaDeg, x: v.x, backlash: v.backlash });
        const p2 = INV.normalizeParams({ m: v.m, z: v.z2, alphaDeg: +v.alphaDeg, x: v.x2, backlash: v.backlash });
        curMesh = INV.meshExternal(p1, p2);
        matePart = INV.buildExternalGear(
          { m: v.m, z: v.z2, alphaDeg: +v.alphaDeg, x: v.x2, backlash: v.backlash },
          { label: '' });
        if (curMesh.epsAlpha < 1.0) {
          curPart.warnings.push({ level: 'error', msg: `Contact ratio εα=${curMesh.epsAlpha.toFixed(2)} < 1.0 — the pair will not transmit motion continuously.` });
        } else if (curMesh.epsAlpha < 1.2) {
          curPart.warnings.push({ level: 'warn', msg: `Low contact ratio εα=${curMesh.epsAlpha.toFixed(2)} (aim ≥ 1.2).` });
        }
      } catch (e) {
        curPart.warnings.push({ level: 'error', msg: 'Pair: ' + e.message });
      }
    }

    renderWarnings();
    renderReport(v);
    if (refit) fitView();
    renderPreview();
  }

  function renderWarnings() {
    const box = $('#warnings');
    box.innerHTML = '';
    if (!curPart) return;
    for (const w of curPart.warnings) {
      const d = document.createElement('div');
      d.className = 'warnItem ' + w.level;
      d.textContent = (w.level === 'error' ? '✗ ' : w.level === 'warn' ? '⚠ ' : 'ℹ ') + w.msg;
      box.appendChild(d);
    }
  }

  // ------------------------------------------------------------- report

  function renderReport(v) {
    const tbl = $('#reportTable');
    tbl.innerHTML = '';
    if (!curPart) return;
    const add = (k, val) => {
      const tr = document.createElement('tr');
      const td1 = document.createElement('td'), td2 = document.createElement('td');
      td1.textContent = k; td2.textContent = val;
      tr.append(td1, td2);
      tbl.appendChild(tr);
    };
    const sect = name => {
      const tr = document.createElement('tr');
      tr.className = 'section';
      const td = document.createElement('td');
      td.colSpan = 2; td.textContent = name;
      tr.appendChild(td);
      tbl.appendChild(tr);
    };
    sect(curPart.data.type);
    for (const [k, val] of Object.entries(curPart.data)) {
      if (k === 'type') continue;
      const label = k.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase());
      add(label, typeof val === 'number' ? +val.toFixed(4) : val);
    }
    if (v.kerf) add('Kerf compensation (on export)', `beam Ø ${v.kerf} mm → path offset ${(v.kerf / 2).toFixed(3)} mm`);
    if (curMesh) {
      sect(`Mesh: z${v.z} × z${v.z2}`);
      add('Ratio', `1 : ${(v.z2 / v.z).toFixed(4)}`);
      add('Reference center distance a₀', +curMesh.a0.toFixed(4) + ' mm');
      add('Working center distance a_w', +curMesh.aw.toFixed(4) + ' mm');
      add('Working pressure angle α_w', (curMesh.alphaW * 180 / Math.PI).toFixed(3) + '°');
      add('Transverse contact ratio εα', +curMesh.epsAlpha.toFixed(3));
    }
  }

  // ------------------------------------------------------------ preview

  function partBounds() {
    const loops = [...(curPart ? curPart.cut : [])];
    if (matePart && curMesh) {
      for (const l of matePart.cut) {
        loops.push({ pts: l.pts.map(q => [q[0] + curMesh.aw, q[1]]) });
      }
    }
    return loops.length ? GEO.bbox(loops) : { minX: -10, minY: -10, maxX: 10, maxY: 10, w: 20, h: 20 };
  }

  function fitView() {
    if (!curPart) return;
    const bb = partBounds();
    const vp = $('#viewport').getBoundingClientRect();
    const scale = Math.min(vp.width / (bb.w * 1.15 || 1), vp.height / (bb.h * 1.15 || 1));
    view = { cx: (bb.minX + bb.maxX) / 2, cy: (bb.minY + bb.maxY) / 2, scale: isFinite(scale) && scale > 0 ? scale : 6 };
  }

  function pathD(pts) {
    let s = `M${pts[0][0].toFixed(3)},${(-pts[0][1]).toFixed(3)}`;
    for (let i = 1; i < pts.length; i++) s += `L${pts[i][0].toFixed(3)},${(-pts[i][1]).toFixed(3)}`;
    return s + 'Z';
  }

  function engraveEl(e, sw) {
    const NS = 'http://www.w3.org/2000/svg';
    if (e.kind === 'circle') {
      const c = document.createElementNS(NS, 'circle');
      c.setAttribute('cx', e.cx); c.setAttribute('cy', -e.cy); c.setAttribute('r', e.r);
      c.setAttribute('class', 'engravePath');
      return c;
    }
    if (e.kind === 'line') {
      const l = document.createElementNS(NS, 'line');
      l.setAttribute('x1', e.pts[0][0]); l.setAttribute('y1', -e.pts[0][1]);
      l.setAttribute('x2', e.pts[1][0]); l.setAttribute('y2', -e.pts[1][1]);
      l.setAttribute('class', 'engravePath');
      return l;
    }
    if (e.kind === 'text') {
      const t = document.createElementNS(NS, 'text');
      t.setAttribute('x', e.x); t.setAttribute('y', -e.y);
      t.setAttribute('font-size', e.h);
      t.setAttribute('text-anchor', 'middle');
      t.setAttribute('class', 'engraveText');
      t.textContent = e.text;
      return t;
    }
    void sw;
    return null;
  }

  function partGroup(part, cls) {
    const NS = 'http://www.w3.org/2000/svg';
    const g = document.createElementNS(NS, 'g');
    if (cls) g.setAttribute('class', cls);
    for (const loop of part.cut) {
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('d', pathD(loop.pts));
      p.setAttribute('class', 'cutPath' + (loop.isHole ? ' hole' : ''));
      g.appendChild(p);
    }
    if ($('#f_engrave') && $('#f_engrave').checked && part.engrave) {
      for (const e of part.engrave) {
        const el = engraveEl(e);
        if (el) g.appendChild(el);
      }
    }
    return g;
  }

  function renderPreview(phase) {
    const svg = $('#preview');
    const vp = $('#viewport').getBoundingClientRect();
    svg.innerHTML = '';
    if (!curPart) return;
    const w = vp.width, h = vp.height;
    const s = view.scale;
    svg.setAttribute('viewBox',
      `${view.cx - w / (2 * s)} ${-view.cy - h / (2 * s)} ${w / s} ${h / s}`);
    svg.style.setProperty('--sw', (1.2 / s).toFixed(4));

    const g1 = partGroup(curPart, 'main');
    if (curMesh && matePart) {
      const th1 = phase || 0;
      g1.setAttribute('transform', `rotate(${(-th1 * 180 / Math.PI).toFixed(4)})`);
      const z1 = curMesh.g1 ? curPart.data.teeth : 1;
      const z2 = matePart.data.teeth;
      // phase: gear 2 space centered toward gear 1 at th1 = 0
      const beta2 = Math.PI - Math.PI / z2;
      const th2 = beta2 - th1 * (z1 / z2);
      const g2 = partGroup(matePart, 'mate');
      g2.setAttribute('transform',
        `translate(${curMesh.aw.toFixed(4)},0) rotate(${(-th2 * 180 / Math.PI).toFixed(4)})`);
      svg.append(g1, g2);
    } else {
      svg.appendChild(g1);
    }
    $('#zoomInfo').textContent = `${s.toFixed(1)} px/mm`;
  }

  // ---------------------------------------------------------- animation

  function tick(ts) {
    if (!anim.on) return;
    if (!anim.t0) anim.t0 = ts;
    const th1 = ((ts - anim.t0) / 1000) * 0.35; // rad/s
    renderPreview(th1);
    anim.raf = requestAnimationFrame(tick);
  }

  function setAnim(on) {
    anim.on = on;
    if (on) { anim.t0 = 0; anim.raf = requestAnimationFrame(tick); }
    else { cancelAnimationFrame(anim.raf); renderPreview(); }
  }

  // ------------------------------------------------------------ pan/zoom

  function setupPanZoom() {
    const svg = $('#preview');
    let drag = null;
    svg.addEventListener('pointerdown', e => {
      drag = { x: e.clientX, y: e.clientY, cx: view.cx, cy: view.cy };
      svg.setPointerCapture(e.pointerId);
    });
    svg.addEventListener('pointermove', e => {
      if (!drag) return;
      view.cx = drag.cx - (e.clientX - drag.x) / view.scale;
      view.cy = drag.cy + (e.clientY - drag.y) / view.scale;
      renderPreview();
    });
    svg.addEventListener('pointerup', () => { drag = null; });
    svg.addEventListener('wheel', e => {
      e.preventDefault();
      const f = Math.exp(-e.deltaY * 0.0015);
      view.scale = Math.min(400, Math.max(0.5, view.scale * f));
      renderPreview();
    }, { passive: false });
  }

  // ------------------------------------------------------------ exports

  function download(name, mime, content) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], { type: mime }));
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  function baseName() {
    const d = curPart.data;
    const t = curType === 'pulley'
      ? `pulley_${$('#f_profile').value}_${d.teeth}T`
      : curType === 'spur' ? `gear_m${d.module}_z${d.teeth}`
      : curType === 'internal' ? `ring_m${d.module}_z${d.teeth}`
      : curType === 'rack' ? `rack_m${d.module}_${d.teeth}T`
      : curType === 'splineShaft' ? `spline_ext_${d.teeth}x${d.module}`
      : `spline_hub_${d.teeth}x${d.module}`;
    return `gearforge_${t}`;
  }

  function exportOpts() {
    const v = formValues();
    return { kerf: v.kerf || 0, engrave: v.engrave !== false, label: true };
  }

  // ------------------------------------------------------------ presets

  function renderPresets() {
    const sel = $('#presetSel');
    PRESETS.forEach((p, i) => {
      const o = document.createElement('option');
      o.value = String(i);
      o.textContent = p.name;
      sel.appendChild(o);
    });
    sel.onchange = () => {
      const p = PRESETS[+sel.value];
      if (!p) return;
      curType = p.type;
      renderTabs(); renderForm();
      for (const [k, val] of Object.entries(p.set)) {
        const el = document.getElementById('f_' + k);
        if (el) {
          if (el.type === 'checkbox') el.checked = !!val;
          else el.value = val;
        }
      }
      if (p.pair && TYPES[curType].pair) $('#chkPair').checked = true;
      rebuild(true);
    };
  }

  // -------------------------------------------------------------- init

  function init() {
    // browsers restore form-control state across reloads; start deterministic
    $('#chkPair').checked = false;
    $('#chkAnim').checked = false;
    renderTabs();
    renderForm();
    renderPresets();
    setupPanZoom();
    $('#btnFit').onclick = () => { fitView(); renderPreview(); };
    $('#chkPair').onchange = () => { rebuild(true); if (!$('#chkPair').checked) { $('#chkAnim').checked = false; setAnim(false); } };
    $('#chkAnim').onchange = e => setAnim(e.target.checked && $('#chkPair').checked);
    $('#btnSVG').onclick = () => curPart && download(baseName() + '.svg', 'image/svg+xml', EXP.toSVG(curPart, exportOpts()));
    $('#btnDXF').onclick = () => curPart && download(baseName() + '.dxf', 'application/dxf', EXP.toDXF(curPart, exportOpts()));
    $('#btnReport').onclick = () => curPart && download(baseName() + '.txt', 'text/plain', EXP.toReport(curPart, exportOpts()));
    window.addEventListener('resize', () => renderPreview());
    rebuild(true);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
