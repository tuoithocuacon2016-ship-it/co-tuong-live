import assert from 'node:assert/strict';
import test from 'node:test';
import { createPauseAwareScheduler } from './pauseAwareScheduler';

function createFakeTimer() {
  let now = 0;
  let nextHandle = 1;
  const timers = new Map<number, { at: number; callback: () => void }>();

  return {
    set(callback: () => void, delayMs: number) {
      const handle = nextHandle++;
      timers.set(handle, { at: now + delayMs, callback });
      return handle;
    },
    clear(handle: number) {
      timers.delete(handle);
    },
    advance(ms: number) {
      now += ms;
      for (;;) {
        const next = [...timers.entries()]
          .filter(([, timer]) => timer.at <= now)
          .sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) return;
        timers.delete(next[0]);
        next[1].callback();
      }
    },
  };
}

test('pausing defers a scheduled action and resume runs it exactly once', () => {
  const timer = createFakeTimer();
  const scheduler = createPauseAwareScheduler(timer);
  let runs = 0;

  scheduler.schedule(() => runs++, 760);
  timer.advance(300);
  scheduler.pause();
  timer.advance(2_000);

  assert.equal(runs, 0);
  scheduler.resume();
  timer.advance(0);
  timer.advance(2_000);
  assert.equal(runs, 1);
});

test('an action scheduled while paused waits for resume', () => {
  const timer = createFakeTimer();
  const scheduler = createPauseAwareScheduler(timer);
  let runs = 0;

  scheduler.pause();
  scheduler.schedule(() => runs++, 120);
  timer.advance(1_000);
  assert.equal(runs, 0);

  scheduler.resume();
  timer.advance(0);
  assert.equal(runs, 1);
});

test('rescheduling while paused keeps only the latest action', () => {
  const timer = createFakeTimer();
  const scheduler = createPauseAwareScheduler(timer);
  const runs: string[] = [];

  scheduler.pause();
  scheduler.schedule(() => runs.push('stale'), 760);
  scheduler.schedule(() => runs.push('current'), 120);
  scheduler.resume();
  timer.advance(0);

  assert.deepEqual(runs, ['current']);
});

test('cancelling a deferred action prevents it from running on resume', () => {
  const timer = createFakeTimer();
  const scheduler = createPauseAwareScheduler(timer);
  let runs = 0;

  scheduler.schedule(() => runs++, 760);
  scheduler.pause();
  scheduler.cancel();
  scheduler.resume();
  timer.advance(2_000);

  assert.equal(runs, 0);
});
