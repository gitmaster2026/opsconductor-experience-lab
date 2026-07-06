// test/engine-filterable-table.test.mjs
//
// Unit tests for engine/filterable-table.js's pure logic (sortRows/
// filterRows/applyTable/resolveRowProbeInfo) - V5 Phase 4.5's designated
// REUSABLE component. Deliberately exercised here against generic,
// Workbench-unrelated synthetic data (a small fruit-inventory table) rather
// than the operational dataset, to prove this module's logic has no hidden
// coupling to Workbench's own column/row shapes - it is a real standalone
// utility, testable and usable independently. (The DOM-rendering half,
// mountFilterableTable(), is not exercised here - node:test has no DOM;
// its standalone reusability is instead verified via the Playwright visual
// pass, see the phase report. resolveRowProbeInfo() is the one piece of
// NEW pure/testable logic the Probe/Hover wiring added - see that
// function's own doc comment and this module's header for why the
// attribute-stamping/button-rendering half stays DOM-only and untested
// here, matching the sort/filter split above.)
//
// Run with `node --test test/`.

import test from 'node:test';
import assert from 'node:assert/strict';
import { sortRows, filterRows, applyTable, resolveRowProbeInfo } from '../prototype/current/engine/filterable-table.js';

const COLUMNS = [
  { key: 'name', label: 'Name' },
  { key: 'qty', label: 'Quantity' },
  { key: 'category', label: 'Category' },
];

const ROWS = [
  { id: 'a', name: 'Apple', qty: 50, category: 'fruit' },
  { id: 'b', name: 'Banana', qty: 120, category: 'fruit' },
  { id: 'c', name: 'Carrot', qty: 30, category: 'vegetable' },
  { id: 'd', name: 'Date', qty: 50, category: 'fruit' },
  { id: 'e', name: 'Eggplant', qty: 15, category: 'vegetable' },
];

// ---------------------------------------------------------------------------
// sortRows: correctness
// ---------------------------------------------------------------------------

test('sortRows: null/undefined sortState returns a copy in original order', () => {
  const result = sortRows(ROWS, COLUMNS, null);
  assert.deepEqual(result.map((r) => r.id), ['a', 'b', 'c', 'd', 'e']);
  assert.notEqual(result, ROWS, 'must return a new array, not the same reference');
});

test('sortRows: throws on non-array rows', () => {
  assert.throws(() => sortRows('not-an-array', COLUMNS, null));
});

test('sortRows: numeric column sorts ascending/descending correctly', () => {
  const asc = sortRows(ROWS, COLUMNS, { columnKey: 'qty', direction: 'asc' });
  assert.deepEqual(asc.map((r) => r.qty), [15, 30, 50, 50, 120]);

  const desc = sortRows(ROWS, COLUMNS, { columnKey: 'qty', direction: 'desc' });
  assert.deepEqual(desc.map((r) => r.qty), [120, 50, 50, 30, 15]);
});

test('sortRows: string column sorts locale-aware ascending/descending', () => {
  const asc = sortRows(ROWS, COLUMNS, { columnKey: 'name', direction: 'asc' });
  assert.deepEqual(asc.map((r) => r.name), ['Apple', 'Banana', 'Carrot', 'Date', 'Eggplant']);

  const desc = sortRows(ROWS, COLUMNS, { columnKey: 'category', direction: 'desc' });
  // 'vegetable' > 'fruit' lexically, so vegetables sort first descending.
  assert.deepEqual(desc.map((r) => r.category), ['vegetable', 'vegetable', 'fruit', 'fruit', 'fruit']);
});

test('sortRows: is STABLE - equal-value rows keep their original relative order', () => {
  // Apple(qty:50) and Date(qty:50) tie; Apple appears before Date in ROWS,
  // so it must still appear before Date after sorting by qty, in EITHER
  // direction (a stable sort never reorders ties, regardless of direction).
  const asc = sortRows(ROWS, COLUMNS, { columnKey: 'qty', direction: 'asc' });
  const appleIdxAsc = asc.findIndex((r) => r.id === 'a');
  const dateIdxAsc = asc.findIndex((r) => r.id === 'd');
  assert.ok(appleIdxAsc < dateIdxAsc, 'Apple must precede Date (tie, ascending)');

  const desc = sortRows(ROWS, COLUMNS, { columnKey: 'qty', direction: 'desc' });
  const appleIdxDesc = desc.findIndex((r) => r.id === 'a');
  const dateIdxDesc = desc.findIndex((r) => r.id === 'd');
  assert.ok(appleIdxDesc < dateIdxDesc, 'Apple must precede Date (tie, descending)');
});

test('sortRows: nullish values always sort last, regardless of direction', () => {
  const withGaps = [
    { id: 'x', qty: 10 },
    { id: 'y', qty: null },
    { id: 'z', qty: 5 },
  ];
  const asc = sortRows(withGaps, COLUMNS, { columnKey: 'qty', direction: 'asc' });
  assert.equal(asc[asc.length - 1].id, 'y');
  const desc = sortRows(withGaps, COLUMNS, { columnKey: 'qty', direction: 'desc' });
  assert.equal(desc[desc.length - 1].id, 'y');
});

test('sortRows: honors a column\'s custom accessor', () => {
  const computedColumns = [{ key: 'nameLength', label: 'Name Length', accessor: (row) => row.name.length }];
  const sorted = sortRows(ROWS, computedColumns, { columnKey: 'nameLength', direction: 'asc' });
  assert.deepEqual(
    sorted.map((r) => r.name.length),
    [...ROWS].map((r) => r.name.length).sort((a, b) => a - b)
  );
});

