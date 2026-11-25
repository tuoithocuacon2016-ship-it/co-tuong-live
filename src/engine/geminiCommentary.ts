import type { HostEmotion } from '../scene/portraitKinematics';
import type { PerformanceGesture } from './livePerformance';
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
