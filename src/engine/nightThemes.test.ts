import assert from 'node:assert/strict';
import test from 'node:test';
import { applyHandicap } from './handicap';
import { createInitialBoard, generateLegalMoves, makeMove } from './xiangqi';
import type { BoardState, Move } from './xiangqi';
import { formatMoveVietnamese } from './notation';
import { analyzePosition } from './ai';
import { forfeitForPattern, initialLadder, layerById, type BridalLadder } from './bridalLadder';
import { COMMENTARY_TOKENS } from './commentaryBank';
import { buildNightTeaseScript } from './livePerformance';
import {
  NIGHT_COUNT,
  NIGHT_THEMES,
  NIGHT_TOKENS,
  NightBookPly,
  NightTheme,
  buildNightPromptFacts,
  buildNightPromptState,
  detectRedOpeningShape,
  nightBookFavour,
  nightIndexFromDate,
  nightDowryStatus,
  nightThemeByIndex,
  resolveNightTheme,
} from './nightThemes';

const sameSquare = (a: { row: number; col: number }, b: { row: number; col: number }): boolean =>
  a.row === b.row && a.col === b.col;

/** Red's four first-ply families, for checking that a night stays out of the others' way. */
const OTHER_RED_OPENINGS: NightBookPly[] = [
  { side: 'red', type: 'cannon', from: { row: 7, col: 7 }, to: { row: 7, col: 4 }, notation: 'P2 bình 5' },
  { side: 'red', type: 'horse', from: { row: 9, col: 7 }, to: { row: 7, col: 6 }, notation: 'M2 tiến 3' },
  { side: 'red', type: 'soldier', from: { row: 6, col: 2 }, to: { row: 5, col: 2 }, notation: 'B7 tiến 1' },
  { side: 'red', type: 'elephant', from: { row: 9, col: 6 }, to: { row: 7, col: 4 }, notation: 'T3 tiến 5' },
];

/** Plays the night's four book plies on the real board, in order. */
function replayBookLine(theme: NightTheme) {
  let board = createInitialBoard();
  const plies: NightBookPly[] = [
    theme.invite,
    theme.answer,
    theme.bridge,
    theme.follow,
  ];
  for (const ply of plies) {
    const legal = generateLegalMoves(board.grid, ply.side).find(
      (m) =>
        sameSquare(m.from, ply.from) &&
        sameSquare(m.to, ply.to) &&
        m.piece.side === ply.side &&
        m.piece.type === ply.type,
    );
    assert.ok(
      legal,
      `${theme.nameVi}: ${ply.notation} (${ply.side} ${ply.type} ` +
        `${ply.from.row},${ply.from.col}->${ply.to.row},${ply.to.col}) is not a legal ply here`,
    );
    assert.equal(
      formatMoveVietnamese(board.grid, legal),
      ply.notation,
      `${theme.nameVi}: the notation on file does not match what the board produces`,
    );
    board = makeMove(board, legal);
  }
  return board;
}

function renderedNightLines(theme: NightTheme, board: BoardState, ladder: BridalLadder): string[] {
  return Array.from({ length: theme.teases.length }, (_, seed) =>
    buildNightTeaseScript({
      night: theme,
      board,
      ladder,
      challengerName: '@KiemKhach_VN',
      guestGender: 'nam',
      guestAge: 26,
      seed,
    }).line,
  );
}

test('six nights, six dowry layers, one asset set each', () => {
  assert.equal(NIGHT_THEMES.length, NIGHT_COUNT);
  assert.deepEqual(
    NIGHT_THEMES.map((theme) => theme.index),
    [1, 2, 3, 4, 5, 6],
  );
  assert.equal(new Set(NIGHT_THEMES.map((theme) => theme.nameVi)).size, NIGHT_COUNT);
  assert.equal(new Set(NIGHT_THEMES.map((theme) => theme.headlineLayer)).size, NIGHT_COUNT);

  const assets = NIGHT_THEMES.flatMap((theme) => [...theme.assets]);
  assert.equal(new Set(assets).size, assets.length, 'every night needs its own renders');
  for (const theme of NIGHT_THEMES) {
    assert.equal(theme.assets.length, 3, `${theme.nameVi} must spec stage, look and overlay`);
    assert.equal(theme.teases.length, 6, `${theme.nameVi} needs six night-specific lines`);
  }
});

