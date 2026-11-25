// Practice progress: Check can pass many times, but a day counts a challenge once.
import test from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.window = {
  localStorage: { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) },
  dispatchEvent() {}, addEventListener() {}, removeEventListener() {},
};
globalThis.CustomEvent = class { constructor(t) { this.type = t; } };
const { markSolved, solvedOn, getProgress, localDay, streak } = await import('../src/lib/progress.js');

test('repeated Check on one challenge counts once per day', () => {
  const today = localDay();
  for (let i = 0; i < 5; i++) markSolved('c1');
  markSolved('c2');
  const p = getProgress();
  assert.equal(p.days[today], 2);
  assert.equal(solvedOn(today), 2);
  assert.equal(p.solved.c1.count, 5);
  assert.equal(streak(p), 1);
});

test('solvedOn ignores a day total inflated by older versions', () => {
  const today = localDay();
  const p = getProgress();
  p.days[today] = 40;
  store.set('lowlevel-lab-progress-v1', JSON.stringify(p));
  assert.equal(solvedOn(today), 2);
});
