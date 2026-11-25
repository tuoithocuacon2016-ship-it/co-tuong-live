import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ENDPOINT_BUDGETS,
  callerKey,
  createBudgetLedger,
  refillBucket,
  spendBucket,
} from './requestBudget';

const T0 = 1_700_000_000_000;
const MINUTE = 60_000;

test('a caller may burst, then gets a wait that really does shrink at the refill rate', () => {
  const spec = { capacity: 3, refillPerMinute: 6 };
  const ledger = createBudgetLedger({ demo: spec });

  for (let i = 0; i < 3; i++) {
    assert.equal(ledger.check('demo', '1.2.3.4', T0).allowed, true, `burst ${i + 1} must pass`);
  }

  const denied = ledger.check('demo', '1.2.3.4', T0);
  assert.equal(denied.allowed, false, 'the fourth call in a burst is over budget');
  // 6/min = one token every 10s, and the bucket is empty.
  assert.equal(denied.retryAfterMs, 10_000);

  // Waiting a full retry window must be enough - that is the promise Retry-After makes.
  assert.equal(ledger.check('demo', '1.2.3.4', T0 + denied.retryAfterMs).allowed, true);
});

test('idle time banks tokens but never above the burst ceiling', () => {
  const spec = { capacity: 5, refillPerMinute: 10 };
  const drained = { tokens: 0, updatedAt: T0 };

  assert.equal(refillBucket(drained, spec, T0 + 3 * MINUTE).tokens, spec.capacity);
  assert.equal(refillBucket(drained, spec, T0 + 60 * MINUTE).tokens, spec.capacity);

  const ledger = createBudgetLedger({ demo: spec });
  for (let i = 0; i < 5; i++) ledger.check('demo', 'a', T0);
  // Six minutes of silence must not buy a 60-token war chest.
  for (let i = 0; i < 5; i++) {
    assert.equal(ledger.check('demo', 'a', T0 + 6 * MINUTE).allowed, true);
  }
  assert.equal(ledger.check('demo', 'a', T0 + 6 * MINUTE).allowed, false);
});

test('buckets are per caller and per endpoint', () => {
  const spec = { capacity: 1, refillPerMinute: 1 };
  const ledger = createBudgetLedger({ tts: spec, commentary: spec });

  assert.equal(ledger.check('tts', 'guest-one', T0).allowed, true);
  assert.equal(ledger.check('tts', 'guest-two', T0).allowed, true, 'a slow guest is not punished');
  assert.equal(ledger.check('tts', 'guest-one', T0).allowed, false);
  assert.equal(
    ledger.check('commentary', 'guest-one', T0).allowed,
    true,
    'spending on one endpoint must not drain another',
  );
});

test('a rejected call still advances the clock', () => {
  const spec = { capacity: 1, refillPerMinute: 6 };
  const ledger = createBudgetLedger({ demo: spec });

  ledger.check('demo', 'a', T0);
  for (let i = 0; i < 20; i++) {
    assert.equal(ledger.check('demo', 'a', T0 + 1_000).allowed, false);
  }
  // If rejections froze updatedAt, the second would never refill and this would stay false.
  assert.equal(ledger.check('demo', 'a', T0 + MINUTE).allowed, true);
});

test('an unaffordable cost drains the bucket instead of locking the caller out forever', () => {
  const spec = { capacity: 2, refillPerMinute: 12 };
  // cost 9 > capacity 2: nothing the caller can ever wait for.
  const first = spendBucket({ tokens: 1, updatedAt: T0 }, spec, T0, 9);
  assert.equal(first.decision.allowed, false);
  assert.ok(
    Number.isFinite(first.decision.retryAfterMs) && first.decision.retryAfterMs > 0,
    'the wait must be finite, or the endpoint is dead for this caller',
  );

  const ledger = createBudgetLedger({ demo: spec });
  ledger.check('demo', 'a', T0, 9);
  assert.equal(
    ledger.check('demo', 'a', T0 + MINUTE).allowed,
    true,
    'a minute of refill has to be enough again',
  );
});

test('endpoints with no budget are let through untouched', () => {
  const ledger = createBudgetLedger({ demo: { capacity: 1, refillPerMinute: 1 } });
  for (let i = 0; i < 50; i++) {
    assert.equal(ledger.check('health', 'a', T0).allowed, true);
  }
  assert.equal(ledger.size(), 0, 'an unmetered endpoint must not create a bucket');
});

test('prune forgets callers who have fully recovered, keeps the ones still in debt', () => {
  const spec = { capacity: 4, refillPerMinute: 6 };
  const ledger = createBudgetLedger({ demo: spec });

  // 3 tokens left: one 10s tick buys it back to full.
  ledger.check('demo', 'gone', T0);
  // 0 tokens left: one 10s tick only buys 1, so it is still in debt.
  for (let i = 0; i < 4; i++) ledger.check('demo', 'still-in-debt', T0);

  assert.equal(ledger.size(), 2);
  assert.equal(ledger.prune(T0 + 10_000), 1);
  assert.equal(ledger.size(), 1, 'a caller still spending must keep its debt');
  assert.equal(ledger.check('demo', 'still-in-debt', T0 + MINUTE).allowed, true);
});

test('the shipped budgets are a show rate, not an API rate', () => {
  assert.deepEqual(Object.keys(ENDPOINT_BUDGETS), ['commentary', 'parseMove', 'liveReply', 'tts']);
  for (const [name, spec] of Object.entries(ENDPOINT_BUDGETS)) {
    assert.ok(spec.capacity >= 1 && Number.isInteger(spec.capacity), `${name} capacity`);
    assert.ok(spec.refillPerMinute >= 1, `${name} must refill at a usable rate`);
    assert.ok(
      spec.refillPerMinute <= 30 && spec.capacity <= 30,
      `${name} is priced like a public API, not one live show`,
    );
  }
});

test('the caller key only believes X-Forwarded-For when a proxy was declared', () => {
  const spoofed = {
    ip: '203.0.113.9',
    socket: { remoteAddress: '203.0.113.9' },
    get: (name: string) => (name === 'x-forwarded-for' ? '198.51.100.7, 10.0.0.1' : undefined),
  };

  assert.equal(
    callerKey(spoofed, false),
    '203.0.113.9',
    'without a declared proxy the header is just attacker-controlled text',
  );
  assert.equal(callerKey(spoofed, true), '198.51.100.7', 'behind a proxy the first hop is the caller');

  const direct = { ip: undefined, socket: {}, get: () => undefined };
  assert.equal(callerKey(direct, true), 'unknown-caller');
});