test('the book lines are legal and the Vietnamese notation is what the board says', () => {
  for (const theme of NIGHT_THEMES) {
    replayBookLine(theme);
  }
});

test('each night opens the door the shape it claims to answer', () => {
  assert.equal(
    detectRedOpeningShape(createInitialBoard().grid),
    'bat_ky',
    'the starting position must not be claimed as any night',
  );
  for (const theme of NIGHT_THEMES) {
    assert.equal(
      detectRedOpeningShape(replayInvite(theme).grid),
      theme.shape,
      `${theme.nameVi} invites ${theme.invite.notation} but that position reads as another shape`,
    );
  }
});

test('the night headline names the layer its focus pattern actually takes', () => {
  for (const theme of NIGHT_THEMES) {
    const strike = forfeitForPattern(initialLadder(), theme.focusPattern);
    assert.ok(strike.lost, `${theme.nameVi}: ${theme.focusPattern} must forfeit something`);
    const patternRank = layerById(strike.lost.id).rank;

    if (theme.index === NIGHT_COUNT) {
      // The finale stakes the candle, which no pattern may prize: the focus pattern still only
      // takes the layer it is worth, and the night promises dearer than that.
      assert.equal(theme.headlineLayer, 'nen_hoa_chuc');
      assert.ok(patternRank < 6, `${theme.nameVi} cannot stake the candle on a pattern`);
    } else {
      assert.equal(
        strike.lost.id,
        theme.headlineLayer,
        `${theme.nameVi}: ${theme.focusPattern} takes ${strike.lost.id}, not the advertised layer`,
      );
    }
  }
});

test('the HUD names the dowry layer tonight hangs, and notices when it changes hands', () => {
  for (const theme of NIGHT_THEMES) {
    const held = nightDowryStatus(theme, initialLadder());
    assert.equal(held.layerNameVi, layerById(theme.headlineLayer).nameVi);
    assert.equal(held.held, true);
    assert.equal(held.labelVi, `Treo ${held.layerNameVi}`);

    const stripped: BridalLadder = {
      held: initialLadder().held.filter((id) => id !== theme.headlineLayer),
    };
    const lost = nightDowryStatus(theme, stripped);
    assert.equal(lost.held, false);
    assert.equal(lost.labelVi, `Đã giao ${held.layerNameVi}`);
  }
});

test('the book is favoured only in the position it was written for', () => {
  for (const theme of NIGHT_THEMES) {
    const afterInvite = replayInvite(theme);
    assert.deepEqual(nightBookFavour(theme, afterInvite), [
      { from: theme.answer.from, to: theme.answer.to },
    ]);

    const afterAnswer = makeMove(afterInvite, legalPly(afterInvite, theme.answer));
    assert.equal(nightBookFavour(theme, afterAnswer).length, 0, 'it is Red to move');

    const afterBridge = makeMove(afterAnswer, legalPly(afterAnswer, theme.bridge));
    assert.deepEqual(nightBookFavour(theme, afterBridge), [
      { from: theme.follow.from, to: theme.follow.to },
    ]);

    const afterFollow = makeMove(afterBridge, legalPly(afterBridge, theme.follow));
    assert.equal(
      nightBookFavour(theme, afterFollow).length,
      0,
      'the book stops after the opening, the engine owns the rest',
    );
  }

  // A guest who opens differently is not bent into tonight's line.
  const offScript = OTHER_RED_OPENINGS.map((ply) =>
    makeMove(createInitialBoard(), legalPly(createInitialBoard(), ply)),
  );
  for (const theme of NIGHT_THEMES) {
    for (const board of offScript) {
      if (detectRedOpeningShape(board.grid) === theme.shape) continue;
      assert.equal(
        nightBookFavour(theme, board).length,
        0,
        `${theme.nameVi} tried to script an opening the guest never chose`,
      );
    }
  }
});

