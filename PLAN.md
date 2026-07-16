# GearForge — Design & Implementation Plan

A standards-correct, math-rigorous, laser-cutter-ready generator for **involute spur gears**
(external, internal/ring, racks), **timing-belt pulleys**, and **involute splines** — as a
zero-dependency single-page web app with SVG + DXF export and a Node test suite that proves
the geometry numerically.

---

## 1. Goals & non-goals

**Goals**

1. *Standards-correct geometry* — not approximations traced from pictures:
   - Spur gears per ISO 21771 / DIN 867 basic rack (ISO 53), with true **rack-generated
     trochoidal root fillets** (handles undercut correctly), profile shift, backlash
     allowance, and tip shortening.
   - Timing pulleys for GT2/GT3/GT5, HTD 3M/5M/8M, T2.5/T5/T10, AT5, MXL/XL/L/40DP using
     the proven groove profiles + pitch-line-differential values used industry-wide.
   - Involute splines per ISO 4156 / ANSI B92.1 (30° PA, flat root & fillet root,
     external shaft + internal hub cross-sections).
2. *Laser-ready output* — closed polyline loops, kerf compensation (outer loops grow,
   holes shrink), mm-true SVG and DXF R12 with CUT / ENGRAVE layers.
3. *Fool-proof* — live validation, engineering warnings (undercut, pointed tip, contact
   ratio, kerf vs. fillet radius), presets, and a full dimension/inspection report
   (measurement over pins, span measurement) so a machinist can verify the part.
4. *Verified* — a test suite that checks generated point geometry against independent
   closed-form standards formulas, not just "the code ran".

**Non-goals:** helical/bevel gears, 3D output, stress/strength calculations (we report
geometry only), chain sprockets (future work).

## 2. Architecture

Zero build step, zero runtime dependencies. Plain JS files that work both as classic
`<script>` tags (so `index.html` opens from `file://`) and as CommonJS modules (so Node
can unit-test the same code).

```
generator/
├── index.html          UI shell (works from file://, no server needed)
├── style.css
├── src/
│   ├── geometry.js     vectors, arcs, polyline offset (kerf), intersection, bores/keyways
│   ├── involute.js     spur / internal / rack generation + mesh & inspection math
│   ├── pulley.js       timing pulley profiles + generation
│   ├── spline.js       ISO 4156 involute splines (shaft + hub)
│   ├── exporters.js    SVG (mm-true) and DXF R12 writers
│   └── app.js          UI binding, live preview, pan/zoom, mesh animation, warnings
├── tests/run-tests.js  node:test suite (geometry vs. closed-form checks)
├── PLAN.md  README.md  LICENSE (MIT)
```

Every core module returns a common **Part** shape:

```js
{ cut:     [ {pts:[[x,y],…], isHole:bool}, … ],   // closed loops, mm
  engrave: [ …loops/segments (pitch circle, centermark, label)… ],
  data:    { …computed dimensions & inspection values… },
  warnings:[ {level:'info'|'warn'|'error', msg} ] }
```

## 3. The math (what "standards-correct" means here)

### 3.1 External spur gear (ISO 21771 nomenclature)

Inputs: module `m`, teeth `z`, pressure angle `α` (14.5/20/25°), profile shift coeff `x`,
addendum coeff `ha* = 1.00`, dedendum coeff `hf* = 1.25`, rack tip fillet `ρf* = 0.38`
(ISO 53 profile A), circular backlash allowance `Δs` (tooth thinning), tip shortening `k`.

- Pitch radius `rp = mz/2`, base `rb = rp·cos α`,
  tip `ra = rp + m(ha* + x − k)`, root `rf = rp − m(hf* − x)`.
- Tooth thickness at pitch: `s = m(π/2 + 2x·tan α) − Δs`.
- Involute flank, tooth centered on θ=0: for radius `r ∈ [max(rb,·), ra]`,
  `θ(r) = ψ + inv α − inv αr` with `ψ = s/(2rp)`, `cos αr = rb/r`, `inv t = tan t − t`.
- **Root fillet:** the exact envelope of the rack cutter's rounded tip corner. The corner
  circle center (rack coords: `ξc = a − ηc·tanα + ρ/cosα`, `ηc = −(hf*−x)m + ρ`,
  `a = s/2`) is rolled over the pitch circle:
  `C(φ) = R(φ)·(ξc + rp·φ, rp + ηc)`, and the cut surface is the inner envelope
  `P(φ) = C(φ) − ρ·n̂(φ)` (n̂ ⟂ C′). This produces the true trochoid — including the
  undercut re-entrant shape for small z — then the fillet and involute polylines are
  intersected/joined numerically.
- Tooth assembled: root land arc → fillet → involute → tip land arc → mirror; repeated z
  times; loop oriented CCW.

**Pair/mesh math** (for the report + two-gear layout):
- Working pressure angle: `inv αw = inv α + 2(x1+x2)tan α/(z1+z2)`; center distance
  `aw = m(z1+z2)/2 · cos α/cos αw`.
- Transverse contact ratio
  `εα = (√(ra1²−rb1²) + √(ra2²−rb2²) − aw·sin αw) / (π·m·cos α)`.

**Inspection values** (so the user can verify a cut part):
- Span measurement over `k` teeth: `Wk = m·cosα·(π(k−0.5) + z·inv α) + 2x·m·sinα`.
- Measurement over pins: `inv αM = s/d + inv α + dp/(d·cosα) − π/z`,
  `M = db/cos αM + dp` (even z) or `db·cos(90°/z)/cos αM + dp` (odd z).
