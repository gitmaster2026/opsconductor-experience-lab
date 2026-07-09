// test/fixtures/mini-dom.mjs
//
// Test-only helper: a minimal, hand-rolled DOM shim (Element/Document +
// a tiny HTML-string parser) - NOT a general jsdom replacement, just
// enough surface for panels/functional-radar.js and
// engine/filterable-table.js to run for real under plain node:test (which
// has no DOM at all - see test/engine-filterable-table.test.mjs's own
// header: "mountFilterableTable(), is not exercised here - node:test has
// no DOM").
//
// This repo deliberately does not unit-test the DOM-rendering half of its
// panel/engine modules (every existing *.test.mjs only imports pure
// logic). That convention is right for ordinary rendering correctness -
// but the List View "loads, then disappears after a few seconds"
// regression this fixture exists to catch is a DOM LIFECYCLE bug: a
// panel module that keeps a long-lived component instance (engine/
// filterable-table.js's mountFilterableTable()) mounted into a container
// element that a *later* re-render silently replaces, orphaning the
// component against a detached subtree while the live container stays
// empty. No amount of pure-function testing can observe that failure
// mode - it only exists once real DOM nodes with real identity are
// involved. Hence this narrowly-scoped shim, used by exactly one test
// file (test/panels-functional-radar-list-view-stability.test.mjs).
//
// Supports only what panels/functional-radar.js and
// engine/filterable-table.js actually use: createElement/createTextNode,
// classList add/remove/toggle/contains, get/set/has/removeAttribute,
// appendChild, a `.innerHTML` setter that parses well-formed nested
// markup (no self-closing tags, no comments - neither module's templates
// use either), and querySelector(All) for simple `#id` / `.class` /
// `[data-attr]` / `[data-attr="value"]` selectors (optionally
// comma-separated), which is the entire selector vocabulary both modules
// use. `.click()` dispatches to registered 'click' listeners so a test
// can drive the exact same button clicks a real user would.

class MiniElement {
  constructor(tagName) {
    this.tagName = String(tagName ?? '').toLowerCase();
    this.attributes = new Map();
    this.children = [];
    this.parentNode = null;
    this.listeners = new Map();
    this.value = '';
    this._classList = new Set();
    this.classList = {
      add: (...names) => names.forEach((n) => this._classList.add(n)),
      remove: (...names) => names.forEach((n) => this._classList.delete(n)),
      toggle: (name, force) => {
        const shouldHave = force === undefined ? !this._classList.has(name) : Boolean(force);
        if (shouldHave) this._classList.add(name);
        else this._classList.delete(name);
        return shouldHave;
      },
      contains: (name) => this._classList.has(name),
    };
  }

  get id() {
    return this.attributes.get('id') ?? '';
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.has(name) ? this.attributes.get(name) : null;
  }

  hasAttribute(name) {
    return this.attributes.has(name);
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  set innerHTML(html) {
    this.children = [];
    if (typeof html === 'string' && html.trim().length > 0) {
      for (const node of parseHTML(html)) this.appendChild(node);
    }
  }

  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(handler);
  }

  removeEventListener(type, handler) {
    const list = this.listeners.get(type);
    if (!list) return;
    const idx = list.indexOf(handler);
    if (idx >= 0) list.splice(idx, 1);
  }

  click() {
    const fakeEvent = { target: this, stopPropagation() {} };
    for (const handler of this.listeners.get('click') ?? []) handler(fakeEvent);
  }

  getBoundingClientRect() {
    return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 };
  }

  querySelector(selector) {
    return findAll(this, selector)[0] ?? null;
  }

  querySelectorAll(selector) {
    const matches = findAll(this, selector);
    matches.forEach = Array.prototype.forEach.bind(matches);
    return matches;
  }
}

function matchesSimple(el, sel) {
  sel = sel.trim();
  if (sel.startsWith('#')) return el.id === sel.slice(1);
  if (sel.startsWith('.')) return el.classList.contains(sel.slice(1));
  if (sel.startsWith('[') && sel.endsWith(']')) {
    const inner = sel.slice(1, -1);
    const eqIdx = inner.indexOf('=');
    if (eqIdx === -1) return el.hasAttribute(inner);
    const name = inner.slice(0, eqIdx).trim();
    const value = inner.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    return el.getAttribute(name) === value;
  }
  return el.tagName === sel.toLowerCase();
}