function legalPly(board: BoardState, ply: NightBookPly): Move {
  const move = generateLegalMoves(board.grid, ply.side).find(
    (m) => sameSquare(m.from, ply.from) && sameSquare(m.to, ply.to),
  );
  assert.ok(move, `${ply.notation} must stay legal in the replayed position`);
  return move;
}

function replayInvite(theme: NightTheme): BoardState {
  return makeMove(createInitialBoard(), legalPly(createInitialBoard(), theme.invite));
}

test('tonight is chosen by the date and wraps predictably', () => {
  const seen = new Set<number>();
  for (let day = 0; day < NIGHT_COUNT; day++) {
    seen.add(nightIndexFromDate(new Date(2026, 10, 20 + day)));
  }
  assert.equal(seen.size, NIGHT_COUNT, 'six evenings must show six different nights');

  assert.equal(resolveNightTheme(new Date(2026, 10, 20), 1).index, 1);
  assert.equal(resolveNightTheme(new Date(2026, 10, 20), NIGHT_COUNT + 1).index, 1);
  assert.equal(nightThemeByIndex(-1).index, NIGHT_COUNT);
  assert.equal(nightThemeByIndex(0).index, 1);
  assert.equal(nightThemeByIndex(7).index, 2);
});

test('flavouring the script never costs the bride real material', () => {
  // The favour only wins ties inside its own window: ai.ts adds 44cp to the scripted square and
  // nothing else, so the worst case is a move 44cp inferior to the engine's first choice. 60 keeps
  // headroom for aspiration-window noise and is still well under half a pawn.
  const MAX_SCRIPT_COST_CP = 60;

  for (const theme of NIGHT_THEMES) {
    const position = replayInvite(theme);
    const plain = analyzePosition(position, 'cao_thu', { mode: 'preview' });
    const scripted = analyzePosition(position, 'cao_thu', {
      mode: 'preview',
      bookFavour: nightBookFavour(theme, position),
    });
    assert.ok(scripted.bestMove, 'the script must never leave the bride without a move');
    // Scores are Red-relative centipawns: Black prefers the lower number.
    assert.ok(
      scripted.score - plain.score <= MAX_SCRIPT_COST_CP,
      `${theme.nameVi}: playing ${theme.answer.notation} costs ${
        scripted.score - plain.score
      }cp against the best move`,
    );
  }
});

test('night copy is tokenised, spoken, and never assumes a groom', () => {
  const known = new Set<string>([...COMMENTARY_TOKENS, ...NIGHT_TOKENS]);
  const cjk = /[\u3400-\u9FFF\u3040-\u30FF]/;
  const seen = new Set<string>();

  for (const theme of NIGHT_THEMES) {
    for (const tease of theme.teases) {
      assert.ok(tease.line.length > 30, `${theme.nameVi} line is too thin to broadcast`);
      assert.ok(tease.stageDirection.length > 10, `${theme.nameVi} has no stage business`);
      assert.ok(!seen.has(tease.line), `night lines repeat across the week: ${tease.line}`);
      seen.add(tease.line);
      assert.ok(!cjk.test(tease.line), `${tease.line} leaked a Chinese glyph`);
      assert.ok(!cjk.test(tease.stageDirection), `${tease.stageDirection} leaked a Chinese glyph`);
      assert.ok(!/tốt lùi/i.test(tease.line), `${tease.line} asks a soldier to retreat`);
      assert.ok(
        !/\b(chàng|thiếp)\b|hai họ/i.test(tease.line),
        `${theme.nameVi} hardcodes the bridal register: ${tease.line}`,
      );
      for (const token of `${tease.line} ${tease.stageDirection}`.match(/\{(\w+)\}/g) ?? []) {
        assert.ok(known.has(token.slice(1, -1)), `${theme.nameVi} uses unknown token ${token}`);
      }
    }
  }
  assert.equal(seen.size, NIGHT_COUNT * 6, 'the rotation must hold 36 distinct lines');
});

