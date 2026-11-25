/**
 * Master Live Performance, Dialogue & Character Gesture Choreography Engine
 * for Kỳ Đài Giang Hồ 3D (Kỳ Ma Điêu Nguyệt — Tân Nương Áo Đỏ Hồ Sen).
 *
 * Built by a 4-role Creative Architecture:
 * 1) Ancient-Romance Screenwriter (lời thoại cổ trang duyên dáng, nhịp ngắt nghỉ tự nhiên)
 * 2) TikTok Live Retention Director (nhịp mở live, gọi kèo, giữ chân người chơi lúc suy nghĩ, đón khách mới, cảm ơn quà)
 * 3) Xiangqi Grandmaster Analyst (nhận diện 4 Hồi ván cờ, khai cuộc thật, ăn quân lớn, nước xuất thần, hở sườn, lật kèo, tàn cuộc)
 * 4) Stage Acting Director (đồng bộ 1:1 lời nói ↔ cảm xúc ↔ cử chỉ uống trà / che quạt chọc ghẹo / nhấc quân / cận mặt nhép môi)
 */

import { GuestGender } from '../data/characters';
import { DeepAnalysisResult } from './ai';
import { BoardState, Move, PIECE_NAME_VI, PieceType } from './xiangqi';
import { HostEmotion } from '../scene/portraitKinematics';
import { BankEntry, commentaryTier, killPatternPool, tierPool } from './commentaryBank';
import type { PatternHolder } from './commentaryBank';
import type { KillPatternId } from './patterns';
import { patternNameVi } from './patterns';
import { NightTheme, nightTeaseTokens, type NightCopyContext } from './nightThemes';

export type MatchPhase = 'khai_cuoc' | 'trung_cuoc' | 'tan_cuoc' | 'hoi_ket';

export type PerformanceGesture =
  | 'sip_tea'
  | 'tease'
  | 'think_fan'
  | 'closeup_talk'
  | 'groom_react';

export type LiveBeatType =
  | 'live_opening'
  | 'challenger_welcome'
  | 'thinking_nudge'
  | 'countdown_alert'
  | 'gift_reaction'
  | 'audience_call'
  | 'gesture_sip_tea'
  | 'gesture_tease'
  | 'gesture_think_fan';

export type TacticalEventType =
  | 'checkmate_red'
  | 'checkmate_black'
  | 'check_bot'
  | 'check_player'
  | 'heavy_capture_bot'
  | 'heavy_capture_player'
  | 'light_capture_bot'
  | 'light_capture_player'
  | 'comeback_player'
  | 'brilliant_player'
  | 'blunder_player'
  | 'dominating_bot'
  | 'under_pressure_bot'
  | 'opening_signature'
  | 'tense_endgame'
  | 'perpetual_check_ruling'
  | 'repetition_draw'
  | 'sixty_move_draw'
  | 'balanced_duel';

export interface PronounProfile {
  self: string;
  guest: string;
  guestCap: string;
  audience: string;
  storyMode: 'bridal_duel' | 'elder_respect' | 'sister_duel';
  storyBrief: string;
}

export interface PerformanceScript {
  line: string;
  motif: string;
  emotion: HostEmotion;
  gesture: PerformanceGesture;
  stageDirection: string;
  phase: MatchPhase;
  phaseLabel: string;
  tacticalEvent?: TacticalEventType;
}

export const MATCH_PHASE_LABELS_VI: Record<MatchPhase, string> = {
  khai_cuoc: 'Hồi I · Khai Cuộc',
  trung_cuoc: 'Hồi II · Trung Cuộc',
  tan_cuoc: 'Hồi III · Tàn Cuộc',
  hoi_ket: 'Hồi IV · Phân Định',
};

const HEAVY_PIECES = new Set<PieceType>(['chariot', 'cannon', 'horse']);

/** Count total remaining pieces on the 10x9 Xiangqi board */
export function countBoardPieces(grid: BoardState['grid']): number {
  let count = 0;
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      if (grid[r][c]) count++;
    }
  }
  return count;
}

/** Detect the narrative & strategic phase of the chess match */
export function detectMatchPhase(board: BoardState): MatchPhase {
  if (board.status !== 'playing') return 'hoi_ket';
  const pieceCount = countBoardPieces(board.grid);
  if (board.moveCount <= 8 && pieceCount >= 28) return 'khai_cuoc';
  if (board.moveCount >= 26 || pieceCount <= 16) return 'tan_cuoc';
  return 'trung_cuoc';
}

/**
 * Intelligent Vietnamese honorific & storyline adaptation based on challenger gender & age.
 * Keeps the iconic "Tân Nương Áo Đỏ" identity 100% consistent while never awkwardly calling
 * a female challenger or elder master "chú rể".
 */
export function resolvePronounProfile(
  gender: GuestGender,
  age: number,
): PronounProfile {
  const safeAge = Math.max(12, Math.min(95, Math.round(age || 26)));

  if (gender === 'nu') {
    if (safeAge <= 32) {
      return {
        self: 'tỷ',
        guest: 'muội',
        guestCap: 'Muội',
        audience: 'cả phòng live',
        storyMode: 'sister_duel',
        storyBrief:
          'hai mỹ nhân tỷ muội tao ngộ trong chòi cổ giữa hồ sen đêm trăng, luận cờ so tài duyên dáng sắc sảo trước quan khách phòng live',
      };
    }
    return {
      self: 'Điêu Nguyệt',
      guest: 'tỷ tỷ',
      guestCap: 'Tỷ tỷ',
      audience: 'quan khách',
      storyMode: 'sister_duel',
      storyBrief:
        'Kỳ Ma Điêu Nguyệt nghênh đón nữ hiệp tiền bối thưởng trà sen đánh cờ dưới ánh trăng, đối đáp thông minh kính trọng nhưng đầy bản lĩnh',
    };
  }

  if (safeAge > 45) {
    return {
      self: 'tiểu nữ',
      guest: 'tiền bối',
      guestCap: 'Tiền bối',
      audience: 'quan khách',
      storyMode: 'elder_respect',
      storyBrief:
        'Tân Nương Áo Đỏ Kỳ Ma Điêu Nguyệt kính trà nghênh tiếp kỳ thủ tiền bối lên chòi cổ hồ sen luận cờ, lễ độ pha nét tinh nghịch duyên dáng',
    };
  }

  return {
    self: 'thiếp',
    guest: 'chàng',
    guestCap: 'Chàng',
    audience: 'hai họ',
    storyMode: 'bridal_duel',
    storyBrief:
      'Tân Nương Áo Đỏ Kỳ Ma Điêu Nguyệt đang ngồi trong chòi cổ giữa hồ sen dưới ánh trăng, đánh một ván cờ thử tài chú rể trước giờ động phòng hoa chúc (chàng thắng thì thiếp giao lại một lớp hồi môn, chàng thua thì ôm gối ra hành lang ngắm trăng)',
  };
}

