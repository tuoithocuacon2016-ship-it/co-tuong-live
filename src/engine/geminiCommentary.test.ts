import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGeminiCommentaryItem,
  buildGeminiTacticalRead,
  normalizeGeminiCommentaryResponse,
} from './geminiCommentary';

test('Gemini cannot replace an engine-verified motif or phase label', () => {
  const item = buildGeminiCommentaryItem(
    {
      motif: 'Song Xa Thác',
      phaseLabel: 'Đêm sai lệch',
      line: 'Ái chà... thế cờ này thiếp đọc được rồi!',
      emotion: 'fierce',
      gesture: 'tease',
      stageDirection: 'Khẽ nâng quạt',
    },
    {
      id: 'gem_test',
      moveNumber: 12,
      actor: 'Kỳ Ma Điêu Nguyệt',
      notation: 'M2 tiến 3',
      motif: 'Điếu Ngư Mã',
      phaseLabel: 'Hồi II · Trung Cuộc',
    },
  );

  assert.ok(item);
  assert.equal(item.motif, 'Điếu Ngư Mã');
  assert.equal(item.phaseLabel, 'Hồi II · Trung Cuộc');
  assert.equal(item.source, 'gemini');
  assert.equal(item.mood, 'fierce');
});

test('an unverified ply stays unnamed even when Gemini invents a pattern', () => {
  const payload = normalizeGeminiCommentaryResponse(
    { motif: 'Bát Hoàng Mã', line: 'Hì hì... xem ta đây!', emotion: 'calm' },
    { motif: '', phaseLabel: 'Hồi I · Khai Cuộc' },
  );

  assert.ok(payload);
  assert.equal(payload.motif, '');
  assert.equal(payload.phaseLabel, 'Hồi I · Khai Cuộc');
});

test('response normalization keeps only safe display fields and known performance cues', () => {
  const payload = normalizeGeminiCommentaryResponse(
    {
      line: '  Ồ! <b>Không</b>   ngờ...\n chàng lại hở sườn.  ',
      emotion: 'invented',
      gesture: 'invented',
      stageDirection: '<i>Nhìn bàn cờ</i>',
    },
    { motif: 'Kiếm Khí Chiếu Tướng', phaseLabel: '' },
  );

  assert.ok(payload);
  assert.equal(payload.line, 'Ồ! Không ngờ... chàng lại hở sườn.');
  assert.equal(payload.emotion, 'calm');
  assert.equal(payload.emotionLabel, 'Điềm tĩnh');
  assert.equal(payload.gesture, 'closeup_talk');
  assert.equal(payload.stageDirection, 'Nhìn bàn cờ');
  assert.equal(payload.phaseLabel, undefined);
  assert.equal(normalizeGeminiCommentaryResponse({ line: '   ' }, { motif: '', phaseLabel: '' }), null);
});

test('Gemini tactical copy never praises or blames the guest for a Black ply', () => {
  const base = {
    side: 'black' as const,
    inCheck: false,
    isGameOver: false,
    winProbRed: 50,
    guestGender: 'nam' as const,
    guestAge: 26,
  };

  for (const scoreDeltaForRed of [120, -120]) {
    const read = buildGeminiTacticalRead({
      ...base,
      tacticalEvent: 'comeback_player',
      scoreDeltaForRed,
    });
    assert.doesNotMatch(read, /xuất thần|hở sườn|lật kèo/i);
  }

  assert.match(
    buildGeminiTacticalRead({ ...base, scoreDeltaForRed: 120, winProbRed: 70 }),
    /Chàng đang ép sân/,
  );
  assert.match(
    buildGeminiTacticalRead({ ...base, scoreDeltaForRed: -120, winProbRed: 30 }),
    /thiếp đang chiếm thượng phong/,
  );
});

test('Gemini tactical copy keeps Red praise, blunder, and comeback wording unchanged', () => {
  const base = {
    side: 'red' as const,
    inCheck: false,
    isGameOver: false,
    winProbRed: 50,
    guestGender: 'nam' as const,
    guestAge: 26,
  };

  assert.match(
    buildGeminiTacticalRead({ ...base, scoreDeltaForRed: 120 }),
    /nước cờ xuất thần/,
  );
  assert.match(
    buildGeminiTacticalRead({ ...base, scoreDeltaForRed: -120 }),
    /đi hơi vội vàng để hở sườn/,
  );
  assert.match(
    buildGeminiTacticalRead({
      ...base,
      scoreDeltaForRed: 140,
      tacticalEvent: 'comeback_player',
    }),
    /LẬT KÈO/,
  );
});
