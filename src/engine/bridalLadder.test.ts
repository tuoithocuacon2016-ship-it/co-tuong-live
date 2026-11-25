import assert from 'node:assert/strict';
import test from 'node:test';
import type { KillPatternId } from './patterns';
import {
  BridalLadder,
  DOWRY_LAYERS,
  LADDER_STORAGE_KEY,
  initialLadder,
  isHeld,
  layerById,
  loadLadder,
  lostLayers,
  ladderStep,
  parseLadder,
  saveLadder,
  serializeLadder,
  forfeitForPattern,
  forfeitCandle,
  shouldForfeitForPattern,
} from './bridalLadder';

function fakeStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
  };
}

test('A fresh bride holds the whole dowry, cheapest first', () => {
  const ladder = initialLadder();
  assert.equal(ladderStep(ladder), 0);
  assert.deepEqual(lostLayers(ladder), []);
  assert.equal(ladder.held.length, DOWRY_LAYERS.length);
  assert.equal(layerById('qua_tay_lua').rank, 1);
  assert.equal(layerById('nen_hoa_chuc').rank, 6);
});

test('The four documented strikes cost exactly the layer the plan names', () => {
  const start = initialLadder();
  assert.equal(forfeitForPattern(start, 'bach_kiem_tuong').lost?.id, 'kieng_hoi_mon');
  assert.equal(forfeitForPattern(start, 'be_cung').lost?.id, 'kieng_hoi_mon');
  assert.equal(forfeitForPattern(start, 'ngo_tao_ma').lost?.id, 'mu_phuong');
  assert.equal(forfeitForPattern(start, 'thiet_mon_thuyen').lost?.id, 'hai_theu');
  assert.equal(forfeitForPattern(start, 'dai_dao_hoach_tam').lost?.id, 'ao_choang');
});

test('a checking pattern still costs its layer when it ends the game, but a draw does not', () => {
  assert.equal(shouldForfeitForPattern(true, 'red', 'playing'), true);
  assert.equal(shouldForfeitForPattern(true, 'red', 'red_win'), true);
  assert.equal(shouldForfeitForPattern(true, 'red', 'draw'), false);
  assert.equal(shouldForfeitForPattern(true, 'red', 'black_win'), false);
  assert.equal(shouldForfeitForPattern(false, 'red', 'red_win'), false);
  assert.equal(shouldForfeitForPattern(true, 'black', 'red_win'), false);
});

test('A strike already cashed in takes the next dearer layer instead of nothing', () => {
  const once = forfeitForPattern(initialLadder(), 'ngo_tao_ma').ladder;
  assert.equal(isHeld(once, 'mu_phuong'), false);
  const twice = forfeitForPattern(once, 'ngo_tao_ma');
  assert.equal(twice.lost?.id, 'hai_theu', 'the crown is gone, so the slippers pay');
  const thrice = forfeitForPattern(twice.ladder, 'ngo_tao_ma');
  assert.equal(thrice.lost?.id, 'ao_choang');
});

test('A cheap strike cannot touch the dearer layers still on the table', () => {
  const stripped = forfeitForPattern(initialLadder(), 'dai_dao_hoach_tam').ladder;
  assert.equal(isHeld(stripped, 'ao_choang'), false);
  const fan = forfeitForPattern(stripped, 'khong_dau_phao');
  assert.equal(fan.lost?.id, 'qua_tay_lua', 'rank 1 is still held, so the fan pays');
  assert.equal(isHeld(fan.ladder, 'kieng_hoi_mon'), true);
});

test('The wedding candle is never a pattern prize', () => {
  const heavyStrikes: KillPatternId[] = [
    'dai_dao_hoach_tam',
    'phao_nan_dan_sa',
    'song_xa_thac',
    'bat_hoang_ma',
    'tam_tu_quy_bien',
  ];
  let ladder = initialLadder();
  for (const pattern of heavyStrikes) ladder = forfeitForPattern(ladder, pattern).ladder;
  assert.equal(isHeld(ladder, 'ao_choang'), false, 'the robe pays for the first heavy strike');
  assert.equal(isHeld(ladder, 'nen_hoa_chuc'), true, 'no kill pattern reaches rank 6');
  assert.equal(ladderStep(ladder), 1, 'five heavy strikes still cost only one layer');

  const snuffed = forfeitCandle(ladder);
  assert.equal(snuffed.lost?.id, 'nen_hoa_chuc', 'losing the game puts the candle out');
  assert.equal(forfeitCandle(snuffed.ladder).lost, null, 'there is no second candle');
});

test('Ladder survives a reload, and a corrupt entry resets to a full dowry', () => {
  const storage = fakeStorage();
  const stripped = forfeitForPattern(initialLadder(), 'ngo_tao_ma').ladder;
  saveLadder(storage, stripped);
  assert.equal(storage.map.get(LADDER_STORAGE_KEY), serializeLadder(stripped));
  assert.deepEqual(loadLadder(storage), stripped);
  assert.equal(ladderStep(loadLadder(storage)), 1);

  assert.equal(parseLadder('mu_phuong,not_a_layer'), null);
  assert.equal(parseLadder('mu_phuong,mu_phuong'), null);
  assert.deepEqual(loadLadder(fakeStorage({ [LADDER_STORAGE_KEY]: 'garbage' })), initialLadder());
  assert.deepEqual(loadLadder(undefined), initialLadder());

  const bare: BridalLadder = { held: [] };
  saveLadder(storage, bare);
  assert.deepEqual(loadLadder(storage), bare, 'an emptied dowry is a legal saved state');
});