/** Classifies the tactical & emotional weight of the just-committed move */
export function classifyTacticalEvent(params: {
  boardAfter: BoardState;
  move: Move;
  analysis: DeepAnalysisResult;
  scoreDeltaForRed: number;
  prevWinProbRed?: number;
  phase: MatchPhase;
}): TacticalEventType {
  const { boardAfter, move, analysis, scoreDeltaForRed, prevWinProbRed, phase } = params;
  const isBotMove = move.piece.side === 'black';

  // The referee's own endings are the story beat — they outrank a generic "mate" line, and a
  // perpetual-check loss is a rule ruling, not a finish on the board.
  if (boardAfter.statusReason === 'perpetual_check') return 'perpetual_check_ruling';
  if (boardAfter.statusReason === 'repetition_draw') return 'repetition_draw';
  if (boardAfter.statusReason === 'sixty_move_draw') return 'sixty_move_draw';

  if (boardAfter.status === 'red_win') return 'checkmate_red';
  if (boardAfter.status === 'black_win' || boardAfter.status === 'draw') {
    return 'checkmate_black';
  }
  if (boardAfter.inCheck !== null) {
    return isBotMove ? 'check_bot' : 'check_player';
  }

  if (move.captured) {
    const isHeavy = HEAVY_PIECES.has(move.captured.type);
    if (isBotMove) {
      return isHeavy ? 'heavy_capture_bot' : 'light_capture_bot';
    }
    return isHeavy ? 'heavy_capture_player' : 'light_capture_player';
  }

  // Dramatic comeback swing: Red was clearly losing (<= 38%) and jumped >= 14% win prob!
  if (
    typeof prevWinProbRed === 'number' &&
    prevWinProbRed <= 38 &&
    analysis.winProbRed - prevWinProbRed >= 14
  ) {
    return 'comeback_player';
  }

  if (scoreDeltaForRed >= 95) return 'brilliant_player';
  if (scoreDeltaForRed <= -110) return 'blunder_player';
  if (phase === 'khai_cuoc') return 'opening_signature';
  if (phase === 'tan_cuoc') return 'tense_endgame';
  if (analysis.winProbRed <= 36) return 'dominating_bot';
  if (analysis.winProbRed >= 64) return 'under_pressure_bot';
  return 'balanced_duel';
}

function pickFresh<T extends { line: string }>(
  pool: T[],
  recentLines: string[],
  seed: number,
): T {
  const fresh = pool.filter((item) => !recentLines.includes(item.line));
  const list = fresh.length > 0 ? fresh : pool;
  return list[Math.abs(seed) % list.length];
}

interface ScriptTemplate {
  line: string;
  emotion: HostEmotion;
  gesture: PerformanceGesture;
  stageDirection: string;
  motif?: string;
}

const VOICED_EVENTS: TacticalEventType[] = [
  'checkmate_red',
  'checkmate_black',
  'check_bot',
  'check_player',
  'heavy_capture_bot',
  'heavy_capture_player',
  'light_capture_bot',
  'light_capture_player',
  'brilliant_player',
  'blunder_player',
  'comeback_player',
  'perpetual_check_ruling',
  'repetition_draw',
  'sixty_move_draw',
];

/**
 * Pavilion chess crowds make noise on captures and checks, not on quiet developing moves.
 * Silence is what makes the next line land, so quiet plies only update the banner text.
 */
export function shouldVoiceCommentary(params: {
  tacticalEvent: TacticalEventType;
  killPattern: boolean;
  phaseChanged: boolean;
  moveCount: number;
}): boolean {
  if (VOICED_EVENTS.includes(params.tacticalEvent)) return true;
  if (params.killPattern) return true;
  if (params.phaseChanged) return true;
  return params.moveCount % 7 === 0;
}

function fillSpeechTokens(text: string, ctx: Record<string, string>): string {
  const filled = text.replace(/\{(\w+)\}/g, (_m, token: string) => ctx[token] ?? '');
  // A line may open on {self} or {guest}, whose values are lowercase honorifics.
  return filled.charAt(0).toUpperCase() + filled.slice(1);
}

function renderBankEntry(
  entry: BankEntry,
  ctx: Record<string, string>,
): ScriptTemplate {
  return {
    ...entry,
    line: fillSpeechTokens(entry.line, ctx),
    stageDirection: fillSpeechTokens(entry.stageDirection, ctx),
  };
}

/** The pronoun tokens every spoken line is rendered through - the xưng hô rule of the whole show. */
function speechContext(p: PronounProfile, shortName: string): Record<string, string> {
  return {
    guest: p.guest,
    capGuest: p.guestCap,
    self: p.self,
    capSelf: p.self.charAt(0).toUpperCase() + p.self.slice(1),
    audience: p.audience,
    name: shortName,
  };
}

/** Bank copy is stored with tokens; rules written in another module get the same reading. */
export function renderSpeechTokens(
  text: string,
  params: { guestGender: GuestGender; guestAge: number; challengerName: string },
): string {
  const p = resolvePronounProfile(params.guestGender, params.guestAge);
  return fillSpeechTokens(text, speechContext(p, params.challengerName.replace(/^@/, '')));
}

/**
 * Generates a fully choreographed Move Performance Script (Dialogue + Emotion + Gesture + Stage Direction)
 * tailored to the exact chess phase, tactical shock, opening archetype, and challenger identity.
 */
