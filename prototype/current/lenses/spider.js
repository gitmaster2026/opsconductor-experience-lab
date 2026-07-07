// lenses/spider.js
//
// The Commitment Health Radar (V1-UX-1b Task 1; superseded the prior
// generic domain-exposure "Spider" lens from V5 Phase 4 -
// docs/V5_DESIGN_SPEC.md §4). Module filename/export name are kept as-is
// to avoid an unnecessary rename across app.js/engine/timeline.js; the UI
// itself now presents this as "Commitment Health Radar," per
// docs/LENS_SPECIFICATIONS.md.
//
// Purpose: answer "how likely are we to successfully fulfill THIS customer
// commitment?" - not a generic KPI chart. Its 9 axes (Customer Commitment,
// Planning, Supply Chain, Manufacturing, Inventory, Quality, Engineering,
// Logistics, Service - engine/derive.js's SPIDER_AXES) are derived from
// canonical NR04 domain data. The polygon reflects the resolved subject's
// (the commitment the current selection traces to, or a whole-portfolio
// rollup when nothing resolves to a commitment - engine/derive.js's
// buildSpiderViewModel()) weighted risk exposure per axis at the current
// time slice.
//
// Every spoke is Probeable: clicking a weak spoke selects that axis's worst
// contributing object, which (per docs/UX_ARCHITECTURE.md's Probe
// interaction language) focuses the related evidence/relationship chain in
// Universe and opens its Passport - the same onSelect callback Universe/
// Risk Board/Passport all route through.
//
// Rendering approach: a single inline SVG (not Canvas) - a radar chart is a
// handful of static lines/labels plus one polygon, and SVG lets the
// vertices be real clickable/hoverable DOM elements (§4.3: "Axis vertex
// click -> selects the worst-risk object on that axis") without any manual
// hit-testing math, consistent with lenses/risk-board.js's own choice of
// plain DOM/SVG over Canvas for a structurally different (non-spatial)
// lens.
//
// Motion: "Time scrub morphs the polygon (400ms ease) - the shape breathing
// over time is the lens's memorable moment" (§4.3), matching
// docs/V5_DESIGN_SPEC.md §9.1's `--dur-move` (400ms) / `--ease-out` tokens
// (not yet centralized - see lenses/risk-board-layout.js's FLIP_DURATION_MS/
// FLIP_EASING for the same "Phase 5 will centralize this" precedent). A
// polygon's `points` attribute cannot be CSS-transitioned, so this module
// drives the morph itself via requestAnimationFrame, interpolating each
// axis's displayed score toward its new target every frame - the same
// "pure math + rAF-driven DOM writes" division of labor
// lenses/risk-board.js's FLIP playback already uses, just continuous
// instead of snap-then-transition.
//
// Like every other lens module, this file knows nothing about
// engine/state.js - app.js wires onSelect to store.selectObject().

import { easeOutCubic } from '../engine/easing.js';

