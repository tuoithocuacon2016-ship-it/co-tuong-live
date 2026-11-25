/**
 * Per-caller budgets for the endpoints that spend real money.
 *
 * `/api/commentary`, `/api/parse-move`, `/api/live-reply` and `/api/tts` are called by the browser
 * and every call is a billed Gemini request. They used to be open to anyone who can reach the URL,
 * so one visitor with a loop was enough to run up the month's quota - and the site is public, so
 * "visitors" include scanners. This is a token bucket per (endpoint, caller): a burst is allowed,
 * sustained hammering is not.
 *
 * Deliberately in-memory and per-process: a show runs one server, and losing a few tokens on a
 * mid-broadcast restart is fine. It is a cost ceiling, not an identity system - it does not know
 * who is honest, only how fast each caller may go.
 */

export interface BucketSpec {
  /** Largest burst a caller may fire at once. */
  capacity: number;
  /** Tokens trickled back per minute; the sustainable rate. */
  refillPerMinute: number;
}

export interface BucketState {
  tokens: number;
  /** Millisecond timestamp of the last refill. */
  updatedAt: number;
}

export interface BudgetDecision {
  allowed: boolean;
  /** Whole milliseconds until the next token lands; 0 when allowed. */
  retryAfterMs: number;
  /** Tokens left after this call, rounded down. */
  remaining: number;
}

/** Budgets tuned for one operator driving one live show, not for a public API. */
export const ENDPOINT_BUDGETS: Record<string, BucketSpec> = {
  // One line per played move; a fast bullet segment still stays under 10/min.
  commentary: { capacity: 12, refillPerMinute: 10 },
  // Voice and chat parsing fire on viewer messages, the busiest of the four.
  parseMove: { capacity: 30, refillPerMinute: 20 },
  // Spotlight replies are hand-picked by the host, so they are rare by design.
  liveReply: { capacity: 10, refillPerMinute: 6 },
  // Audio is the priciest call per token.
  tts: { capacity: 12, refillPerMinute: 10 },
};

/**
 * Token counts come from elapsed-ms division, so a bucket that has just refilled to exactly one
 * token can land at 0.9999999999999999. Without this the advertised Retry-After window would
 * sometimes still be denied, which is the one promise a limiter must not break.
 */
const TOKEN_EPSILON = 1e-6;

/** Moves a bucket forward in time. Never mutates, so a rejected call leaves no stale timestamp. */
export function refillBucket(state: BucketState, spec: BucketSpec, now: number): BucketState {
  const elapsedMs = Math.max(0, now - state.updatedAt);
  if (elapsedMs === 0) return state;
  return {
    tokens: Math.min(spec.capacity, state.tokens + (elapsedMs / 60_000) * spec.refillPerMinute),
    updatedAt: now,
  };
}

/**
 * Spend `cost` tokens. The refilled bucket comes back whether or not the spend succeeded, so the
 * caller can store it: time passes either way, and a rejection must not freeze the clock.
 */
export function spendBucket(
  state: BucketState | undefined,
  spec: BucketSpec,
  now: number,
  cost = 1,
): { decision: BudgetDecision; state: BucketState } {
  const fresh = refillBucket(state ?? { tokens: spec.capacity, updatedAt: now }, spec, now);

  if (fresh.tokens + TOKEN_EPSILON < cost) {
    const msPerToken = 60_000 / Math.max(spec.refillPerMinute, 1e-9);
    return {
      decision: {
        allowed: false,
        retryAfterMs: Math.ceil((cost - fresh.tokens) * msPerToken),
        remaining: Math.floor(fresh.tokens),
      },
      state: fresh,
    };
  }

  const left = Math.max(0, fresh.tokens - cost);
  return {
    decision: { allowed: true, retryAfterMs: 0, remaining: Math.floor(left) },
    state: { tokens: left, updatedAt: now },
  };
}

export interface BudgetLedger {
  /** Unknown endpoints are let through: this meters what is registered, it is not a route table. */
  check(endpoint: string, caller: string, now: number, cost?: number): BudgetDecision;
  /** Drops buckets already refilled to the top, so the map cannot grow across a long night. */
  prune(now: number): number;
  size(): number;
}

export function createBudgetLedger(
  budgets: Record<string, BucketSpec> = ENDPOINT_BUDGETS,
): BudgetLedger {
  const buckets = new Map<string, { spec: BucketSpec; state: BucketState }>();

  return {
    check(endpoint, caller, now, cost = 1) {
      const spec = budgets[endpoint];
      if (!spec) {
        return { allowed: true, retryAfterMs: 0, remaining: Number.POSITIVE_INFINITY };
      }

      const key = `${endpoint}|${caller}`;
      const entry = buckets.get(key);
      // A cost above capacity could never be earned back, so an unchecked value would lock this
      // caller out of the endpoint for the rest of the night. Clamp: the worst a call may do is
      // drain the bucket.
      const effectiveCost = Math.min(Math.max(cost, 0), spec.capacity);
      const { decision, state } = spendBucket(entry?.state, spec, now, effectiveCost);
      buckets.set(key, { spec, state });
      return decision;
    },
    prune(now) {
      let dropped = 0;
      for (const [key, entry] of buckets) {
        const full = refillBucket(entry.state, entry.spec, now);
        if (full.tokens >= entry.spec.capacity - TOKEN_EPSILON) {
          buckets.delete(key);
          dropped += 1;
        } else {
          buckets.set(key, { spec: entry.spec, state: full });
        }
      }
      return dropped;
    },
    size() {
      return buckets.size;
    },
  };
}

/**
 * The caller half of a bucket key.
 *
 * `req.ip` is only the visitor's address when the server faces the internet directly. Behind a
 * reverse proxy every request arrives from the proxy, so one shared bucket would throttle the
 * whole audience on the strength of a few scanners - which is worse than no limit at all. The
 * `X-Forwarded-For` header is only read when the operator says a proxy is there, because that
 * header is caller-supplied and trusting it by default hands the key to the attacker.
 */
export function callerKey(req: {
  ip?: string;
  socket?: { remoteAddress?: string };
  get(name: string): string | undefined;
}, trustProxy: boolean): string {
  if (trustProxy) {
    const chain = req.get('x-forwarded-for');
    const first = chain?.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.ip ?? req.socket?.remoteAddress ?? 'unknown-caller';
}