export function buildMovePerformanceScript(params: {
  boardAfter: BoardState;
  move: Move;
  playedMotif: string;
  analysis: DeepAnalysisResult;
  challengerName: string;
  guestGender: GuestGender;
  guestAge: number;
  scoreDeltaForRed: number;
  prevWinProbRed?: number;
  recentLines?: string[];
  /** Dowry layers the challenger has already taken - drives the delivery tier, not the ruling. */
  ladderStep?: number;
  /** The sát pháp the banner just named for this ply, if the ply earned a name. */
  killPatternId?: KillPatternId | null;
}): PerformanceScript {
  const {
    boardAfter,
    move,
    playedMotif,
    analysis,
    challengerName,
    guestGender,
    guestAge,
    scoreDeltaForRed,
    prevWinProbRed,
    recentLines = [],
    ladderStep = 0,
    killPatternId = null,
  } = params;

  const phase = detectMatchPhase(boardAfter);
  const phaseLabel = MATCH_PHASE_LABELS_VI[phase];
  const p = resolvePronounProfile(guestGender, guestAge);
  const shortName = challengerName.replace(/^@/, '') || p.guest;
  const tacticalEvent = classifyTacticalEvent({
    boardAfter,
    move,
    analysis,
    scoreDeltaForRed,
    prevWinProbRed,
    phase,
  });

  const capVi = move.captured
    ? PIECE_NAME_VI[move.captured.side][move.captured.type]
    : '';
  // A quiet king step has no motif to name; speech still needs a noun, and inventing a tactic
  // name is exactly what the banner must not do.
  const spokenMotif = playedMotif || 'thế khai cuộc';
  const isBridal = p.storyMode === 'bridal_duel';
  const stakePunish = isBridal
    ? 'ôm gối ra hành lang ngắm trăng'
    : 'nhận phạt uống liền ba chén trà sen';
  const stakeReward = isBridal
    ? 'tâm phục khẩu phục, nhường chàng một lớp hồi môn'
    : `tâm phục khẩu phục, kính ${p.guest} một chén trà thơm`;

  const seed =
    boardAfter.moveCount * 11 +
    move.to.col * 5 +
    move.to.row * 3 +
    shortName.length;

  let pool: ScriptTemplate[] = [];

  switch (tacticalEvent) {
    case 'checkmate_red':
      pool = [
        {
          line: `Trời ơi... ${p.guest} thắng ${p.self} thật rồi sao! ${p.audience} làm chứng nhé — ván này ${p.self} ${stakeReward} luôn!`,
          emotion: 'victory',
          gesture: 'closeup_talk',
          stageDirection: 'Mở to mắt thán phục, mỉm cười rạng rỡ chúc mừng',
          motif: 'Tâm Phục Khẩu Phục',
        },
        {
          line: `Quá tuyệt vời ${p.guest} ${shortName} ơi! Nước sát cục đẹp như họa — cả chòi hồ sen xin bái phục bản lĩnh đêm nay!`,
          emotion: 'victory',
          gesture: 'sip_tea',
          stageDirection: 'Nâng chén trà sen kính phục người thắng cuộc',
          motif: 'Đoạt Quán Hoa Chúc',
        },
      ];
      break;

    case 'checkmate_black':
      pool = [
        {
          line: `Hì hì... hết đường lui rồi nha ${p.guest}! ${p.audience} ghi sổ giúp ${p.self} — đêm nay ${p.guest} tự giác ${stakePunish} nhé!`,
          emotion: 'victory',
          gesture: 'tease',
          stageDirection: 'Che quạt lụa đỏ cười duyên khép lại ván cờ',
          motif: 'Tuyệt Sát Đêm Trăng',
        },
        {
          line: `Ván cờ khép lại gọn gàng rồi ${p.guest} ơi! Ai trong phòng live muốn lên đài phục thù cho ${shortName}... gõ ngay chữ chơi nhé!`,
          emotion: 'victory',
          gesture: 'closeup_talk',
          stageDirection: 'Hướng ánh mắt về phòng live mời cao thủ kế tiếp',
          motif: 'Giữ Vững Kỳ Đài',
        },
      ];
      break;

    case 'check_bot':
      pool = [
        {
          line: `Khoan đã ${p.guest} ơi! ${p.audience} nín thở xem nè — một đường chiếu xuyên thẳng trung cung... ${p.guest} xoay xở sao đây?`,
          emotion: 'check',
          gesture: 'closeup_talk',
          stageDirection: 'Ánh mắt sắc bén nhìn thẳng, khí thế chiếu tướng dâng cao',
          motif: 'Kiếm Khí Chiếu Tướng',
        },
        {
          line: `Ái chà... lộ đúng huyệt đạo rồi nha ${p.guest}! Một tiếng chiếu vang khắp hồ sen — lần này ${p.self} không nương tay đâu nhé!`,
          emotion: 'check',
          gesture: 'tease',
          stageDirection: 'Nghiêng người về trước, khẽ khép quạt đầy uy áp',
          motif: 'Hoa Chúc Truy Mệnh',
        },
        {
          line: `Chiếu tướng rồi kìa ${p.guest} ơi! Cả phòng live bình luận xem... ${shortName} có cứu nổi đại cục hay phải ${stakePunish} đây?`,
          emotion: 'check',
          gesture: 'closeup_talk',
          stageDirection: 'Nhướng mày kịch tính, kêu gọi khán giả theo dõi nước đỡ',
          motif: 'Ngàn Cân Treo Sợi Tóc',
        },
      ];
      break;

    case 'check_player':
      pool = [
        {
          line: `Ủa ${p.guest} ơi... dám chiếu thẳng vào trung cung của ${p.self} luôn à? Gan dạ thật đấy — nhưng ${p.self} thích bản lĩnh này nha!`,
          emotion: 'surprised',
          gesture: 'closeup_talk',
          stageDirection: 'Bất ngờ nhướng mày, khẽ cười đầy thích thú',
          motif: 'Kinh Diễm Phản Chiếu',
        },
        {
          line: `Ồ! Mũi giáo của ${p.guest} đâm thẳng vào tim trận sắc ghê... ${p.audience} thả tim khen nước chiếu táo bạo này đi nào!`,
          emotion: 'surprised',
          gesture: 'groom_react',
          stageDirection: 'Chuyển góc nhìn sang đối thủ đang tự tin ra đòn',
          motif: 'Long Đằng Hổ Khiếu',
        },
      ];
      break;

    case 'heavy_capture_bot':
      pool = [
        {
          line: `Hì hì... ${p.guest} để hở ${capVi} ngọt thế này sao? Quân chủ lực này — ${p.self} xin thu làm chiến lợi phẩm trước nhé!`,
          emotion: 'amused',
          gesture: 'tease',
          stageDirection: 'Cười tinh nghịch sau tán quạt lụa đỏ khi đoạt quân lớn',
          motif: `Thu Phục ${capVi}`,
        },
        {
          line: `Ái chà ${p.guest} ơi... sơ sẩy đúng một nhịp là mất ngay ${capVi} rồi! Phòng live thấy ${p.self} ra tay có sắc không cả nhà?`,
          emotion: 'fierce',
          gesture: 'closeup_talk',
          stageDirection: 'Ánh mắt lóe sáng tự tin, hướng về khán giả phòng live',
          motif: 'Chớp Thời Cơ Đoạt Quân',
        },
        {
          line: `Mất ${capVi} rồi nhé ${p.guest}! Để ${p.self} nhấp ngụm trà sen — chờ xem ${p.guest} định xoay chuyển thế khó này ra sao nào!`,
          emotion: 'amused',
          gesture: 'sip_tea',
          stageDirection: 'Thong thả nâng chén trà sen, ánh nhìn trêu ghẹo',
          motif: 'Ung Dung Phá Trận',
        },
      ];
      break;

    case 'heavy_capture_player':
      pool = [
        {
          line: `Ồ! ${p.guest} ra tay quyết đoán quá... chém gọn ${capVi} của ${p.self} luôn! Đừng vội mừng nhé — cạm bẫy phía sau giờ mới mở ra!`,
          emotion: 'surprised',
          gesture: 'closeup_talk',
          stageDirection: 'Khẽ giật mình rồi thu lại thần thái sắc sảo',
          motif: 'Đoạt Quân Đổi Thế',
        },
        {
          line: `Hay lắm ${p.guest} ơi... đoạt được ${capVi} gọn gàng thật đấy! Mất quân này làm ${p.self} bắt đầu đánh nghiêm túc thật sự rồi nha!`,
          emotion: 'fierce',
          gesture: 'think_fan',
          stageDirection: 'Ánh mắt chăm chú quét lại toàn bàn cờ tìm phản đòn',
          motif: 'Nổi Sóng Hồ Sen',
        },
      ];
      break;

    case 'light_capture_bot':
      pool = [
        {
          line: `Khẽ thu gọn quân ${capVi} mở đường cái nhé ${p.guest}! Đừng xem thường nước nhỏ — đê vỡ bao giờ cũng bắt đầu từ khe hở nhỏ đấy!`,
          emotion: 'amused',
          gesture: 'sip_tea',
          stageDirection: 'Nhấp trà nhẹ nhàng, giọng điềm tĩnh ẩn ý sâu xa',
          motif: 'Tằm Ăn Lá Dâu',
        },
        {
          line: `Hì hì... ${p.self} xin nhẹ quân ${capVi} lấy lộc trước nha! Trận thế bắt đầu thông thoáng hẳn rồi đấy ${p.guest} ơi!`,
          emotion: 'amused',
          gesture: 'tease',
          stageDirection: 'Nghiêng đầu cười duyên sau quạt lụa đỏ',
          motif: 'Mở Lộ Khai Thông',
        },
      ];
      break;

    case 'light_capture_player':
      pool = [
        {
          line: `${p.guestCap} chịu khó dọn đường thật đấy... nhưng lấy ${capVi} này của ${p.self}, coi chừng phải trả giá đắt hơn phía sau nha!`,
          emotion: 'calm',
          gesture: 'tease',
          stageDirection: 'Nhìn thoáng sang bàn cờ với nụ cười bí ẩn',
          motif: 'Dụ Địch Nhập Trận',
        },
        {
          line: `Ồ, ${p.guest} chủ động ăn quân khai chiến sớm luôn à? Được thôi — để xem đôi bên ai tính sâu hơn vài nước nữa nhé!`,
          emotion: 'thinking',
          gesture: 'groom_react',
          stageDirection: 'Góc quay chuyển sang đối thủ đang tự tin tiến công',
          motif: 'Khai Chiến Giao Phong',
        },
      ];
      break;

    case 'comeback_player':
      pool = [
        {
          line: `Trời ơi... vừa nãy tưởng ${p.guest} lép vế rồi, ai ngờ tung một đòn lật ngược thế cờ đỉnh quá! ${p.audience} thả tim rần rần đi nào!`,
          emotion: 'surprised',
          gesture: 'closeup_talk',
          stageDirection: 'Ánh mắt sáng rực sửng sốt trước cú lật kèo ngoạn mục',
          motif: 'Kinh Thiên Lật Kèo',
        },
        {
          line: `Ái chà... ${p.guest} giấu đòn hiểm tới tận lúc này mới tung ra à? Kịch tính quá — chòi hồ sen nóng rực lên rồi đấy!`,
          emotion: 'surprised',
          gesture: 'groom_react',
          stageDirection: 'Liếc nhìn đối thủ đầy nể phục khi thế trận đảo chiều',
          motif: 'Nghịch Chuyển Càn Khôn',
        },
      ];
      break;

    case 'brilliant_player':
      pool = [
        {
          line: `Ồ... nước cờ này sâu quá nha ${p.guest}! Đừng bảo ${p.guest} giấu nghề từ đầu buổi live tới giờ đấy nhé — quá bản lĩnh luôn!`,
          emotion: 'surprised',
          gesture: 'closeup_talk',
          stageDirection: 'Gật đầu khen ngợi chân thành, ánh mắt đầy hứng khởi',
          motif: 'Diệu Thủ Kinh Hồng',
        },
        {
          line: `Khá khen cho nhãn quan của ${p.guest}! Nhìn tưởng nhẹ nhàng — mà ẩn chứa sát ý tầng tầng lớp lớp, ${p.self} phải dè chừng rồi!`,
          emotion: 'thinking',
          gesture: 'think_fan',
          stageDirection: 'Trầm ngâm dõi theo đường quân vừa tạo thế uy hiếp',
          motif: 'Ẩn Long Xuất Hải',
        },
      ];
      break;

    case 'blunder_player':
      pool = [
        {
          line: `Hì hì... ${p.guest} vừa đi hơi vội một nhịp rồi kìa! Có phải đang sốt ruột muốn xong ván — nên để hở cánh sườn không?`,
          emotion: 'amused',
          gesture: 'tease',
          stageDirection: 'Nâng quạt lụa đỏ che nụ cười trêu ghẹo đầy ẩn ý',
          motif: 'Hở Sườn Lộ Sơ',
        },
        {
          line: `Ái chà ${p.guest} ơi... tự dưng mở cửa mời ${p.self} sang thăm trung cung thế này à? Cẩn thận kẻo tối nay ${stakePunish} thật đấy!`,
          emotion: 'amused',
          gesture: 'tease',
          stageDirection: 'Nghiêng đầu tinh nghịch nhìn đối phương qua bàn cờ',
          motif: 'Mở Cửa Đón Địch',
        },
        {
          line: `Khẽ nhấp chén trà cái đã... cơ hội đẹp thế này mà ${p.self} bỏ qua thì có lỗi với ${p.audience} quá nha ${p.guest}!`,
          emotion: 'amused',
          gesture: 'sip_tea',
          stageDirection: 'Ung dung nhấp trà sen trước khi tung đòn phản công',
          motif: 'Thừa Cơ Xung Trận',
        },
      ];
      break;

    case 'opening_signature':
      pool = [
        {
          line: `Ồ, mở màn bằng thế ${spokenMotif} tự tin ghê nha ${p.guest}! Nến đỏ chưa tàn một tấc — mà khí thế đã dậy sóng khắp hồ sen rồi!`,
          emotion: 'amused',
          gesture: 'sip_tea',
          stageDirection: 'Thong thả thưởng trà ngắm thế khai cuộc bài bản',
          motif: playedMotif,
        },
        {
          line: `${p.guestCap} dàn trận ${spokenMotif} bài bản quá! ${p.audience} đoán xem — ván này ai sẽ làm chủ chòi trăng đêm nay đây?`,
          emotion: 'amused',
          gesture: 'tease',
          stageDirection: 'Che quạt khẽ cười, khuấy động bình luận phòng live',
          motif: playedMotif,
        },
        {
          line: `Ra quân sòng phẳng lắm ${p.guest} ơi! Cứ tiến lên đi — ${p.self} đã pha sẵn trà thơm đợi đón những chiêu đẹp nhất của ${p.guest} rồi!`,
          emotion: 'calm',
          gesture: 'closeup_talk',
          stageDirection: 'Mỉm cười ấm áp, ánh mắt hướng theo nhịp khai cuộc',
          motif: playedMotif,
        },
      ];
      break;

    case 'tense_endgame':
      pool = [
        {
          line: `Vào tàn cuộc rồi ${p.guest} ơi... trăng lên đỉnh hồ sen, chỉ cần lệch nửa bước thôi — là định đoạt cả ván cờ đêm nay đấy!`,
          emotion: 'thinking',
          gesture: 'closeup_talk',
          stageDirection: 'Giọng trầm lắng tập trung, ánh mắt dán chặt từng ô cờ tàn',
          motif: 'Tàn Cuộc Sinh Tử',
        },
        {
          line: `Quân trên bàn thưa dần nhưng sát khí lại càng đặc quánh... ${p.audience} nín thở xem ai đủ bản lĩnh giữ vững tay cờ tới phút chót nhé!`,
          emotion: 'fierce',
          gesture: 'sip_tea',
          stageDirection: 'Khẽ đặt chén trà xuống, toàn tâm bước vào thế cờ tàn',
          motif: 'Trăng Khuya Định Cục',
        },
      ];
      break;

    case 'dominating_bot':
      pool = [
        {
          line: `Thế trận nghiêng hẳn về tay ${p.self} rồi nhé ${p.guest}! Mau tìm nước đột phá đi — kẻo ${p.audience} chuẩn bị sẵn chỗ cho ${p.guest} ${stakePunish} bây giờ!`,
          emotion: 'fierce',
          gesture: 'tease',
          stageDirection: 'Tựa nhẹ về trước với nụ cười tự tin làm chủ cuộc chơi',
          motif: 'Thiên La Địa Võng',
        },
        {
          line: `Từng nhịp cờ đều nằm gọn trong tính toán của ${p.self} rồi! Một nước nữa thôi — cơn sóng ngầm sẽ ập thẳng vào cung của ${p.guest} đấy!`,
          emotion: 'fierce',
          gesture: 'closeup_talk',
          stageDirection: 'Thần thái uy nghi sắc sảo của Kỳ Ma đang chiếm thượng phong',
          motif: 'Áp Đảo Toàn Cục',
        },
      ];
      break;

    case 'under_pressure_bot':
      pool = [
        {
          line: `Công nhận ${p.guest} ép sân rát thật đấy... làm ${p.self} hơi hồi hộp rồi nha! Nhưng càng vào thế khó — ${p.self} lại càng thích lật kèo!`,
          emotion: 'thinking',
          gesture: 'think_fan',
          stageDirection: 'Ánh mắt tập trung cao độ tìm khe hở hóa giải thế công',
          motif: 'Nghịch Cảnh Phản Kích',
        },
        {
          line: `Thế công của ${p.guest} sáng quá... ${p.audience} cổ vũ rần rần kìa! Để xem ${p.self} hóa giải cơn bão này thế nào nhé!`,
          emotion: 'surprised',
          gesture: 'groom_react',
          stageDirection: 'Chuyển góc nhìn tôn vinh thế tấn công sắc bén của đối thủ',
          motif: 'Bình Tĩnh Hóa Nguy',
        },
      ];
      break;

    // The three referee rulings are tiered in commentaryBank.ts now, so what follows is the
    // fallback the room hears once those deliveries are spent. It keeps a job the bank cannot
    // take: the event does not say which side broke the rule, so only here can the mover be named.
    case 'perpetual_check_ruling': {
      // The losing ply was just played, so the mover is the side the referee punished.
      const doomed = move.piece.side === 'black' ? p.self : p.guest;
      pool = [
        {
          line: `Ba vòng chiếu liên tiếp — đó là Trường Chiếu rồi ${doomed} ạ! Chiếu mãi mà lặp lại thế cũ là bị xử thua ngay tại kỳ đài, ${p.audience} làm chứng giúp nước cờ này nhé!`,
          emotion: 'surprised',
          gesture: 'closeup_talk',
          stageDirection: 'Giọng nghiêm hơn một nhịp, tay đặt lên quân cờ vừa đi',
          motif: 'Trường Chiếu Định Phận',
        },
        {
          line: `Trọng tài đã gõ búa rồi ${doomed} ơi! Luật cờ tướng xử bên chiếu liên tục ba vòng lặp thế là thua — đổi nước khác sớm thì đâu tới nỗi này~`,
          emotion: 'amused',
          gesture: 'tease',
          stageDirection: 'Nhếch mép trêu, đưa tay chỉ vòng lặp trên bàn cờ',
          motif: 'Chiếu Mãi hóa Thua',
        },
      ];
      break;
    }

    case 'repetition_draw':
      pool = [
        {
          line: `Hòa do lặp thế 3 lần đó ${p.guest}! Đúng đường cũ quay về ba vòng, trọng tài xử hòa — muốn phân thắng bại thì phải đổi hướng, chứ cứ lặp vầy thì trăng tàn vẫn chưa xong ván~`,
          emotion: 'calm',
          gesture: 'sip_tea',
          stageDirection: 'Thong thả nhấp trà, mỉm cười khép lại thế cờ lặp',
          motif: 'Lặp Thế thu cờ',
        },
        {
          line: `Ba lần cùng một thế cờ... ${p.audience} thấy đó, cả hai đều thuộc bài nhau rồi! Kỳ đài xử hòa — ván sau ${p.guest} mang thế mới lên đài nhé!`,
          emotion: 'amused',
          gesture: 'tease',
          stageDirection: 'Che quạt cười, mời phòng live chờ ván tiếp theo',
          motif: 'Kỳ Phùng Địch Thủ',
        },
      ];
      break;

    case 'sixty_move_draw':
      pool = [
        {
          line: `Hòa theo luật 60 hiệp không ăn quân! Sáu mươi hiệp ròng rã mà chẳng mất quân nào — ${p.guest} phòng thủ chắc thật, nhưng ${p.audience} đang đòi sóng gió kia kìa~`,
          emotion: 'thinking',
          gesture: 'think_fan',
          stageDirection: 'Quạt khẽ phe phẩy, ánh mắt vừa nể vừa trêu',
          motif: 'Sáu Mươi Hiệp',
        },
        {
          line: `Một trăm hai mươi nửa nước bình chân như vại... trọng tài xử hòa rồi ${p.guest} ạ! Cờ là phải chiến — ván sau thử mạnh tay hơn cho ${p.self} còn đất phản công nha!`,
          emotion: 'amused',
          gesture: 'closeup_talk',
          stageDirection: 'Nghiêng đầu trêu ghẹo, nhắc đối thủ đừng thủ thế mãi',
          motif: 'Bình Chân Như Vại',
        },
      ];
      break;

    case 'balanced_duel':
    default:
      pool = [
        {
          line: `Đúng là kỳ phùng địch thủ... thế cờ cân tài cân sức thật sự! Nhấp ngụm trà sen cho tĩnh tâm — vì nước sau mới là lúc sóng gió nổi lên đấy ${p.guest}!`,
          emotion: 'calm',
          gesture: 'sip_tea',
          stageDirection: 'Nâng chén trà sen thong dong giữa màn đấu trí giằng co',
          motif: playedMotif || 'Cân Tài Cân Sức',
        },
        {
          line: `Đừng thấy mặt hồ sen yên ả mà chủ quan nhé ${p.guest}... sóng ngầm đang cuộn trào dưới từng nước điều quân của ${p.self} đấy!`,
          emotion: 'amused',
          gesture: 'tease',
          stageDirection: 'Che quạt lụa đỏ mỉm cười đầy ẩn ý chiến thuật',
          motif: playedMotif || 'Sóng Ngầm Hồ Sen',
        },
        {
          line: `${p.guestCap} đánh điềm tĩnh và chắc tay ghê! ${p.audience} nhớ thả tim tiếp lửa cho màn đấu trí cực căng dưới ánh trăng đêm nay nha!`,
          emotion: 'calm',
          gesture: 'closeup_talk',
          stageDirection: 'Ánh mắt ấm áp hướng về người chơi và khán giả phòng live',
          motif: playedMotif || 'Trăng Sáng Luận Kỳ',
        },
      ];
      break;
  }

  const tier = commentaryTier({
    ladderStep,
    phase,
    moveCount: boardAfter.moveCount,
    scoreDeltaForRed,
  });
  const ctx = {
    ...speechContext(p, shortName),
    piece: capVi,
    motif: spokenMotif,
  };
  const tierLines = tierPool(tacticalEvent, tier).map((entry) => renderBankEntry(entry, ctx));
  // The pattern bank quotes a sát pháp by name and takes sides while it does: every line is either
  // her own shape on the board or her conceding one the challenger just landed. So the banner has to
  // be showing exactly the name the line speaks, and the line has to match who owns the shape.
  const quotedPattern =
    killPatternId && patternNameVi(killPatternId) === playedMotif ? killPatternId : null;
  const holder: PatternHolder = move.piece.side === 'black' ? 'self' : 'guest';
  const patternLines = killPatternPool(quotedPattern, tier, holder).map((entry) =>
    renderBankEntry(entry, ctx),
  );
  // Named pattern first, then the tier, then the base pool: three deliveries per pool run out fast
  // in a live room, and a repeated taunt is worse than a plain one.
  const freshPattern = patternLines.filter((entry) => !recentLines.includes(entry.line));
  const freshTier = tierLines.filter((entry) => !recentLines.includes(entry.line));
  const chosen =
    freshPattern.length > 0
      ? freshPattern[Math.abs(seed) % freshPattern.length]
      : freshTier.length > 0
        ? freshTier[Math.abs(seed) % freshTier.length]
        : pickFresh(pool, recentLines, seed);

  return {
    line: chosen.line,
    motif: chosen.motif ?? playedMotif,
    emotion: chosen.emotion,
    gesture: chosen.gesture,
    stageDirection: chosen.stageDirection,
    phase,
    phaseLabel,
    tacticalEvent,
  };
}

