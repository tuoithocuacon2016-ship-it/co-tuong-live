import assert from 'node:assert/strict';
import test from 'node:test';
import {
  UNATTRIBUTED_ACTOR_ID,
  actorHandle,
  actorIdFor,
  displayHandle,
  isLocalActor,
  reserveActorId,
  resolveIngestToken,
  sanitizeHandle,
} from './liveIdentity';
import { createChallenger, enqueueChallenger } from './matchmaker';
import { matchGuestCharacter } from '../data/characters';

const CTRL = String.fromCharCode(0);
const CRLF = String.fromCharCode(13, 10);

test('ingest is closed unless a real token is configured', () => {
  assert.equal(resolveIngestToken(undefined), undefined);
  assert.equal(resolveIngestToken('   '), undefined);
  assert.equal(
    resolveIngestToken('CHANGE_ME_generate_your_own'),
    undefined,
    'the .env.example placeholder is public in this repo, so it must not count',
  );
  assert.equal(resolveIngestToken('  s3cret-value  '), 's3cret-value');
});

test('a handle is display text: control characters are stripped, length capped', () => {
  assert.equal(sanitizeHandle(`  @Ao${CTRL}Ngoc${CRLF}Nghe  `), '@AoNgocNghe');
  assert.equal(sanitizeHandle(undefined), 'Khách TikTok');
  assert.equal(sanitizeHandle('    '), 'Khách TikTok');
  assert.equal(sanitizeHandle('x'.repeat(120)).length, 40);
});

test('relay and local actors live in separate id namespaces', () => {
  assert.equal(actorIdFor('relay', '@KiemKhach_VN'), 'actor:@kiemkhach_vn');
  assert.equal(actorIdFor('local', '@KiemKhach_VN'), 'local:@kiemkhach_vn');
  assert.equal(isLocalActor(actorIdFor('local', '@a')), true);
  assert.equal(isLocalActor(actorIdFor('relay', '@a')), false);
});

test('a handle cannot forge an id prefix, because the prefix wraps around it', () => {
  const id = actorIdFor('relay', 'local:@KiemKhach_VN');
  assert.equal(id, 'actor:@local:@kiemkhach_vn');
  assert.equal(isLocalActor(id), false, 'a relay viewer is never the local operator');
});

test('the Studio panel and a seeded seat agree whether or not an @ was typed', () => {
  assert.equal(actorIdFor('local', 'KiemKhach_VN'), actorIdFor('local', '@KiemKhach_VN'));
  assert.equal(actorIdFor('relay', 'KiemKhach_VN'), actorIdFor('relay', '@KiemKhach_VN'));
});

test('two accounts whose handles differ only in case never share an actor id', () => {
  // Case-folding is what makes an id stable for one account, but "Foo" and
  // "foo" are two accounts: the later claimant must not inherit the seated one.
  const owners = new Map<string, string>();
  const seated = reserveActorId('@Foo', owners);
  assert.equal(seated, 'actor:@foo');
  assert.equal(reserveActorId('@Foo', owners), seated, 'same account keeps its id');
  const lookalike = reserveActorId('@foo', owners);
  assert.equal(lookalike, 'actor:@foo#2');
  assert.notEqual(lookalike, seated, 'a lookalike must not reuse the seated id');
  assert.equal(reserveActorId('@foo', owners), lookalike, 'and stays on its own id');
});

test('actorHandle and displayHandle round-trip a handle', () => {
  assert.equal(displayHandle('TieuYenNhi'), '@TieuYenNhi');
  assert.equal(displayHandle('@TieuYenNhi'), '@TieuYenNhi');
  assert.equal(actorHandle('actor:@tieu yen nhi'), '@tieu yen nhi');
  assert.equal(actorHandle('local:@x'), '@x');
});

test('the challenger queue is keyed by actor, not by claimed name', () => {
  const seated = createChallenger('@KiemKhach_VN', 'local:@kiemkhach_vn', 'nam', 26);
  const relayLookalike = createChallenger(
    '@KiemKhach_VN',
    'actor:@kiemkhach_vn',
    'nam',
    31,
    matchGuestCharacter('nam', 31),
  );

  // A relay message that named itself after the seated player used to be able
  // to move that player pieces, so the two identities must stay separate.
  assert.notEqual(seated.actorId, relayLookalike.actorId);
  assert.equal(enqueueChallenger([seated], relayLookalike).length, 2);

  const again = enqueueChallenger([seated, relayLookalike], seated);
  assert.equal(again.length, 2, 'the same actor updates its own entry');
  assert.equal(again.find((q) => q.actorId === seated.actorId)?.age, 26);
});

test('an unattributed message is a stranger, and no handle can be one', () => {
  // The receiver's fallback when a message carries no id. It has to be a value that minting can
  // never produce, or "we could not establish the sender" quietly becomes "the sender is whoever
  // this handle looks like" - which is the seat takeover this module exists to stop.
  const lookalikes = ['unattributed', '@unattributed', '  unattributed  ', '@UNATTRIBUTED'];
  for (const handle of lookalikes) {
    for (const source of ['relay', 'local'] as const) {
      assert.notEqual(
        actorIdFor(source, handle),
        UNATTRIBUTED_ACTOR_ID,
        `${source}:${handle} must not be able to name itself unattributed`,
      );
    }
  }

  const owners = new Map<string, string>();
  assert.notEqual(reserveActorId('@unattributed', owners), UNATTRIBUTED_ACTOR_ID);
  assert.notEqual(
    UNATTRIBUTED_ACTOR_ID,
    actorIdFor('relay', '@KiemKhach_VN'),
    'a stranger never matches the seated player',
  );
  assert.equal(isLocalActor(UNATTRIBUTED_ACTOR_ID), false, 'a stranger is never the operator');
});
