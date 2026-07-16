/*
 * pulley.js — 2-D timing-belt pulley generation for GearForge.
 *
 * Groove geometry: the pulley disc is the outer circle of
 *   OD = z·p/π − 2·PLD   (PLD = pitch line differential of the belt)
 * with z belt-tooth-shaped grooves subtracted around the circumference.
 * The groove point sets model the BELT tooth (so a "belt fit clearance"
 * enlarges the groove) and are the industry-standard SDP/SI-derived
 * outlines popularized by droftarts' parametric pulley (Thingiverse
 * thing:16627) — the profiles behind most open-source printed pulleys.
 * T2.5/T5/AT5 use that project's curve-fit OD: ((c·z^d)/(b+z^d))·z.
 *
 * Each groove is scaled by the fit clearances, placed with its mouth on
 * the chord at distance sqrt((OD/2)² − (w/2)²) from center, and the
 * outline walks: circle arc → groove → circle arc → … (closed, CCW).
 */
(function (global) {
  'use strict';

  const GEO = (typeof module !== 'undefined' && module.exports)
    ? require('./geometry.js')
    : global.GearForge.geometry;

  // ---------------------------------------------------------------- data
  // pitch (mm); pld = pitch line differential; curvefit = [b,c,d] for OD;
  // depth/width = nominal belt tooth extents (mm); points = belt tooth
  // outline, mouth on y=0, tip toward +y, ordered +x side → −x side.
  const PROFILES = {"MXL":{"pitch":2.032,"pld":0.254,"depth":0.508,"width":1.321,"points":[[-0.660421,-0.5],[-0.660421,0],[-0.621898,0.006033],[-0.587714,0.023037],[-0.560056,0.049424],[-0.541182,0.083609],[-0.417357,0.424392],[-0.398413,0.458752],[-0.370649,0.48514],[-0.336324,0.502074],[-0.297744,0.508035],[0.297744,0.508035],[0.336268,0.502074],[0.370452,0.48514],[0.39811,0.458752],[0.416983,0.424392],[0.540808,0.083609],[0.559752,0.049424],[0.587516,0.023037],[0.621841,0.006033],[0.660421,0],[0.660421,-0.5]]},"40DP":{"pitch":2.07264,"pld":0.1778,"depth":0.457,"width":1.226,"points":[[-0.612775,-0.5],[-0.612775,0],[-0.574719,0.010187],[-0.546453,0.0381],[-0.355953,0.3683],[-0.327604,0.405408],[-0.291086,0.433388],[-0.248548,0.451049],[-0.202142,0.4572],[0.202494,0.4572],[0.248653,0.451049],[0.291042,0.433388],[0.327609,0.405408],[0.356306,0.3683],[0.546806,0.0381],[0.574499,0.010187],[0.612775,0],[0.612775,-0.5]]},"XL":{"pitch":5.08,"pld":0.254,"depth":1.27,"width":3.051,"points":[[-1.525411,-1],[-1.525411,0],[-1.41777,0.015495],[-1.320712,0.059664],[-1.239661,0.129034],[-1.180042,0.220133],[-0.793044,1.050219],[-0.733574,1.141021],[-0.652507,1.210425],[-0.555366,1.254759],[-0.447675,1.270353],[0.447675,1.270353],[0.555366,1.254759],[0.652507,1.210425],[0.733574,1.141021],[0.793044,1.050219],[1.180042,0.220133],[1.239711,0.129034],[1.320844,0.059664],[1.417919,0.015495],[1.525411,0],[1.525411,-1]]},"H":{"pitch":9.525,"pld":0.381,"depth":1.905,"width":5.359,"points":[[-2.6797,-1],[-2.6797,0],[-2.600907,0.006138],[-2.525342,0.024024],[-2.45412,0.052881],[-2.388351,0.091909],[-2.329145,0.140328],[-2.277614,0.197358],[-2.234875,0.262205],[-2.202032,0.334091],[-1.75224,1.57093],[-1.719538,1.642815],[-1.676883,1.707663],[-1.62542,1.764693],[-1.566256,1.813112],[-1.500512,1.85214],[-1.4293,1.880997],[-1.353742,1.898883],[-1.274949,1.905021],[1.275281,1.905021],[1.354056,1.898883],[1.429576,1.880997],[1.500731,1.85214],[1.566411,1.813112],[1.625508,1.764693],[1.676919,1.707663],[1.719531,1.642815],[1.752233,1.57093],[2.20273,0.334091],[2.235433,0.262205],[2.278045,0.197358],[2.329455,0.140328],[2.388553,0.091909],[2.454233,0.052881],[2.525384,0.024024],[2.600904,0.006138],[2.6797,0],[2.6797,-1]]},"T2_5":{"curvefit":[0.7467,0.796,1.026],"pitch":2.5,"depth":0.7,"width":1.678,"points":[[-0.839258,-0.5],[-0.839258,0],[-0.770246,0.021652],[-0.726369,0.079022],[-0.529167,0.620889],[-0.485025,0.67826],[-0.416278,0.699911],[0.416278,0.699911],[0.484849,0.67826],[0.528814,0.620889],[0.726369,0.079022],[0.770114,0.021652],[0.839258,0],[0.839258,-0.5]]},"T5":{"curvefit":[0.6523,1.591,1.064],"pitch":5,"depth":1.19,"width":3.264,"points":[[-1.632126,-0.5],[-1.632126,0],[-1.568549,0.004939],[-1.507539,0.019367],[-1.450023,0.042686],[-1.396912,0.074224],[-1.349125,0.113379],[-1.307581,0.159508],[-1.273186,0.211991],[-1.246868,0.270192],[-1.009802,0.920362],[-0.983414,0.978433],[-0.949018,1.030788],[-0.907524,1.076798],[-0.859829,1.115847],[-0.80682,1.147314],[-0.749402,1.170562],[-0.688471,1.184956],[-0.624921,1.189895],[0.624971,1.189895],[0.688622,1.184956],[0.749607,1.170562],[0.807043,1.147314],[0.860055,1.115847],[0.907754,1.076798],[0.949269,1.030788],[0.9837,0.978433],[1.010193,0.920362],[1.246907,0.270192],[1.273295,0.211991],[1.307726,0.159508],[1.349276,0.113379],[1.397039,0.074224],[1.450111,0.042686],[1.507589,0.019367],[1.568563,0.004939],[1.632126,0],[1.632126,-0.5]]},"T10":{"pitch":10,"pld":0.93,"depth":2.5,"width":6.13,"points":[[-3.06511,-1],[-3.06511,0],[-2.971998,0.007239],[-2.882718,0.028344],[-2.79859,0.062396],[-2.720931,0.108479],[-2.651061,0.165675],[-2.590298,0.233065],[-2.539962,0.309732],[-2.501371,0.394759],[-1.879071,2.105025],[-1.840363,2.190052],[-1.789939,2.266719],[-1.729114,2.334109],[-1.659202,2.391304],[-1.581518,2.437387],[-1.497376,2.47144],[-1.408092,2.492545],[-1.314979,2.499784],[1.314979,2.499784],[1.408091,2.492545],[1.497371,2.47144],[1.581499,2.437387],[1.659158,2.391304],[1.729028,2.334109],[1.789791,2.266719],[1.840127,2.190052],[1.878718,2.105025],[2.501018,0.394759],[2.539726,0.309732],[2.59015,0.233065],[2.650975,0.165675],[2.720887,0.108479],[2.798571,0.062396],[2.882713,0.028344],[2.971997,0.007239],[3.06511,0],[3.06511,-1]]},"AT5":{"curvefit":[0.6523,1.591,1.064],"pitch":5,"depth":1.19,"width":4.268,"points":[[-2.134129,-0.75],[-2.134129,0],[-2.058023,0.005488],[-1.984595,0.021547],[-1.914806,0.047569],[-1.849614,0.082947],[-1.789978,0.127073],[-1.736857,0.179338],[-1.691211,0.239136],[-1.653999,0.305859],[-1.349199,0.959203],[-1.286933,1.054635],[-1.201914,1.127346],[-1.099961,1.173664],[-0.986896,1.18992],[0.986543,1.18992],[1.099614,1.173664],[1.201605,1.127346],[1.286729,1.054635],[1.349199,0.959203],[1.653646,0.305859],[1.690859,0.239136],[1.73651,0.179338],[1.789644,0.127073],[1.849305,0.082947],[1.914539,0.047569],[1.984392,0.021547],[2.057906,0.005488],[2.134129,0],[2.134129,-0.75]]},"HTD_3mm":{"pitch":3,"pld":0.381,"depth":1.289,"width":2.27,"points":[[-1.135062,-0.5],[-1.135062,0],[-1.048323,0.015484],[-0.974284,0.058517],[-0.919162,0.123974],[-0.889176,0.206728],[-0.81721,0.579614],[-0.800806,0.653232],[-0.778384,0.72416],[-0.750244,0.792137],[-0.716685,0.856903],[-0.678005,0.918199],[-0.634505,0.975764],[-0.586483,1.029338],[-0.534238,1.078662],[-0.47807,1.123476],[-0.418278,1.16352],[-0.355162,1.198533],[-0.289019,1.228257],[-0.22015,1.25243],[-0.148854,1.270793],[-0.07543,1.283087],[-0.000176,1.28905],[0.075081,1.283145],[0.148515,1.270895],[0.219827,1.252561],[0.288716,1.228406],[0.354879,1.19869],[0.418018,1.163675],[0.477831,1.123623],[0.534017,1.078795],[0.586276,1.029452],[0.634307,0.975857],[0.677809,0.91827],[0.716481,0.856953],[0.750022,0.792167],[0.778133,0.724174],[0.800511,0.653236],[0.816857,0.579614],[0.888471,0.206728],[0.919014,0.123974],[0.974328,0.058517],[1.048362,0.015484],[1.135062,0],[1.135062,-0.5]]},"HTD_5mm":{"pitch":5,"pld":0.5715,"depth":2.199,"width":3.781,"points":[[-1.89036,-0.75],[-1.89036,0],[-1.741168,0.02669],[-1.61387,0.100806],[-1.518984,0.21342],[-1.467026,0.3556],[-1.427162,0.960967],[-1.398568,1.089602],[-1.359437,1.213531],[-1.310296,1.332296],[-1.251672,1.445441],[-1.184092,1.552509],[-1.108081,1.653042],[-1.024167,1.746585],[-0.932877,1.832681],[-0.834736,1.910872],[-0.730271,1.980701],[-0.62001,2.041713],[-0.504478,2.09345],[-0.384202,2.135455],[-0.259708,2.167271],[-0.131524,2.188443],[-0.000176,2.198511],[0.131296,2.188504],[0.259588,2.167387],[0.384174,2.135616],[0.504527,2.093648],[0.620123,2.04194],[0.730433,1.980949],[0.834934,1.911132],[0.933097,1.832945],[1.024398,1.746846],[1.108311,1.653291],[1.184308,1.552736],[1.251865,1.445639],[1.310455,1.332457],[1.359552,1.213647],[1.39863,1.089664],[1.427162,0.960967],[1.467026,0.3556],[1.518984,0.21342],[1.61387,0.100806],[1.741168,0.02669],[1.89036,0],[1.89036,-0.75]]},"HTD_8mm":{"pitch":8,"pld":0.6858,"depth":3.607,"width":6.603,"points":[[-3.301471,-1],[-3.301471,0],[-3.16611,0.012093],[-3.038062,0.047068],[-2.919646,0.10297],[-2.813182,0.177844],[-2.720989,0.269734],[-2.645387,0.376684],[-2.588694,0.496739],[-2.553229,0.627944],[-2.460801,1.470025],[-2.411413,1.691917],[-2.343887,1.905691],[-2.259126,2.110563],[-2.158035,2.30575],[-2.041518,2.490467],[-1.910478,2.66393],[-1.76582,2.825356],[-1.608446,2.973961],[-1.439261,3.10896],[-1.259169,3.22957],[-1.069074,3.335006],[-0.869878,3.424485],[-0.662487,3.497224],[-0.447804,3.552437],[-0.226732,3.589341],[-0.000176,3.607153],[0.226511,3.589461],[0.447712,3.552654],[0.66252,3.497516],[0.870027,3.424833],[1.069329,3.33539],[1.259517,3.229973],[1.439687,3.109367],[1.608931,2.974358],[1.766344,2.825731],[1.911018,2.664271],[2.042047,2.490765],[2.158526,2.305998],[2.259547,2.110755],[2.344204,1.905821],[2.411591,1.691983],[2.460801,1.470025],[2.553229,0.627944],[2.588592,0.496739],[2.645238,0.376684],[2.720834,0.269734],[2.81305,0.177844],[2.919553,0.10297],[3.038012,0.047068],[3.166095,0.012093],[3.301471,0],[3.301471,-1]]},"GT2_2mm":{"pitch":2,"pld":0.254,"depth":0.764,"width":1.494,"points":[[0.747183,-0.5],[0.747183,0],[0.647876,0.037218],[0.598311,0.130528],[0.578556,0.238423],[0.547158,0.343077],[0.504649,0.443762],[0.451556,0.53975],[0.358229,0.636924],[0.2484,0.707276],[0.127259,0.750044],[0,0.76447],[-0.127259,0.750044],[-0.2484,0.707276],[-0.358229,0.636924],[-0.451556,0.53975],[-0.504797,0.443762],[-0.547291,0.343077],[-0.578605,0.238423],[-0.598311,0.130528],[-0.648009,0.037218],[-0.747183,0],[-0.747183,-0.5]]},"GT2_3mm":{"pitch":3,"pld":0.381,"depth":1.169,"width":2.31,"points":[[-1.155171,-0.5],[-1.155171,0],[-1.065317,0.016448],[-0.989057,0.062001],[-0.93297,0.130969],[-0.90364,0.217664],[-0.863705,0.408181],[-0.800056,0.591388],[-0.713587,0.765004],[-0.60519,0.926747],[-0.469751,1.032548],[-0.320719,1.108119],[-0.162625,1.153462],[0,1.168577],[0.162625,1.153462],[0.320719,1.108119],[0.469751,1.032548],[0.60519,0.926747],[0.713587,0.765004],[0.800056,0.591388],[0.863705,0.408181],[0.90364,0.217664],[0.932921,0.130969],[0.988924,0.062001],[1.065168,0.016448],[1.155171,0],[1.155171,-0.5]]},"GT2_5mm":{"pitch":5,"pld":0.5715,"depth":1.969,"width":3.952,"points":[[-1.975908,-0.75],[-1.975908,0],[-1.797959,0.03212],[-1.646634,0.121224],[-1.534534,0.256431],[-1.474258,0.426861],[-1.446911,0.570808],[-1.411774,0.712722],[-1.368964,0.852287],[-1.318597,0.989189],[-1.260788,1.123115],[-1.195654,1.25375],[-1.12331,1.380781],[-1.043869,1.503892],[-0.935264,1.612278],[-0.817959,1.706414],[-0.693181,1.786237],[-0.562151,1.851687],[-0.426095,1.9027],[-0.286235,1.939214],[-0.143795,1.961168],[0,1.9685],[0.143796,1.961168],[0.286235,1.939214],[0.426095,1.9027],[0.562151,1.851687],[0.693181,1.786237],[0.817959,1.706414],[0.935263,1.612278],[1.043869,1.503892],[1.123207,1.380781],[1.195509,1.25375],[1.26065,1.123115],[1.318507,0.989189],[1.368956,0.852287],[1.411872,0.712722],[1.447132,0.570808],[1.474611,0.426861],[1.534583,0.256431],[1.646678,0.121223],[1.798064,0.03212],[1.975908,0],[1.975908,-0.75]]}};

  const ORDER = ['GT2_2mm', 'GT2_3mm', 'GT2_5mm', 'HTD_3mm', 'HTD_5mm', 'HTD_8mm',
    'T2_5', 'T5', 'T10', 'AT5', 'MXL', '40DP', 'XL', 'H'];

  const LABELS = {
    GT2_2mm: 'GT2 (2 mm)', GT2_3mm: 'GT2 / GT3 (3 mm)', GT2_5mm: 'GT2 / GT3 (5 mm)',
    HTD_3mm: 'HTD 3M', HTD_5mm: 'HTD 5M', HTD_8mm: 'HTD 8M',
    T2_5: 'T2.5', T5: 'T5', T10: 'T10', AT5: 'AT5',
    MXL: 'MXL (0.080″)', '40DP': '40 DP', XL: 'XL (0.200″)', H: 'H (0.375″)',
  };

  function outerDiameter(prof, z) {
    if (prof.curvefit) {
      const [b, c, d] = prof.curvefit;
      return ((c * Math.pow(z, d)) / (b + Math.pow(z, d))) * z;
    }
    return (z * prof.pitch) / Math.PI - 2 * prof.pld;
  }

  /**
   * Build a pulley Part.
   * opts: { profile, teeth, clearanceW (belt fit width, mm, default 0.2),
   *         clearanceD (extra depth), bore, boltCircle, kerf, label }
   */
  function buildPulley(opts) {
    const o = Object.assign({ profile: 'GT2_2mm', teeth: 20, clearanceW: 0.2, clearanceD: 0 }, opts || {});
    const prof = PROFILES[o.profile];
    if (!prof) throw new Error(`Unknown belt profile "${o.profile}"`);
    const z = Math.round(o.teeth);
    if (z < 8) throw new Error('Pulleys need at least 8 teeth');

    const warnings = [];
    if (z < 12) warnings.push({ level: 'warn', msg: 'Fewer than 12 teeth: belt wrap and tooth engagement suffer; use only for lightly loaded idlers.' });

    const OD = outerDiameter(prof, z);
    const R = OD / 2;
    const w = prof.width + o.clearanceW;
    const sx = w / prof.width;
    const sy = (prof.depth + o.clearanceD) / prof.depth;
    if (w / 2 >= R * 0.95) throw new Error('Groove wider than the pulley — increase tooth count.');
    const tdfc = Math.sqrt(R * R - (w / 2) * (w / 2));

    // angular half-width of a groove mouth; must fit inside one pitch
    const halfAng = Math.asin((w / 2) / R);
    const pitchAng = (2 * Math.PI) / z;
    if (2 * halfAng >= pitchAng * 0.98) {
      throw new Error('Grooves overlap at this tooth count/clearance — reduce clearance or add teeth.');
    }

    // one groove in "local pulley" coords: tooth centered on angle -90°
    const local = prof.points.map(q => [q[0] * sx, q[1] * sy - tdfc]);

    // clip groove path to inside the circle: walk in order, find the entry
    // and exit crossings of radius R.
    const inside = q => Math.hypot(q[0], q[1]) <= R;
    const crossing = (a, b) => {
      // solve |a + t(b-a)| = R on t in [0,1]
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const A = dx * dx + dy * dy;
      const B = 2 * (a[0] * dx + a[1] * dy);
      const C = a[0] * a[0] + a[1] * a[1] - R * R;
      const disc = B * B - 4 * A * C;
      if (disc < 0) return null;
      for (const s of [-1, 1]) {
        const t = (-B + s * Math.sqrt(disc)) / (2 * A);
        if (t >= -1e-9 && t <= 1 + 1e-9) {
          if ((C > 0) === (s < 0) || true) {
            const p = [a[0] + t * dx, a[1] + t * dy];
            // pick the crossing that transitions inside/outside correctly
            if (inside(a) !== inside(b)) return p;
          }
        }
      }
      return null;
    };

    const path = [];
    let started = false;
    for (let i = 0; i < local.length - 1; i++) {
      const a = local[i], b = local[i + 1];
      const ain = inside(a), bin = inside(b);
      if (!started) {
        if (!ain && bin) { // entering
          const p = crossing(a, b);
          if (p) { path.push(p); started = true; }
          if (bin) path.push(b);
        } else if (ain) { started = true; path.push(a); if (bin) path.push(b); }
      } else if (bin) {
        path.push(b);
      } else { // exiting
        const p = crossing(a, b);
        if (p) path.push(p);
        break;
      }
    }
    if (path.length < 3) throw new Error('Groove clipping failed — degenerate geometry.');

    // groove endpoints on the circle; direction along the loop is CCW, so
    // the groove path must run from higher angle to lower? Determine from
    // endpoint angles and flip so path goes CW->…: we assemble CCW overall,
    // meaning consecutive grooves advance by +pitchAng; within a groove the
    // path must go from its +angle end to its -angle end… relative to the
    // tooth center at -90°. Normalize: force path start angle < end angle
    // when walking CCW (angle increasing).
    const angOf = q => Math.atan2(q[1], q[0]);
    let a0 = angOf(path[0]), a1 = angOf(path[path.length - 1]);
    // near -90°, both in (-π/2±small) — no wrap issues.
    if (a0 > a1) path.reverse(), ([a0, a1] = [a1, a0]);

    // assemble: tooth k centered at angle th_k = -π/2 + k·pitchAng
    const outline = [];
    for (let k = 0; k < z; k++) {
      const rotA = k * pitchAng;
      const gpts = GEO.rotPts(path, rotA);
      outline.push(...gpts);
      // arc from this groove's exit (a1 + rotA) to next groove's entry (a0 + (k+1)·pitchAng)
      const from = a1 + rotA, to = a0 + (k + 1) * pitchAng;
      outline.push(...GEO.arc(0, 0, R, from, to, 0.02).slice(1, -1));
    }
    let loopPts = GEO.dedupe(outline, 1e-7);
    loopPts = GEO.ensureWinding(loopPts, true);

    const loops = [{ pts: loopPts, isHole: false }];
    addBoreAndHoles(loops, o, tdfc - (prof.depth + o.clearanceD), warnings);

    const pitchDia = (z * prof.pitch) / Math.PI;
    const data = {
      type: `Timing pulley — ${LABELS[o.profile] || o.profile}`,
      profile: LABELS[o.profile] || o.profile,
      teeth: z, beltPitch: prof.pitch,
      pitchDia, outsideDia: OD,
      pitchLineDiff: prof.pld != null ? prof.pld : (pitchDia - OD) / 2,
      grooveDepth: prof.depth + o.clearanceD,
      beltFitClearance: o.clearanceW,
      beltLengthPerTooth: prof.pitch,
    };
    return {
      cut: loops,
      engrave: [
        { kind: 'circle', cx: 0, cy: 0, r: pitchDia / 2 },
        { kind: 'line', pts: [[-pitchDia * 0.06, 0], [pitchDia * 0.06, 0]] },
        { kind: 'line', pts: [[0, -pitchDia * 0.06], [0, pitchDia * 0.06]] },
        ...(o.label !== undefined && !o.label ? [] : [{
          kind: 'text', x: 0, y: -pitchDia * 0.14, h: Math.max(2, pitchDia * 0.05),
          text: o.label !== undefined ? o.label : `${LABELS[o.profile] || o.profile} z${z}`,
        }]),
      ],
      data, warnings,
    };
  }

  function addBoreAndHoles(loops, o, maxR, warnings) {
    const b = o.bore;
    if (b && b.type && b.type !== 'none') {
      let loop = null;
      if (b.type === 'round' && b.d > 0) { loop = GEO.boreRound(b.d); loop.circleHint = { cx: 0, cy: 0, r: b.d / 2 }; }
      else if (b.type === 'd' && b.d > 0) loop = GEO.boreD(b.d, b.flatDepth || b.d * 0.1);
      else if (b.type === 'hex' && b.af > 0) loop = GEO.borePolygon(b.af, 6);
      else if (b.type === 'square' && b.af > 0) loop = GEO.borePolygon(b.af, 4);
      else if (b.type === 'key' && b.d > 0) {
        const r = GEO.boreKeyed(b.d);
        loop = r.loop;
        if (r.key) warnings.push({ level: 'info', msg: `Keyway DIN 6885: ${r.key.b}×${r.key.h} key, hub depth t2=${r.key.t2}` });
        else warnings.push({ level: 'warn', msg: `No DIN 6885 key size for Ø${b.d} — plain bore used.` });
      }
      if (loop) {
        const boreMax = Math.max(...loop.pts.map(q => Math.hypot(q[0], q[1])));
        if (boreMax >= maxR) throw new Error('Bore reaches the groove roots.');
        if (boreMax >= maxR * 0.8) warnings.push({ level: 'warn', msg: 'Thin web between bore and groove roots.' });
        loops.push(loop);
      }
    }
    const bc = o.boltCircle;
    if (bc && bc.n > 0 && bc.d > 0 && bc.bcd > 0) {
      if (bc.bcd / 2 + bc.d / 2 >= maxR) warnings.push({ level: 'error', msg: 'Bolt circle reaches the groove roots — holes skipped.' });
      else loops.push(...GEO.boltCircle(bc.n, bc.d, bc.bcd, bc.startDeg || 0));
    }
  }

  const api = { PROFILES, ORDER, LABELS, outerDiameter, buildPulley };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (global.GearForge = global.GearForge || {}).pulley = api;
})(typeof self !== 'undefined' ? self : this);