/**
 * Tonight's flavour line from the six-night rotation. The chapter title takes the motif slot
 * because that is the only claim this line makes - naming a kill pattern that has not landed
 * would be exactly the false label the broadcast is built to avoid.
 */
export function buildNightTeaseScript(params: NightCopyContext & {
  night: NightTheme;
  challengerName: string;
  guestGender: GuestGender;
  guestAge: number;
  recentLines?: string[];
  seed?: number;
}): PerformanceScript {
  const {
    night,
    board,
    ladder,
    challengerName,
    guestGender,
    guestAge,
    recentLines = [],
    seed = Date.now(),
  } = params;

  const p = resolvePronounProfile(guestGender, guestAge);
  const shortName = challengerName.replace(/^@/, '') || p.guest;
  const ctx = { ...speechContext(p, shortName), ...nightTeaseTokens(night) };
  const eligible = night.teases.filter((tease) => !tease.when || tease.when({ board, ladder }));
  const spoken = eligible.map((tease) => renderBankEntry(tease, ctx));
  // Recency is judged on the spoken line: recentLines stores what actually went out, so matching
  // the raw template would never hit and the same tease would return on every cue.
  const fresh = spoken.filter((entry) => !recentLines.includes(entry.line));
  const pool = fresh.length > 0 ? fresh : spoken;
  const rendered = pool[Math.abs(Math.trunc(seed)) % pool.length];
  const phase: MatchPhase =
    board.moveCount <= 8 ? 'khai_cuoc' : board.moveCount >= 26 ? 'tan_cuoc' : 'trung_cuoc';

  return {
    line: rendered.line,
    motif: night.nameVi,
    emotion: rendered.emotion,
    gesture: rendered.gesture,
    stageDirection: rendered.stageDirection,
    phase,
    phaseLabel: MATCH_PHASE_LABELS_VI[phase],
  };
}