test('night lines render through the same pronoun machinery as the bank', () => {
  const board = { ...createInitialBoard(), moveCount: 12 };
  const ladder = initialLadder();
  const base = {
    board,
    ladder,
    challengerName: '@KiemKhach_VN',
    recentLines: [],
  };

  for (const theme of NIGHT_THEMES) {
    const eligibleCount = theme.teases.filter(
      (tease) => !tease.when || tease.when({ board, ladder }),
    ).length;
    assert.ok(eligibleCount > 0, `${theme.nameVi} has no line for this board`);
    for (let seed = 0; seed < eligibleCount; seed++) {
      const bridal = buildNightTeaseScript({
        ...base,
        night: theme,
        guestGender: 'nam',
        guestAge: 26,
        seed,
      });
      assert.ok(!/\{\w+\}/.test(bridal.line), `unfilled token in ${bridal.line}`);
      assert.ok(!/\{\w+\}/.test(bridal.stageDirection), `unfilled token in ${bridal.stageDirection}`);
      // Substituted tokens are where a Chinese label could still slip on air: {pattern} must
      // resolve to the Vietnamese name, never to the nameZh the engine keeps for reference.
      assert.ok(
        !/[\u3400-\u9FFF\u3040-\u30FF]/.test(`${bridal.line} ${bridal.stageDirection}`),
        `a rendered night line leaked a Chinese glyph: ${bridal.line}`,
      );
      assert.equal(bridal.motif, theme.nameVi, 'the banner carries the chapter, not a fake tactic');

      const elder = buildNightTeaseScript({
        ...base,
        night: theme,
        guestGender: 'nam',
        guestAge: 61,
        seed,
      });
      assert.ok(
        !/\b(chàng|thiếp)\b|hai họ/i.test(`${elder.line} ${elder.stageDirection}`),
        `an elder heard the bridal register: ${elder.line}`,
      );
    }

    // Recency has to suppress the line that actually went out, not the template it came from -
    // the raw {guest} form never matches, so filtering on it would re-broadcast every tease.
    const spoken = Array.from({ length: eligibleCount }, (_, seed) =>
      buildNightTeaseScript({
        ...base,
        night: theme,
        guestGender: 'nam',
        guestAge: 26,
        seed,
      }).line,
    );
    const lastRemaining = buildNightTeaseScript({
      ...base,
      night: theme,
      guestGender: 'nam',
      guestAge: 26,
      recentLines: spoken.slice(0, -1),
      seed: 0,
    });
    assert.equal(lastRemaining.line, spoken[spoken.length - 1]);
  }
});

test('every night can open the show in its own voice', () => {
  for (const theme of NIGHT_THEMES) {
    const opening = buildNightTeaseScript({
      night: theme,
      board: createInitialBoard(),
      ladder: initialLadder(),
      challengerName: '@KiemKhach_VN',
      guestGender: 'nam',
      guestAge: 26,
      recentLines: [],
      seed: theme.index,
    });
    assert.equal(opening.phase, 'khai_cuoc', `${theme.nameVi} opened in the wrong phase`);
    assert.equal(opening.motif, theme.nameVi, `${theme.nameVi} lost its chapter title`);
    assert.ok(opening.line.length > 30, `${theme.nameVi} had no opening voice`);
  }
});

