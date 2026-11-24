/**
 * Actor identity for live chat.
 *
 * A TikTok handle is display text that the viewer chooses: the relay forwards
 * `uniqueId` / `nickname` straight from its own session config, and two accounts
 * can register the same one. So "is this message from the seated player?" cannot
 * be answered by comparing names - see `reserveActorId` for what happens when it
 * is (a lookalike inherits the seat and can move for the challenger).
 *
 * An actor id is minted by whoever RECEIVES the message, never taken from the
 * message itself:
 *   `actor:<handle>` - the ingest server (TikFinity / TikTokLive relay / OBS script)
 *   `local:<handle>` - this browser only (Studio panel, test events, quick match)
 *
 * Both are unforgeable over the wire: the server builds the id itself and strips
 * control characters from handles, so a remote viewer cannot inject the `:` that
 * a `local:` prefix needs. `isLocalActor` is therefore only ever true for the
 * operator's own machine.
 */

const HANDLE_MAX_LEN = 40;
const DEFAULT_HANDLE = 'Khách TikTok';

export type ActorSource = 'relay' | 'local';

/**
 * The ingest token, or undefined when live ingest must stay closed.
 *
 * A placeholder read straight from `.env.example` is guessable from this public
 * repo, so it counts as "not configured" and the endpoints answer 503 rather
 * than behaving as an open microphone.
 */
export function resolveIngestToken(raw: string | undefined): string | undefined {
  const trimmed = (raw ?? '').trim();
  if (!trimmed || trimmed.startsWith('CHANGE_ME')) return undefined;
  return trimmed;
}

/** Trim, drop control characters, and cap the length of a viewer-chosen handle. */
export function sanitizeHandle(raw: unknown, fallback: string = DEFAULT_HANDLE): string {
  if (typeof raw !== 'string') return fallback;
  const cleaned = raw.replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, HANDLE_MAX_LEN);
  return cleaned || fallback;
}

export function actorIdFor(source: ActorSource, handle: string): string {
  // Normalizing the `@` here as well means the Studio panel and the relay agree:
  // an operator who types "KiemKhach" and a seeded seat named "@KiemKhach" are
  // the same actor, which is the only reason the panel can still move.
  return `${source === 'local' ? 'local:' : 'actor:'}${displayHandle(handle.trim()).toLowerCase()}`;
}

export function isLocalActor(actorId: string): boolean {
  return actorId.startsWith('local:');
}

/**
 * TikTok uniqueIds carry no leading `@`, the board shows handles with one. Both
 * ingest routes normalize before minting, or the same viewer arriving via
 * `/api/live/chat` and via `/api/live/webhook` would be two different actors.
 */
export function displayHandle(handle: string): string {
  return handle.startsWith('@') ? handle : `@${handle}`;
}

/** The bare handle an actor id was minted from (used when no display name was sent). */
export function actorHandle(actorId: string): string {
  return actorId.replace(/^(?:actor|local):/, '');
}

/**
 * Give a handle an id, keeping ids 1:1 with the exact handles seen.
 *
 * `owners` is owned by the receiver (the server keeps one per relay). A second
 * account whose handle differs - "Foo" next to already-seated "foo" - gets its own
 * id instead of inheriting the seat; repeat messages from the same account keep
 * the id they were given.
 */
export function reserveActorId(
  handle: string,
  owners: Map<string, string>,
  source: ActorSource = 'relay',
): string {
  // No eviction, deliberately: dropping an entry would give the base id to the
  // next account that claims the same handle in a different case, which is the
  // seat takeover this exists to prevent. The cost is two short strings per
  // handle seen during the show.
  const base = actorIdFor(source, handle);
  const existing = owners.get(base);
  if (existing === undefined) {
    owners.set(base, handle);
    return base;
  }
  if (existing === handle) return base;
  for (let n = 2; ; n += 1) {
    const candidate = `${base}#${n}`;
    const owner = owners.get(candidate);
    if (owner === undefined) {
      owners.set(candidate, handle);
      return candidate;
    }
    if (owner === handle) return candidate;
  }
}
