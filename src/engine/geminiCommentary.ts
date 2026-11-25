import type { HostEmotion } from '../scene/portraitKinematics';
import type { GuestGender } from '../data/characters';
import { resolvePronounProfile, type PerformanceGesture } from './livePerformance';
import type { CommentaryItem } from './matchmaker';
import { EMOTION_LABELS_VI, emotionToMood } from './matchmaker';

const VALID_EMOTIONS = new Set<HostEmotion>([
  'calm',
  'amused',
  'thinking',
  'surprised',
  'fierce',
  'check',
  'victory',
]);

const VALID_GESTURES = new Set<PerformanceGesture>([
  'sip_tea',
  'tease',
  'think_fan',
  'closeup_talk',
  'groom_react',
]);

export interface GeminiCommentaryContext {
  motif: string;
  phaseLabel: string;
}

export function buildGeminiTacticalRead(params: {
  side: 'red' | 'black';
  inCheck: boolean;
  isGameOver: boolean;
  tacticalEvent?: string;
  botCaptured?: string;
  playerCaptured?: string;
  scoreDeltaForRed: number;
  winProbRed: number;
  guestGender: GuestGender;
  guestAge: number;
}): string {
  const p = resolvePronounProfile(params.guestGender, params.guestAge);
  if (params.inCheck) {
    return `Đang CHIẾU TƯỚNG nghẹt thở — chỉ một sơ suất là ${p.guest} thua trận ngay!`;
  }
  if (params.isGameOver) return 'Ván cờ vừa PHÂN ĐỊNH THẮNG BẠI!';
  if (params.side === 'red' && params.tacticalEvent === 'comeback_player') {
    return `${p.guestCap} vừa tung cú LẬT KÈO ngoạn mục từ thế thua sang thế cân bằng/áp đảo!`;
  }
  if (params.botCaptured) {
    return `${p.self} vừa chớp thời cơ thu phục quân ${params.botCaptured} của ${p.guest}!`;
  }
  if (params.playerCaptured) {
    return `${p.guestCap} vừa ra tay mạnh mẽ đoạt quân ${params.playerCaptured} của ${p.self}!`;
  }
  if (params.side === 'red' && params.scoreDeltaForRed <= -110) {
    return `${p.guestCap} vừa đi hơi vội vàng để hở sườn — cơ hội vàng cho ${p.self} chọc ghẹo và phản công!`;
  }
  if (params.side === 'red' && params.scoreDeltaForRed >= 95) {
    return `${p.guestCap} vừa đi một nước cờ xuất thần sâu sắc khiến ${p.self} phải trầm trồ nể phục!`;
  }
  if (params.winProbRed <= 36) {
    return `${p.self} đang chiếm thượng phong rõ rệt trên bàn cờ!`;
  }
  if (params.winProbRed >= 64) {
    return `${p.guestCap} đang ép sân rất gắt khiến ${p.self} phải tập trung hóa giải!`;
  }
  return 'Đôi bên đang so kè cân tài cân sức đầy kịch tính dưới ánh trăng hồ sen.';
}

export type GeminiCommentaryPayload = Pick<
  CommentaryItem,
  | 'motif'
  | 'line'
  | 'mood'
  | 'emotion'
  | 'emotionLabel'
  | 'gesture'
  | 'stageDirection'
  | 'phaseLabel'
  | 'vocalCue'
>;

function cleanText(value: unknown): string {
  return String(value ?? '')
    .replace(/<[^>]+>/g, '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeGeminiCommentaryResponse(
  parsed: unknown,
  context: GeminiCommentaryContext,
): GeminiCommentaryPayload | null {
  if (!parsed || typeof parsed !== 'object') return null;
  const data = parsed as Record<string, unknown>;
  const line = cleanText(data.line);
  if (!line) return null;

  const emotion = VALID_EMOTIONS.has(data.emotion as HostEmotion)
    ? (data.emotion as HostEmotion)
    : 'calm';
  const gesture = VALID_GESTURES.has(data.gesture as PerformanceGesture)
    ? (data.gesture as PerformanceGesture)
    : 'closeup_talk';

  return {
    motif: cleanText(context.motif).slice(0, 80),
    line,
    mood: emotionToMood(emotion),
    emotion,
    emotionLabel: EMOTION_LABELS_VI[emotion],
    gesture,
    stageDirection: cleanText(data.stageDirection).slice(0, 64) || undefined,
    phaseLabel: cleanText(context.phaseLabel).slice(0, 80) || undefined,
    vocalCue: '',
  };
}

export function buildGeminiCommentaryItem(
  parsed: unknown,
  context: GeminiCommentaryContext & {
    id: string;
    moveNumber: number;
    actor: string;
    notation: string;
  },
): CommentaryItem | null {
  const payload = normalizeGeminiCommentaryResponse(parsed, context);
  if (!payload) return null;
  return {
    ...payload,
    id: context.id,
    moveNumber: context.moveNumber,
    actor: context.actor,
    notation: context.notation,
    source: 'gemini',
  };
}