test('conceded stones remove night lines that still claim those stones', () => {
  const choices = [
    { id: 'khong_chap', flank: 'ben_trai' },
    { id: 'chap_mot_ma', flank: 'ben_trai' },
    { id: 'chap_mot_ma', flank: 'ben_phai' },
    { id: 'chap_hai_ma', flank: 'ca_hai' },
    { id: 'chap_mot_phao', flank: 'ben_trai' },
    { id: 'chap_mot_phao', flank: 'ben_phai' },
    { id: 'chap_mot_xe', flank: 'ben_trai' },
    { id: 'chap_mot_xe', flank: 'ben_phai' },
  ] as const;
  const ladder = initialLadder();

  for (const theme of NIGHT_THEMES) {
    for (const choice of choices) {
      const opened = applyHandicap(createInitialBoard(), choice.id, choice.flank);
      assert.ok(opened.ok, `${theme.nameVi}: ${choice.id}/${choice.flank} must open cleanly`);
      const lines = renderedNightLines(theme, opened.board, ladder);
      assert.ok(lines.length > 0, `${theme.nameVi} has no voice after ${choice.id}/${choice.flank}`);
      const blackHorses = opened.board.grid
        .flat()
        .filter((piece) => piece?.side === 'black' && piece.type === 'horse').length;
      const blackChariots = opened.board.grid
        .flat()
        .filter((piece) => piece?.side === 'black' && piece.type === 'chariot').length;

      if (blackHorses < 2) {
        assert.ok(
          lines.every((line) => !/hai con ngựa|dàn đủ hai ngựa/i.test(line)),
          `${theme.nameVi} still claims two horses after ${choice.id}/${choice.flank}`,
        );
      }
      if (blackHorses === 0) {
        assert.ok(
          lines.every((line) => !/ngựa nằm ở rãnh|con ngựa phía sau pháo|ngựa của \{self\}/i.test(line)),
          `${theme.nameVi} still points at a horse after ${choice.id}/${choice.flank}`,
        );
      }
      if (blackChariots < 2) {
        assert.ok(
          lines.every((line) => !/hai xe|hai chiếc xe/i.test(line)),
          `${theme.nameVi} still claims two chariots after ${choice.id}/${choice.flank}`,
        );
      }
    }
  }
});

test('night copy follows the dowry pieces actually still held', () => {
  const full = initialLadder();
  for (const theme of NIGHT_THEMES) {
    const ladder = { held: full.held.filter((id) => id !== theme.headlineLayer) };
    const lines = renderedNightLines(theme, createInitialBoard(), ladder);
    assert.ok(
      lines.every(
        (line) =>
          !/vẫn còn nguyên|chưa định cởi|đang rung|tự cởi|muốn nghe tiếng nó rơi|bay đi mất/i.test(
            line,
          ),
      ),
    `${theme.nameVi} still claims a layer it already lost`,
    );
  }

  const finale = NIGHT_THEMES[5];
  assert.ok(
    renderedNightLines(finale, createInitialBoard(), full).every(
      (line) => !/còn lại đúng cây nến/i.test(line),
    ),
    'the candle-only line cannot open a full dowry',
  );
  assert.ok(
    renderedNightLines(finale, createInitialBoard(), { held: ['nen_hoa_chuc'] }).some((line) =>
      /còn lại đúng cây nến/i.test(line),
    ),
    'the candle-only line belongs to the actual final layer',
  );
});

test('book positions unlock the concrete night lines they describe', () => {
  const expected = new Map<number, string>([
    [1, 'Hai con ngựa đã vào thế'],
    [2, 'soi thẳng vào pháo'],
    [3, 'Ngựa nằm ở rãnh'],
    [4, 'cửa giữa đã bị'],
    [5, 'Một chiếc xe đã sang'],
  ]);

  for (const theme of NIGHT_THEMES) {
    const phrase = expected.get(theme.index);
    if (!phrase) continue;
    const lines = renderedNightLines(theme, replayBookLine(theme), initialLadder());
    assert.ok(
      lines.some((line) => line.includes(phrase)),
      `${theme.nameVi} never speaks its board-true line: ${phrase}`,
    );
  }
});

test('night copy takes its phase from the real board, not a hardcoded opening', () => {
  const script = buildNightTeaseScript({
    night: NIGHT_THEMES[0],
    board: { ...createInitialBoard(), moveCount: 30 },
    ladder: initialLadder(),
    challengerName: '@KiemKhach_VN',
    guestGender: 'nam',
    guestAge: 26,
    seed: 0,
  });
  assert.equal(script.phase, 'tan_cuoc');
});

test('night prompt facts carry the real opening, headline stake, and concession', () => {
  const theme = NIGHT_THEMES[0];
  const ladder = {
    held: initialLadder().held.filter((id) => id !== theme.headlineLayer),
  };
  const opened = applyHandicap(createInitialBoard(), 'chap_mot_xe', 'ben_phai');
  assert.ok(opened.ok);

  assert.deepEqual(buildNightPromptFacts(theme, 'phao_dau', ladder, opened.handicap), {
    openingShape: 'phao_dau',
    headlineLayerHeld: false,
    concessionNameVi: 'Chấp Một Xe 9',
  });
});