const MORPH_DURATION_MS = 400;

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function riskColorVar(riskState) {
  switch (riskState) {
    case 'critical':
      return '--red';
    case 'elevated':
    case 'attention':
      return '--orange';
    case 'watch':
      return '--yellow';
    case 'normal':
      return '--green';
    default:
      return '--gray';
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const VIEW_SIZE = 400;
const CENTER = VIEW_SIZE / 2;
const RADIUS = 150;
const RING_COUNT = 4;

function axisAngle(index, total) {
  return (Math.PI * 2 * index) / total - Math.PI / 2;
}

function axisPoint(index, total, radiusFraction) {
  const angle = axisAngle(index, total);
  const r = RADIUS * Math.max(0, Math.min(1, radiusFraction));
  return { x: CENTER + r * Math.cos(angle), y: CENTER + r * Math.sin(angle) };
}

function polygonPointsAttr(scores) {
  const total = scores.length;
  return scores.map((score, i) => axisPoint(i, total, score)).map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
}

/**
 * Static background: concentric rings + one spoke line per axis, drawn once
 * and never re-rendered (only the polygon/vertices/labels change per
 * frame/render), matching lenses/risk-board.js's "persistent DOM structure,
 * only the dynamic parts re-render" convention.
 *
 * @param {number} axisCount
 * @returns {string} SVG markup
 */
function buildStaticBackground(axisCount) {
  const rings = [];
  for (let ring = 1; ring <= RING_COUNT; ring += 1) {
    const fraction = ring / RING_COUNT;
    const points = Array.from({ length: axisCount }, (_, i) => axisPoint(i, axisCount, fraction))
      .map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`)
      .join(' ');
    rings.push(`<polygon class="spider-ring" points="${points}" />`);
  }
  const spokes = Array.from({ length: axisCount }, (_, i) => {
    const p = axisPoint(i, axisCount, 1);
    return `<line class="spider-spoke" x1="${CENTER}" y1="${CENTER}" x2="${p.x.toFixed(1)}" y2="${p.y.toFixed(1)}" />`;
  }).join('');
  return `${rings.join('')}${spokes}`;
}

/**
 * Mount the Spider lens onto a container element.
 *
 * @param {HTMLElement} containerEl - the #spiderChart element.
 * @param {Object} callbacks
 * @param {() => Object} callbacks.getBundle - returns the current
 *   engine/timeline.js DerivedBundle (must have .spider).
 * @param {(objectId: string|null) => void} callbacks.onSelect - vertex
 *   click -> selects that axis's worst-risk object (§4.3 drill-down).
 * @param {(objectId: string|null) => void} [callbacks.onHover]
 * @returns {{ render: () => void, resize: () => void, destroy: () => void }}
 */
export function mountSpiderLens(containerEl, callbacks) {
  if (!containerEl || typeof containerEl.appendChild !== 'function') {
    throw new Error('mountSpiderLens: containerEl must be a DOM element');
  }
  const { getBundle, onSelect, onHover, onOpenFunction } = callbacks ?? {};
  if (typeof getBundle !== 'function') {
    throw new Error('mountSpiderLens: callbacks.getBundle is required');
  }

  containerEl.classList.add('spider-lens');

  const surface = document.createElement('div');
  surface.className = 'spider-surface';
  containerEl.appendChild(surface);

  const header = document.createElement('header');
  header.className = 'spider-header';
  surface.appendChild(header);

  const svgWrap = document.createElement('div');
  svgWrap.className = 'spider-svg-wrap';
  svgWrap.innerHTML = `
    <svg class="spider-svg" viewBox="0 0 ${VIEW_SIZE} ${VIEW_SIZE}" role="img" aria-label="Commitment Health Radar">
      <g class="spider-static"></g>
      <polygon class="spider-polygon" points="" />
      <g class="spider-vertices"></g>
      <g class="spider-axis-labels"></g>
    </svg>
  `;
  surface.appendChild(svgWrap);

  const staticGroup = svgWrap.querySelector('.spider-static');
  const polygonEl = svgWrap.querySelector('.spider-polygon');
  const verticesGroup = svgWrap.querySelector('.spider-vertices');
  const labelsGroup = svgWrap.querySelector('.spider-axis-labels');

  const emptyNotice = document.createElement('div');
  emptyNotice.className = 'spider-empty';
  emptyNotice.textContent = 'No commitment health data available.';
  emptyNotice.classList.add('hidden');
  surface.appendChild(emptyNotice);

  let staticBuiltForAxisCount = 0;

  // Morph animation state: the last spiderAxisScores the polygon was
  // ANIMATING TOWARD (targetAxes), the scores it was animating FROM
  // (fromScores), and the wall-clock time the current morph started.
  // displayScores is recomputed every animation frame from these three -
  // never mutated directly - so a render() that arrives mid-morph can
  // always compute "where the polygon visually is right now" and start a
  // fresh morph from there, exactly like lenses/risk-board.js's FLIP
  // "measure current position, animate from there" principle.
  let targetAxes = null;
  let fromScores = null;
  let morphStartedAt = 0;
  let rafHandle = null;

  function currentDisplayScores(now) {
    if (!targetAxes || !fromScores) return targetAxes ? targetAxes.map((a) => a.score) : [];
    const t = MORPH_DURATION_MS <= 0 ? 1 : (now - morphStartedAt) / MORPH_DURATION_MS;
    const eased = easeOutCubic(t);
    return targetAxes.map((axis, i) => lerp(fromScores[i], axis.score, eased));
  }

  function tick() {
    const now = performance.now();
    const scores = currentDisplayScores(now);
    drawDynamic(scores);
    const elapsed = now - morphStartedAt;
    if (elapsed < MORPH_DURATION_MS) {
      rafHandle = requestAnimationFrame(tick);
    } else {
      rafHandle = null;
    }
  }

  function drawDynamic(scores) {
    if (!targetAxes) return;
    polygonEl.setAttribute('points', polygonPointsAttr(scores));

    // Polygon fill = risk color of the single worst axis (highest
    // rawScore), per §4.3 "Polygon fill uses the risk color of the worst
    // axis." Deterministic tie-break: first axis in SPIDER_AXES order.
    let worstAxis = targetAxes[0];
    for (const axis of targetAxes) {
      if (axis.rawScore > worstAxis.rawScore) worstAxis = axis;
    }
    const fillVar = riskColorVar(worstAxis.worstRiskState);
    polygonEl.style.setProperty('--spider-fill-color', `var(${fillVar})`);

    verticesGroup.innerHTML = targetAxes
      .map((axis, i) => {
        const p = axisPoint(i, targetAxes.length, scores[i]);
        const colorVar = riskColorVar(axis.worstRiskState);
        const clickable = Boolean(axis.worstObjectId);
        // Probe is the canonical investigative verb (docs/UX_ARCHITECTURE.md):
        // a weak spoke's aria-label/title reads as an explicit Probe action,
        // not a generic "select"/"view" - clicking it focuses that axis's
        // worst-risk object and its relationship chain (Task 4).
        const probeLabel = clickable
          ? `Probe ${axis.axis}: ${axis.worstObjectLabel ?? 'worst contributor'}`
          : `${axis.axis} axis, no exposure at this time slice`;
        return `
          <circle
            class="spider-vertex${clickable ? ' is-clickable' : ''}"
            cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="6"
            style="--spider-vertex-color: var(${colorVar})"
            data-axis="${escapeHtml(axis.axis)}"
            ${clickable ? `data-select-id="${escapeHtml(axis.worstObjectId)}"` : ''}
            tabindex="${clickable ? '0' : '-1'}"
            role="${clickable ? 'button' : 'presentation'}"
            aria-label="${escapeHtml(probeLabel)}, score ${(axis.score * 100).toFixed(0)}%"
          ><title>${escapeHtml(probeLabel)}</title></circle>
        `;
      })
      .join('');

    verticesGroup.querySelectorAll('[data-select-id]').forEach((el) => {
      el.addEventListener('click', () => {
        const axis = el.getAttribute('data-axis');
        if (typeof onOpenFunction === 'function' && axis) onOpenFunction(axis);
        else if (typeof onSelect === 'function') onSelect(el.getAttribute('data-select-id'));
      });
      el.addEventListener('mouseenter', () => {
        if (typeof onHover === 'function') onHover(el.getAttribute('data-select-id'));
      });
      el.addEventListener('mouseleave', () => {
        if (typeof onHover === 'function') onHover(null);
      });
      el.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          const axis = el.getAttribute('data-axis');
          if (typeof onOpenFunction === 'function' && axis) onOpenFunction(axis);
          else if (typeof onSelect === 'function') onSelect(el.getAttribute('data-select-id'));
        }
      });
    });
  }

  function drawLabels(axes) {
    labelsGroup.innerHTML = axes
      .map((axis, i) => {
        const p = axisPoint(i, axes.length, 1.16);
        return `<text class="spider-axis-label" x="${p.x.toFixed(1)}" y="${p.y.toFixed(1)}" text-anchor="middle" dominant-baseline="middle">${escapeHtml(axis.axis)}</text>`;
      })
      .join('');
  }

  function render() {
    const bundle = getBundle();
    const spider = bundle?.spider ?? null;
    const axes = Array.isArray(spider?.spiderAxisScores) ? spider.spiderAxisScores : [];

    emptyNotice.classList.toggle('hidden', axes.length > 0);
    if (axes.length === 0) {
      header.innerHTML = '';
      polygonEl.setAttribute('points', '');
      verticesGroup.innerHTML = '';
      labelsGroup.innerHTML = '';
      targetAxes = null;
      return;
    }

    if (axes.length !== staticBuiltForAxisCount) {
      staticGroup.innerHTML = buildStaticBackground(axes.length);
      staticBuiltForAxisCount = axes.length;
      drawLabels(axes);
    }

    header.innerHTML = `
      <span class="spider-kicker">${spider.isPortfolioLevel ? 'PORTFOLIO COMMITMENT HEALTH' : 'COMMITMENT HEALTH RADAR'}</span>
      <h2 class="spider-title">${escapeHtml(spider.subjectLabel ?? 'All Commitments (Portfolio)')}</h2>
      <p class="spider-subtitle">How likely are we to successfully fulfill this ${spider.isPortfolioLevel ? 'commitment book' : 'customer commitment'}?</p>
      ${spider.sliceLabel ? `<span class="spider-slice">${escapeHtml(spider.sliceLabel)}</span>` : ''}
    `;

    const newScores = axes.map((a) => a.score);
    const priorScores = targetAxes ? currentDisplayScores(performance.now()) : newScores;
    const scoresChanged =
      !targetAxes || targetAxes.length !== axes.length || axes.some((a, i) => a.score !== targetAxes[i].score);

    targetAxes = axes;

    if (scoresChanged) {
      fromScores = priorScores;
      morphStartedAt = performance.now();
      if (rafHandle === null) {
        rafHandle = requestAnimationFrame(tick);
      }
    } else {
      // Nothing about the scores changed (e.g. only worstObjectId/label
      // metadata differs) - redraw immediately at the current target so
      // vertex click targets/aria-labels stay in sync without kicking off
      // a pointless zero-delta animation.
      drawDynamic(newScores);
    }
  }

  function resize() {
    render();
  }

  function destroy() {
    if (rafHandle !== null) {
      cancelAnimationFrame(rafHandle);
      rafHandle = null;
    }
    surface.remove();
    containerEl.classList.remove('spider-lens');
  }

  render();

  return { render, resize, destroy };
}
