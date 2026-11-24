import { GuestGender, WuxiaCharacterProfile, matchGuestCharacter } from '../data/characters';
import { DeepAnalysisResult } from './ai';
import { BoardState, Move } from './xiangqi';
import { HostEmotion } from '../scene/portraitKinematics';
import {
  PerformanceGesture,
  buildMovePerformanceScript,
} from './livePerformance';

export interface ChallengerEntry {
  id: string;
  username: string;
  /** Who may move for this seat - see `src/engine/liveIdentity.ts`. */
  actorId: string;
  gender: GuestGender;
  age: number;
  character: WuxiaCharacterProfile;
  joinedAt: number;
}

export interface LiveChatMessage {
  id: string;
  username: string;
  text: string;
  timestamp: number;
  kind: 'viewer' | 'challenger' | 'bot' | 'system' | 'move';
  badge?: string;
}

export interface CommentaryItem {
  id: string;
  moveNumber: number;
  actor: string;
  notation: string;
  motif: string;
  line: string;
  mood: 'calm' | 'fierce' | 'check' | 'victory';
  emotion?: HostEmotion;
  emotionLabel?: string;
  vocalCue?: string;
  gesture?: PerformanceGesture;
  stageDirection?: string;
  phaseLabel?: string;
  source: 'engine' | 'gemini';
}

export const EMOTION_LABELS_VI: Record<HostEmotion, string> = {
  calm: 'Điềm tĩnh',
  amused: 'Trêu chọc',
  thinking: 'Trầm ngâm',
  surprised: 'Bất ngờ',
  fierce: 'Sát khí',
  check: 'Chiếu tướng!',
  victory: 'Khải hoàn',
};

export function emotionToMood(emotion: HostEmotion): CommentaryItem['mood'] {
  if (emotion === 'check') return 'check';
  if (emotion === 'victory') return 'victory';
  if (emotion === 'fierce') return 'fierce';
  return 'calm';
}

export function createChallenger(
  username: string,
  actorId: string,
  gender: GuestGender,
  age: number,
  explicitCharacter?: WuxiaCharacterProfile,
): ChallengerEntry {
  const cleanName = username.trim() || 'Khách Giang Hồ';
  const safeAge = Math.max(12, Math.min(99, Math.round(age || 25)));
  return {
    id: `ch_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    username: cleanName,
    actorId,
    gender,
    age: safeAge,
    character: explicitCharacter ?? matchGuestCharacter(gender, safeAge),
    joinedAt: Date.now(),
  };
}

// Two viewers can claim the same handle, so the queue is keyed by actor id: the
// second one to register gets their own slot instead of overwriting the first.
export function enqueueChallenger(
  queue: ChallengerEntry[],
  entry: ChallengerEntry,
): ChallengerEntry[] {
  const exists = queue.some((q) => q.actorId === entry.actorId);
  if (exists) {
    return queue.map((q) => (q.actorId === entry.actorId ? entry : q));
  }
  return [...queue, entry];
}

export function pickNextChallenger(
  queue: ChallengerEntry[],
  mode: 'fifo' | 'random' = 'fifo',
): { picked: ChallengerEntry | null; rest: ChallengerEntry[] } {
  if (queue.length === 0) return { picked: null, rest: [] };
  const idx = mode === 'random' ? Math.floor(Math.random() * queue.length) : 0;
  const picked = queue[idx];
  const rest = queue.filter((_, i) => i !== idx);
  return { picked, rest };
}

/**
 * Rich, emotionally expressive, non-repeating Vietnamese TikTok Live commentary
 * & synchronized gesture engine. Adapts to 4 match phases, tactical shocks, and
 * challenger gender/age honorifics — NEVER reciting robotic move logs!
 */
export function buildInstantWuxiaCommentary(params: {
  boardAfter: BoardState;
  move: Move;
  notation: string;
  actorName: string;
  playedMotif: string;
  analysis: DeepAnalysisResult;
  challengerName?: string;
  guestGender?: GuestGender;
  guestAge?: number;
  scoreDeltaForRed?: number;
  prevWinProbRed?: number;
  recentLines?: string[];
}): CommentaryItem {
  const {
    boardAfter,
    move,
    notation,
    actorName,
    playedMotif,
    analysis,
    challengerName = 'chàng',
    guestGender = 'nam',
    guestAge = 26,
    scoreDeltaForRed = 0,
    prevWinProbRed,
    recentLines = [],
  } = params;

  const script = buildMovePerformanceScript({
    boardAfter,
    move,
    playedMotif,
    analysis,
    challengerName,
    guestGender,
    guestAge,
    scoreDeltaForRed,
    prevWinProbRed,
    recentLines,
  });

  return {
    id: `cmt_${Date.now()}_${boardAfter.moveCount}`,
    moveNumber: boardAfter.moveCount,
    actor: actorName,
    notation,
    motif: script.motif,
    line: script.line,
    mood: emotionToMood(script.emotion),
    emotion: script.emotion,
    emotionLabel: EMOTION_LABELS_VI[script.emotion],
    vocalCue: '',
    gesture: script.gesture,
    stageDirection: script.stageDirection,
    phaseLabel: script.phaseLabel,
    source: 'engine',
  };
}

export const SIMULATED_TIKTOK_AUDIENCE: Array<{
  username: string;
  gender: GuestGender;
  age: number;
  lines: string[];
}> = [
  {
    username: '@KiemKhachSaiGon',
    gender: 'nam',
    age: 26,
    lines: [
      '!choi',
      'Chú rể đánh chắc tay kẻo đêm nay ôm gối ra hành lang ngắm trăng kìa!',
      'Cô dâu áo đỏ trêu chàng duyên quá trời ơi, thả tim rần rần!',
    ],
  },
  {
    username: '@TieuYenNhi_99',
    gender: 'nu',
    age: 24,
    lines: [
      '!choi',
      'Ánh mắt tân nương liếc theo quân cờ cuốn quá hai họ ơi!',
      'Trước khi động phòng làm ván cờ thế này mới chất chứ!',
    ],
  },
  {
    username: '@LaoGiaCoTuong',
    gender: 'nam',
    age: 63,
    lines: [
      '!choi',
      'Họ nhà trai cổ vũ chú rể đi nào, phải ra xe sớm mới thắng nổi cô dâu!',
      'Cốt truyện đêm hoa chúc đánh cờ nghe duyên quá, cuốn không rời mắt được!',
    ],
  },
  {
    username: '@MinhNguyet_88',
    gender: 'nu',
    age: 35,
    lines: [
      '!choi',
      'Họ nhà gái ủng hộ Điêu Nguyệt hết mình nha, bắt chú rể ngắm trăng đi!',
      'Xưng chàng với thiếp nghe ngọt lịm luôn á!',
    ],
  },
  {
    username: '@ThieuNienVoLam',
    gender: 'nam',
    age: 18,
    lines: [
      '!choi',
      'Ván sau cho em lên làm tân lang ứng chiến với cô dâu áo đỏ ạ!',
      'Phòng live đám cưới đêm nay cháy quá trời!',
    ],
  },
  {
    username: '@CoThuHaNoi',
    gender: 'nam',
    age: 42,
    lines: [
      '!choi',
      'Cố lên chú rể ơi, cả họ nhà trai đặt niềm tin vào anh đấy!',
      'Giọng tân nương nghe vừa ngọt vừa có uy áp, quá đỉnh!',
    ],
  },
];