test('night prompt separates the book opening from the real opening and lost stake', () => {
  const theme = NIGHT_THEMES[0];
  const layerName = layerById(theme.headlineLayer).nameVi;
  const lost = buildNightPromptState(
    theme,
    {
      openingShape: 'phao_dau',
      headlineLayerHeld: false,
      concessionNameVi: 'Chấp Một Xe 9',
    },
    'thiếp',
    'chàng',
  );

  assert.ok(lost.includes('Sách khai cuộc của đêm: Tiên Nhân Chỉ Lộ'));
  assert.ok(lost.includes('Khai cuộc thực tế: Pháo Đầu Trấn Trung'));
  assert.ok(lost.includes(`Lớp hồi môn trọng tâm "${layerName}" đã giao`));
  assert.ok(!lost.includes('vẫn đang treo'));
  assert.ok(lost.includes('Chấp đang chơi: Chấp Một Xe 9'));

  const held = buildNightPromptState(
    theme,
    {
      openingShape: 'khoi_ma',
      headlineLayerHeld: true,
      concessionNameVi: 'Đi Thuận Cờ',
    },
    'thiếp',
    'chàng',
  );
  assert.ok(held.includes(`Lớp hồi môn trọng tâm "${layerName}" vẫn đang treo`));
});

test('night prompt refuses unverified facts instead of inventing board state', () => {
  const state = buildNightPromptState(
    NIGHT_THEMES[0],
    {
      openingShape: 'invented_opening',
      headlineLayerHeld: 'false',
      concessionNameVi: '<script>alert(1)</script>',
    },
    'thiếp',
    'chàng',
  );

  assert.ok(state.includes('Khai cuộc thực tế chưa được xác minh'));
  assert.ok(state.includes('chưa được xác minh; không được khẳng định nó còn hay đã mất'));
  assert.ok(state.includes('Chấp đang chơi chưa được xác minh'));
  assert.ok(!state.includes('invented_opening'));
  assert.ok(!state.includes('<script>'));
});

test('the night that concedes gives away the horse her own line does not ride', () => {
  // Plan T5 puts 让単馬 on the evening whose hồi môn is the phoenix crown, and that is this night:
  // its signature is the ngọa tào horse. The rung has to be playable on its own script, so no Black
  // book ply may start from a square the concession empties - otherwise the evening's reply is a
  // story about a stone that is not on the board.
  const conceding = NIGHT_THEMES.filter((theme) => theme.concession);
  assert.deepEqual(
    conceding.map((theme) => theme.index),
    [3],
    'only the mũ phượng night proposes a rung',
  );

  for (const theme of conceding) {
    const choice = theme.concession!;
    assert.equal(choice.id, 'chap_mot_ma', `${theme.nameVi} is the horse night`);
    const { board, handicap, ok, absent } = applyHandicap(createInitialBoard(), choice.id, choice.flank);
    assert.ok(ok, 'a concession is only ever laid on the opening');
    assert.deepEqual(absent, [], `${theme.nameVi} offered a rung with nothing to take`);
    assert.ok(
      handicap.shields.includes('thiet_binh'),
      `${theme.nameVi} promises 铁兵 with the horse, and the ledger has to carry it`,
    );

    const given = new Set(handicap.removed.map((r) => `${r.at.row},${r.at.col}`));
    for (const ply of [theme.answer, theme.follow]) {
      assert.ok(
        !given.has(`${ply.from.row},${ply.from.col}`),
        `${theme.nameVi} scripts ${ply.notation} from a square the concession emptied`,
      );
    }

    const invite = generateLegalMoves(board.grid, 'red').find(
      (m) => sameSquare(m.from, theme.invite.from) && sameSquare(m.to, theme.invite.to),
    );
    assert.ok(invite, `${theme.nameVi} cannot even be invited under its own concession`);
    assert.deepEqual(
      nightBookFavour(theme, makeMove(board, invite)),
      [{ from: theme.answer.from, to: theme.answer.to }],
      `${theme.nameVi} loses its book nudge under the rung it proposes`,
    );
  }
});