- The test suite *closes the loop*: it places the pin against the generated flank
  polyline numerically and checks tangency against the closed-form M.

**Warnings:** undercut when `z < 2(ha*−x)/sin²α`; pointed/thin tip when
`sa = 2ra(ψ + invα − inv αa) < 0.25m`; `εα < 1.2` warn, `< 1.0` error; root land
collapse handled by clipping fillets at the space centerline.

### 3.2 Internal (ring) gear

Same involute of the same base circle; tooth occupies `r ∈ [ra_int, rf_int]` with
`ra_int = rp − m(ha* − x)` (tips inward), `rf_int = rp + m(hf* + x)`, thickness
`s = m(π/2 − 2x·tanα) − Δs`. Root fillets are tangent arcs (ρ ≈ 0.3m) found by a
1-D solve (circle tangent to flank tangent line and root circle). Part is an annulus:
outer rim circle + toothed hole.

### 3.3 Rack

Straight flanks at α, analytic corner fillets, n teeth, mm-true pitch `πm`; optional
mounting holes. Trivial but useful for laser linear drives.

### 3.4 Timing pulleys

2-D pulley disc = outer circle of `OD = z·p/π − 2·PLD` with z tooth grooves. Groove
shapes and PLD (pitch line differential) per profile come from the published SDP/SI
dimensional data as popularized by the widely-print-proven parametric pulley generator
(droftarts, Thingiverse 16627) — the same numbers behind most 3D-printed GT2 pulleys in
existence. Trapezoidal profiles (MXL/XL/L/T/AT) are parametric; curvilinear (GT2, HTD)
use the standard point-set groove outlines mapped around the pulley circumference.
Belt-tooth clearance is already baked into those groove profiles; kerf compensation is
applied on top.

### 3.5 Involute splines — ISO 4156 / ANSI B92.1, 30° PA

- Pitch `D = mz`, base `Db = mz·cos30°`, basic tooth thickness = space width = `πm/2`.
- External: major `= m(z+1)`; minor `= m(z−1.5)` (flat root) / `m(z−1.8)` (fillet root).
- Internal: minor `= m(z−1)`; major `= m(z+1.5)` (flat) / `m(z+1.8)` (fillet).
- Side-fit clearance parameter thins the external tooth (effective tooth thickness),
  since a laser can't produce true interference-class fits.
- Shaft cross-section (plate) and hub (plate with spline bore) generated as parts.

### 3.6 Bores & features (all part types)

Round bore, D-flat bore, hex bore (across-flats), square bore, and **DIN 6885 / ISO 773
keyways** (key `b×h` and hub depth `t2` from the standard shaft-diameter table, JS9-width
intent noted in report). Optional bolt-circle holes. Engrave layer: pitch circle,
crosshair, text label.

### 3.7 Kerf compensation

The beam centerline must be offset by `kerf/2` along the outward material normal: outer
loops grow, holes shrink. Implemented as vertex-normal offset on the densely-sampled
loops (valid because kerf/2 ≪ local curvature radii; a warning fires if
`kerf/2 > 0.3·ρf`). Applied at export *and* previewable.

## 4. Export formats

- **SVG**: `width`/`height` in real mm + matching viewBox; layers as `<g id="CUT">`
  (red, 0.1 mm stroke) and `<g id="ENGRAVE">` (blue); no fills; paths closed with `Z`.
  Imports mm-true into LightBurn / Inkscape / xTool / Glowforge.
- **DXF R12**: classic `POLYLINE`/`VERTEX`/`SEQEND` (closed flag), `CIRCLE` for round
  holes, layers CUT/ENGRAVE, `$MEASUREMENT`/`$INSUNITS` metric. R12 chosen for maximum
  CAM compatibility.

## 5. UI

Single page: type tabs (Spur / Internal / Rack / Pulley / Spline shaft / Spline hub) →
grouped parameter form with live validation → SVG preview with wheel zoom / drag pan /
fit → warnings panel → full dimension & inspection report → export buttons. Gear pair
mode overlays the mating pinion at the computed working center distance and animates the
mesh at the correct ratio. A few one-click presets (GT2-20T idler, m2 3:1 pair, …).

## 6. Verification strategy (why it will actually work)

Node `node:test` suite over the *same* files the browser runs:

1. Involute identities & center-distance solver round-trips.
2. Tooth thickness sampled from generated flank points == `s` formula (≤ 1 µm).
3. **Pin test:** numeric pin placed tangent to generated flanks matches closed-form
   measurement-over-pins (≤ 5 µm) across a parameter sweep.
4. Undercut case (z=8, x=0): closed, simple (no self-intersection) polygon.
5. Parameter sweep smoke test (z 6–120, x −0.4…+0.8, α 14.5/20/25): closed loops, radii
   within [rf, ra], no self-intersections.
6. Pulley: OD formula, groove count, loop closure; pitch circumference == z·p.
7. Spline: standard major/minor diameters reproduced by generated geometry.
8. Kerf: offsetting a sampled circle by k moves every point radially by k (± tolerance).
9. Export: DXF entity structure parses; SVG dimensions mm-true.

Plus interactive verification: the app is driven in a real browser (all six part types
rendered, exports downloaded and inspected) before sign-off.

## 7. Milestones

1. PLAN.md (this file) ✔
2. `geometry.js` + `involute.js` + tests green
3. `exporters.js`, `spline.js`, `pulley.js` + tests green
4. UI (`index.html`, `style.css`, `app.js`) + browser verification
5. README (math documented for contributors), LICENSE, final full test run