export interface LiveEntryPlan {
  appState: 'playing' | 'gameover';
  opening: PerformanceScript | null;
  speakConcessionClaim: boolean;
}

export function buildLiveEntryPlan(params: NightCopyContext & {
  night: NightTheme;
  challengerName: string;
  guestGender: GuestGender;
  guestAge: number;
  recentLines?: string[];
  seed?: number;
}): LiveEntryPlan {
  const freshOpening = params.board.status === 'playing' && params.board.moveCount === 0;
  return {
    appState: params.board.status === 'playing' ? 'playing' : 'gameover',
    opening: freshOpening ? buildNightTeaseScript(params) : null,
    speakConcessionClaim: freshOpening,
  };
}

/**
 * The referee's early nudge: fired on the SECOND trip through a checking cycle, while the game is
 * still playable and nobody has been ruled against yet. Deliberately soft — it teaches the
 * Trường Chiếu rule before a ruling can land, and it lets the bride announce that she changes too.
 */
export function buildRepetitionWarningScript(params: {
  /** Side that checks on every move of the repeated cycle. */
  offender: 'red' | 'black';
  challengerName: string;
  guestGender: GuestGender;
  guestAge: number;
  moveCount: number;
  recentLines?: string[];
  seed?: number;
}): PerformanceScript {
  const {
    offender,
    challengerName,
    guestGender,
    guestAge,
    moveCount,
    recentLines = [],
    seed = Date.now(),
  } = params;

  const p = resolvePronounProfile(guestGender, guestAge);
  const shortGuest = challengerName.replace(/^@/, '') || p.guest;
  const phase: MatchPhase =
    moveCount <= 8 ? 'khai_cuoc' : moveCount >= 26 ? 'tan_cuoc' : 'trung_cuoc';
  const phaseLabel = MATCH_PHASE_LABELS_VI[phase];

  const pool: ScriptTemplate[] =
    offender === 'red'
      ? [
          {
            line: `Này ${p.guest}... ${p.self} để ý nãy giờ chàng chiếu đúng hai vòng lặp rồi đấy. Vòng thứ ba là phạm luật Trường Chiếu — thua luôn nha! Đổi nước khác đi, ${p.audience} đang xem bản lĩnh chứ đâu xem nước lặp~`,
            emotion: 'thinking',
            gesture: 'think_fan',
            stageDirection: 'Quạt dừng giữa không trung, ánh mắt nhắc nhở nhẹ nhàng',
            motif: 'Nhắc Luật Trường Chiếu',
          },
          {
            line: `Khoan khoan ${shortGuest}... nước chiếu ấy đưa ${p.self} trở lại đúng thế cũ rồi! Ba vòng là trọng tài xử thua đấy — ${p.self} chưa muốn thắng theo cách này đâu nha!`,
            emotion: 'amused',
            gesture: 'tease',
            stageDirection: 'Che quạt cười, khẽ gõ tay xuống thành kỳ đài',
            motif: 'Hai Vòng Lặp',
          },
        ]
      : [
          {
            line: `Ôi... ${p.self} mải chiếu thành ra lặp thế mất rồi! Ba vòng là bên chiếu bị xử thua, vậy nên nước này thiếp đổi hướng hẳn — chàng coi nhé~`,
            emotion: 'surprised',
            gesture: 'closeup_talk',
            stageDirection: 'Mỉm cười tự nhận, chủ động rời khỏi thế chiếu cũ',
            motif: 'Tự Đổi Nước',
          },
          {
            line: `${p.audience} thấy rồi nha, ${p.self} vừa đi lại nước chiếu cũ hai vòng. Luật Trường Chiếu bắt bên chiếu phải đổi — nên nước tới thiếp đánh đường khác, khỏi ai trách ${p.self} được!`,
            emotion: 'amused',
            gesture: 'sip_tea',
            stageDirection: 'Nhấp trà thong dong, công nhận luật trước phòng live',
            motif: 'Luật Là Luật',
          },
        ];

  const chosen = pickFresh(pool, recentLines, seed + moveCount * 7);
  return {
    line: chosen.line,
    motif: chosen.motif ?? 'Trường Chiếu',
    emotion: chosen.emotion,
    gesture: chosen.gesture,
    stageDirection: chosen.stageDirection,
    phase,
    phaseLabel,
  };
}