test('sortRows: does not mutate the input array', () => {
  const copy = [...ROWS];
  sortRows(ROWS, COLUMNS, { columnKey: 'qty', direction: 'desc' });
  assert.deepEqual(ROWS, copy);
});

// ---------------------------------------------------------------------------
// filterRows: correctness
// ---------------------------------------------------------------------------

test('filterRows: throws on non-array rows', () => {
  assert.throws(() => filterRows('nope', COLUMNS, {}));
});

test('filterRows: empty/undefined filterState returns a copy of every row', () => {
  const result = filterRows(ROWS, COLUMNS, {});
  assert.equal(result.length, ROWS.length);
  assert.notEqual(result, ROWS);
});

test('filterRows: whitespace-only query on a column imposes no constraint', () => {
  const result = filterRows(ROWS, COLUMNS, { name: '   ' });
  assert.equal(result.length, ROWS.length);
});

test('filterRows: case-insensitive substring match on a single column', () => {
  const result = filterRows(ROWS, COLUMNS, { name: 'an' });
  assert.deepEqual(result.map((r) => r.id).sort(), ['b', 'e']); // Banana, Eggplant
});

test('filterRows: multiple active filters are ANDed together', () => {
  const result = filterRows(ROWS, COLUMNS, { category: 'fruit', name: 'a' });
  // fruit rows: Apple, Banana, Date - all contain "a" case-insensitively.
  assert.deepEqual(result.map((r) => r.id).sort(), ['a', 'b', 'd']);

  const narrower = filterRows(ROWS, COLUMNS, { category: 'vegetable', name: 'apple' });
  assert.deepEqual(narrower, []);
});

test('filterRows: a query matching nothing returns an empty array', () => {
  const result = filterRows(ROWS, COLUMNS, { name: 'zzz-not-present' });
  assert.deepEqual(result, []);
});

test('filterRows: does not mutate the input array', () => {
  const copy = [...ROWS];
  filterRows(ROWS, COLUMNS, { category: 'fruit' });
  assert.deepEqual(ROWS, copy);
});

// ---------------------------------------------------------------------------
// applyTable: filter-then-sort pipeline
// ---------------------------------------------------------------------------

test('applyTable: filters first, then sorts the remaining rows', () => {
  const result = applyTable(ROWS, COLUMNS, {
    filterState: { category: 'fruit' },
    sortState: { columnKey: 'qty', direction: 'asc' },
  });
  assert.deepEqual(result.map((r) => r.id), ['a', 'd', 'b']); // Apple/Date(50 tie, stable) then Banana(120)
});

test('applyTable: with no sort/filter state, returns all rows unchanged in order', () => {
  const result = applyTable(ROWS, COLUMNS, {});
  assert.deepEqual(result.map((r) => r.id), ROWS.map((r) => r.id));
});

// ---------------------------------------------------------------------------
// resolveRowProbeInfo: the deterministic row -> Probe-label glue behind
// the new optional getRowProbeType/onProbe config (module header's "Probe/
// Hover wiring" section) - the one piece of new logic worth a pure-function
// unit test per this file's own established split (DOM rendering itself is
// exercised via the Playwright visual pass, not node:test - see header).
// ---------------------------------------------------------------------------

test('resolveRowProbeInfo: returns null when getRowProbeType is omitted entirely', () => {
  assert.equal(resolveRowProbeInfo(ROWS[0], undefined), null);
});

test('resolveRowProbeInfo: returns null when the accessor returns null/undefined/empty-string for this row', () => {
  assert.equal(resolveRowProbeInfo(ROWS[0], () => null), null);
  assert.equal(resolveRowProbeInfo(ROWS[0], () => undefined), null);
  assert.equal(resolveRowProbeInfo(ROWS[0], () => ''), null);
});

test('resolveRowProbeInfo: a real object type produces the exact same "Probe {Noun}" text engine/labels.js\'s probeLabel() produces', () => {
  const info = resolveRowProbeInfo({ id: 'RB-1' }, () => 'commitment');
  assert.deepEqual(info, { objectType: 'commitment', label: 'Probe Commitment' });
});

test('resolveRowProbeInfo: is per-row deterministic - given the SAME row and accessor, the type mapping in engine/labels.js\'s OBJECT_TYPE_NOUNS decides the label, not row identity', () => {
  const accessor = (row) => row.category === 'fruit' ? 'commitment' : 'evidence';
  const fruitRow = ROWS.find((r) => r.category === 'fruit');
  const vegRow = ROWS.find((r) => r.category === 'vegetable');
  assert.deepEqual(resolveRowProbeInfo(fruitRow, accessor), { objectType: 'commitment', label: 'Probe Commitment' });
  assert.deepEqual(resolveRowProbeInfo(vegRow, accessor), { objectType: 'evidence', label: 'Probe Evidence' });
});

test('resolveRowProbeInfo: an unrecognized type string still produces a readable, non-empty label (falls through to probeLabel()\'s own title-case fallback) rather than throwing or returning null', () => {
  const info = resolveRowProbeInfo(ROWS[0], () => 'some_future_type');
  assert.deepEqual(info, { objectType: 'some_future_type', label: 'Probe Some Future Type' });
});

test('resolveRowProbeInfo: the accessor receives the exact row instance passed in (no cloning/mutation)', () => {
  const row = { id: 'x', __rootType: 'demand_signal' };
  let receivedRow = null;
  resolveRowProbeInfo(row, (r) => {
    receivedRow = r;
    return r.__rootType;
  });
  assert.equal(receivedRow, row);
});