function matches(el, selector) {
  return selector.split(',').some((part) => matchesSimple(el, part));
}

function findAll(root, selector) {
  const out = [];
  const walk = (node) => {
    for (const child of node.children ?? []) {
      if (child instanceof MiniElement) {
        if (matches(child, selector)) out.push(child);
        walk(child);
      }
    }
  };
  walk(root);
  return out;
}

class MiniTextNode {
  constructor(text) {
    this.nodeType = 3;
    this.textContent = text;
  }
}

export class MiniDocument {
  createElement(tagName) {
    return new MiniElement(tagName);
  }

  createTextNode(text) {
    return new MiniTextNode(text);
  }

  addEventListener() {}

  removeEventListener() {}
}

// --- Minimal recursive-descent parser -------------------------------------
//
// Assumes well-formed, balanced markup with explicit closing tags (true of
// every template string in panels/functional-radar.js and
// engine/filterable-table.js) - no self-closing tags, no <script>/<style>,
// no comments. `parseNodes()` stops as soon as it sees ANY closing tag,
// which is always correct for balanced markup: each child element consumes
// its own full subtree (including its own closing tag) recursively before
// control returns to its parent's loop, so the next closing tag a parent's
// loop observes can only be its own.

function parseHTML(html) {
  let i = 0;
  const doc = new MiniDocument();

  function parseNodes() {
    const nodes = [];
    while (i < html.length && !html.startsWith('</', i)) {
      if (html[i] === '<') {
        nodes.push(parseElement());
      } else {
        const start = i;
        while (i < html.length && html[i] !== '<') i++;
        const text = html.slice(start, i);
        if (text.trim().length > 0) nodes.push(doc.createTextNode(text));
      }
    }
    return nodes;
  }

  function parseElement() {
    i++; // consume '<'
    const tagStart = i;
    while (i < html.length && /[a-zA-Z0-9-]/.test(html[i])) i++;
    const tagName = html.slice(tagStart, i);
    const el = doc.createElement(tagName);

    while (i < html.length && html[i] !== '>' && html[i] !== '/') {
      while (i < html.length && /\s/.test(html[i])) i++;
      if (html[i] === '>' || html[i] === '/') break;
      const nameStart = i;
      while (i < html.length && /[^\s=>/]/.test(html[i])) i++;
      const name = html.slice(nameStart, i);
      let value = '';
      let j = i;
      while (j < html.length && /\s/.test(html[j])) j++;
      if (html[j] === '=') {
        j++;
        while (j < html.length && /\s/.test(html[j])) j++;
        const quote = html[j];
        if (quote === '"' || quote === "'") {
          j++;
          const valStart = j;
          while (j < html.length && html[j] !== quote) j++;
          value = html.slice(valStart, j);
          j++; // consume closing quote
        }
        i = j;
      }
      if (name) el.setAttribute(name, value);
    }
    if (html[i] === '/') i++; // self-closing marker (unused by real templates, tolerated)
    i++; // consume '>'

    for (const child of parseNodes()) el.appendChild(child);

    if (html.startsWith('</', i)) {
      i += 2;
      while (i < html.length && html[i] !== '>') i++;
      i++; // consume '>'
    }
    return el;
  }

  return parseNodes();
}

/**
 * A minimal stand-in for `window` - Node's global object, unlike a real
 * browser's, is not itself an EventTarget (no addEventListener), but
 * engine/filterable-table.js's governed multi-select dropdown (UX
 * hardening item 2) calls `window.addEventListener('resize', ...)` /
 * `removeEventListener` to close an open dropdown on viewport resize,
 * matching this app's existing `window.setTimeout`/`window.setInterval`
 * usage elsewhere. Nothing in this test ever resizes a real viewport, so
 * this only needs to accept the calls without throwing, not actually fire.
 */
class MiniWindow {
  addEventListener() {}
  removeEventListener() {}
}

/**
 * Install a fresh MiniDocument as `globalThis.document` (and a MiniWindow as
 * `globalThis.window`) for the duration of one test. Both consumer modules
 * only touch `document`/`window` inside function bodies at call time (never
 * at import time), so this just needs to run before the mounting call, not
 * before the `import` statements.
 *
 * @returns {MiniDocument}
 */
export function installMiniDocument() {
  const doc = new MiniDocument();
  globalThis.document = doc;
  globalThis.window = new MiniWindow();
  return doc;
}