/**
 * Generates choreographed Live Session Beats (opening, new challenger welcome,
 * thinking nudge, countdown alert, gift thanks, audience call, & interactive gesture lines)
 * so the broadcast NEVER feels dead or repetitive between chess moves!
 */
export function buildLiveSessionBeat(params: {
  beat: LiveBeatType;
  challengerName: string;
  guestTitle: string;
  guestGender: GuestGender;
  guestAge: number;
  winProbRed: number;
  moveCount: number;
  viewerName?: string;
  giftName?: string;
  recentLines?: string[];
  seed?: number;
}): PerformanceScript {
  const {
    beat,
    challengerName,
    guestTitle,
    guestGender,
    guestAge,
    winProbRed,
    moveCount,
    viewerName,
    giftName,
    recentLines = [],
    seed = Date.now(),
  } = params;

  const p = resolvePronounProfile(guestGender, guestAge);
  const shortGuest = challengerName.replace(/^@/, '') || p.guest;
  const shortViewer = (viewerName ?? 'quan khách').replace(/^@/, '');
  const phase: MatchPhase =
    moveCount <= 8 ? 'khai_cuoc' : moveCount >= 26 ? 'tan_cuoc' : 'trung_cuoc';
  const phaseLabel = MATCH_PHASE_LABELS_VI[phase];
  const isBridal = p.storyMode === 'bridal_duel';

  let pool: ScriptTemplate[] = [];

  switch (beat) {
    case 'live_opening':
      pool = isBridal
        ? [
            {
              line: `Chào ${p.audience} phòng live! Trước giờ động phòng hoa chúc... ${p.guest} đánh với ${p.self} một ván nhé — thắng thì ${p.self} giao lại một lớp hồi môn, còn thua thì ra hành lang ngắm trăng nha!`,
              emotion: 'amused',
              gesture: 'closeup_talk',
              stageDirection: 'Mỉm cười rạng rỡ chào hai họ dưới ánh nến hỷ',
              motif: 'Hoa Chúc Khai Đài',
            },
            {
              line: `Trăng tròn in bóng hồ sen rồi ${p.guest} ơi! Trà đã rót, nến đỏ đã thắp — mời ${p.guest} khai cuộc trước cho ${p.audience} cùng chiêm ngưỡng nào!`,
              emotion: 'calm',
              gesture: 'sip_tea',
              stageDirection: 'Khẽ nâng chén trà sen mời tân lang đi nước đầu tiên',
              motif: 'Chòi Trăng Thử Tài',
            },
          ]
        : [
            {
              line: `Chào mừng ${p.audience} tới chòi cổ hồ sen đêm trăng! Hôm nay ${p.self} hân hạnh tiếp chiêu ${p.guest} ${shortGuest} — mời ${p.guest} đi nước mở màn nhé!`,
              emotion: 'calm',
              gesture: 'sip_tea',
              stageDirection: 'Chắp tay nâng chén trà kính mời cao thủ khai cuộc',
              motif: 'Hồ Sen Hội Ngộ',
            },
          ];
      break;

    case 'challenger_welcome':
      pool =
        p.storyMode === 'sister_duel'
          ? [
              {
                line: `Ồ... chào mừng ${p.guest} ${shortGuest} trong diện mạo ${guestTitle} lên chòi hồ sen! ${p.audience} thả tim xem hai mỹ nhân đấu trí đêm nay nhé!`,
                emotion: 'surprised',
                gesture: 'tease',
                stageDirection: 'Mỉm cười hào hứng đón nữ kỳ thủ lên đài',
                motif: 'Tỷ Muội Luận Kỳ',
              },
            ]
          : p.storyMode === 'elder_respect'
            ? [
                {
                  line: `Kính chào ${p.guest} ${shortGuest} hóa thân ${guestTitle} ghé thăm chòi trăng! ${p.self} xin dâng chén trà sen — mời ${p.guest} chỉ giáo vài đường cờ tuyệt diệu nhé!`,
                  emotion: 'calm',
                  gesture: 'sip_tea',
                  stageDirection: 'Kính cẩn nâng chén trà sen đón bậc tiền bối',
                  motif: 'Kính Trà Nghênh Khách',
                },
              ]
            : [
                {
                  line: `Ồ... tân lang ${shortGuest} trong phong thái ${guestTitle} lên đài rồi kìa! Nến hoa chúc đang sáng lắm — mời ${p.guest} xuất chiêu xem bản lĩnh tới đâu nào!`,
                  emotion: 'amused',
                  gesture: 'tease',
                  stageDirection: 'Che quạt lụa đỏ liếc nhìn tân lang mới bước vào chòi',
                  motif: 'Nghênh Đón Tân Lang',
                },
              ];
      break;

    case 'thinking_nudge':
      pool = [
        {
          line: `Hì hì... ${p.guest} suy tư kỹ quá, chén trà sen của ${p.self} sắp nguội mất rồi kìa! ${p.audience} bình luận mách nước giúp ${shortGuest} đi nào!`,
          emotion: 'amused',
          gesture: 'sip_tea',
          stageDirection: 'Nhấp nhẹ ngụm trà sen, ánh mắt kiên nhẫn trêu nhẹ',
          motif: 'Chờ Nước Thưởng Trà',
        },
        {
          line: `Ái chà... ${p.guest} đang ủ mưu gì sâu lắm phải không? Khẽ phẩy quạt chờ ${p.guest} tung chiêu — đừng làm ${p.audience} sốt ruột nha!`,
          emotion: 'amused',
          gesture: 'tease',
          stageDirection: 'Che quạt lụa đỏ khẽ nghiêng đầu chọc ghẹo lúc đối thủ suy tính',
          motif: 'Khẽ Quạt Chờ Chiêu',
        },
      ];
      break;

    case 'countdown_alert':
      pool = [
        {
          line: `Khoan đã ${p.guest} ơi... chỉ còn vài giây nữa thôi kìa! Mau hạ quân kẻo hết giờ lại mất oan thế cờ đẹp nha!`,
          emotion: 'check',
          gesture: 'closeup_talk',
          stageDirection: 'Nhắc nhẹ đầy hồi hộp khi đồng hồ lượt đi sắp cạn',
          motif: 'Đếm Ngược Hồi Hộp',
        },
      ];
      break;

    case 'gift_reaction':
      pool = [
        {
          line: `Ồ! Đa tạ ${shortViewer} đã tặng ${giftName || 'quà quý'} cho chòi hồ sen nha! Chúc ${shortViewer} đêm nay may mắn rực rỡ — nhớ cổ vũ ván cờ này nhé!`,
          emotion: 'victory',
          gesture: 'tease',
          stageDirection: 'Cười rạng rỡ gửi lời cảm ơn nồng nhiệt tới khán giả tặng quà',
          motif: 'Tri Ân Quan Khách',
        },
      ];
      break;

    case 'audience_call':
      pool = [
        {
          line: `${p.audience} đang xem live ơi... ai tự tin phá được thế trận của ${p.self} thì gõ ngay chữ chơi vào khung chat nhé! Chòi trăng luôn chờ cao thủ lên đài!`,
          emotion: 'amused',
          gesture: 'closeup_talk',
          stageDirection: 'Giao lưu trực tiếp đầy duyên dáng, kêu gọi khán giả tham gia',
          motif: 'Chiêu Mộ Cao Thủ',
        },
        {
          line: `Đêm trăng hồ sen đang cực cháy luôn ${p.audience} ơi! Bên nhà trai hay nhà gái đang chiếm thế — thả tim và bình luận kèo thắng cho ${p.self} thấy đi nào!`,
          emotion: 'amused',
          gesture: 'tease',
          stageDirection: 'Khuấy động không khí phòng live với nụ cười tinh nghịch',
          motif: 'Khuấy Động Phòng Live',
        },
      ];
      break;

    case 'gesture_sip_tea':
      pool =
        winProbRed <= 42
          ? [
              {
                line: `Trà sen đêm trăng thơm quá ${p.guest} ơi... thế cờ đang êm xuôi thế này, để ${p.self} thong thả nhấp thêm một ngụm chờ ${p.guest} xoay sở nhé!`,
                emotion: 'amused',
                gesture: 'sip_tea',
                stageDirection: 'Thong thả thưởng trà sen khi đang chiếm ưu thế',
                motif: 'Thưởng Trà Ngắm Trăng',
              },
            ]
          : [
              {
                line: `Nhấp một ngụm trà sen cho tĩnh thần cái đã... ${p.guest} đánh chắc tay lắm, nhưng ${p.self} vẫn còn chiêu ẩn giấu dưới tay áo đấy nha!`,
                emotion: 'calm',
                gesture: 'sip_tea',
                stageDirection: 'Mượn chén trà sen giữ phong thái điềm tĩnh giữa trận căng',
                motif: 'Tĩnh Tâm Định Thế',
              },
            ];
      break;

    case 'gesture_tease':
      pool = [
        {
          line: `Hì hì... ${p.guest} nhìn bàn cờ hay đang mải ngắm tân nương áo đỏ thế? Tập trung đi cờ kẻo lát nữa lại đổ thừa ${p.self} làm phân tâm nha!`,
          emotion: 'amused',
          gesture: 'tease',
          stageDirection: 'Che quạt lụa đỏ nghiêng người trêu ghẹo cực duyên',
          motif: 'Mỹ Nhân Khích Tướng',
        },
        {
          line: `Ái chà ${p.guest} ơi... nãy giờ ${p.self} mới dùng có bảy phần công lực thôi đấy! ${p.guest} có dám dốc hết tuyệt học ra đấu với ${p.self} không nào?`,
          emotion: 'amused',
          gesture: 'tease',
          stageDirection: 'Ánh mắt lém lỉnh sau tán quạt lụa đỏ thách thức đối thủ',
          motif: 'Khiêu Khích Duyên Dáng',
        },
      ];
      break;

    case 'gesture_think_fan':
      pool = [
        {
          line: `Khẽ phẩy quạt ngẫm thế cờ... trung lộ đang căng như dây đàn rồi đấy ${p.guest}! ${p.audience} thử đoán xem nước tới nên đánh cánh trái hay xộc thẳng trung cung nào?`,
          emotion: 'thinking',
          gesture: 'think_fan',
          stageDirection: 'Trầm ngâm đọc thế trận và gợi mở bình luận chiến thuật',
          motif: 'Luận Chiến Thuật',
        },
      ];
      break;
  }

  const chosen = pickFresh(pool, recentLines, seed);

  return {
    line: chosen.line,
    motif: chosen.motif ?? 'Hoa Chúc Luận Kỳ',
    emotion: chosen.emotion,
    gesture: chosen.gesture,
    stageDirection: chosen.stageDirection,
    phase,
    phaseLabel,
  };
}
