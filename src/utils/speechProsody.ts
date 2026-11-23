/**
 * Pure, decoupled Vietnamese Emotional Speech Prosody & Natural Pausing Engine.
 *
 * Powers BOTH:
 * 1) Server-side Gemini 3.8 TTS (`speechMetadata.style` + expressive `<breath>`/`<laugh>`/`<gasp>` tags)
 * 2) Client-side expressive clause-by-clause speech cadence (real breath pauses & per-clause pitch/rate inflection)
 *    whenever browser SpeechSynthesis fallback is active.
 */

export type SpeechEmotion =
  | 'calm'
  | 'amused'
  | 'thinking'
  | 'surprised'
  | 'fierce'
  | 'check'
  | 'victory';

export interface ProsodyChunk {
  text: string;
  pauseAfterMs: number;
  rateMultiplier: number;
  pitchOffset: number;
  isInterjection: boolean;
}

export interface GeminiTtsPayload {
  text: string;
  style: string;
}

const INTERJECTION_RE =
  /^(hì hì|khẽ cười|ái chà|ồ|ủa|chà|khoan đã|trời ơi|úi|hây da|nào|chàng ơi)/i;

const EMOTION_STYLE_MAP: Record<SpeechEmotion, string> = {
  calm: 'Expressive Vietnamese female ancient-romance narrator, warm gentle intimate voice, unhurried cinematic storytelling with clear breath pauses between phrases.',
  amused:
    'Expressive Vietnamese female actress, playfully teasing and coyly amused newlywed bride, light musical inflection with natural pauses before witty punchlines.',
  thinking:
    'Thoughtful Vietnamese female strategist, soft intrigued tone with reflective pauses and unhurried deliberate phrasing.',
  surprised:
    'Expressive Vietnamese female narrator, delighted genuine surprise and admiration, lively rising intonation with a brief dramatic beat after exclamations.',
  fierce:
    'Charismatic Vietnamese female wuxia grandmaster, confident poised intensity with crisp dramatic pauses and commanding cadence.',
  check:
    'Dramatic Vietnamese female wuxia host delivering a thrilling checkmate warning, breathless urgency balanced with teasing charm and sharp dramatic pauses.',
  victory:
    'Joyful triumphant Vietnamese female bride, warm sparkling celebration with expressive melodic cadence and natural pauses.',
};

const EMOTION_BASE_RATE: Record<SpeechEmotion, number> = {
  calm: 0.96,
  amused: 0.98,
  thinking: 0.92,
  surprised: 1.0,
  fierce: 1.01,
  check: 1.02,
  victory: 0.99,
};

const EMOTION_BASE_PITCH: Record<SpeechEmotion, number> = {
  calm: 1.03,
  amused: 1.08,
  thinking: 1.01,
  surprised: 1.11,
  fierce: 0.99,
  check: 1.05,
  victory: 1.09,
};

export function normalizeSpeechEmotion(emotion?: string): SpeechEmotion {
  if (
    emotion === 'calm' ||
    emotion === 'amused' ||
    emotion === 'thinking' ||
    emotion === 'surprised' ||
    emotion === 'fierce' ||
    emotion === 'check' ||
    emotion === 'victory'
  ) {
    return emotion;
  }
  return 'calm';
}

export function getEmotionBaseProsody(emotion?: string): {
  baseRate: number;
  basePitch: number;
} {
  const emo = normalizeSpeechEmotion(emotion);
  return {
    baseRate: EMOTION_BASE_RATE[emo],
    basePitch: EMOTION_BASE_PITCH[emo],
  };
}

/**
 * Splits a Vietnamese commentary line into natural rhythmic micro-clauses
 * with explicit silence pauses (`pauseAfterMs`) and per-clause emotional modulation.
 */
export function splitVietnameseProsodyChunks(
  rawText: string,
  emotion?: string,
): ProsodyChunk[] {
  const emo = normalizeSpeechEmotion(emotion);
  const cleaned = rawText
    .replace(/<[^>]+>/g, '')
    .replace(/["“”*#]/g, '')
    .replace(/…/g, '...')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return [];

  // Step 1: Split on strong cinematic pauses (..., —, –, !, ?, ., ;) preserving delimiter
  const rawSegments: Array<{ text: string; delim: string }> = [];
  const tokenRe = /([^.!?—–;]+)(\.\.\.|—|–|[!?;.]+)?/g;
  let match: RegExpExecArray | null;
  while ((match = tokenRe.exec(cleaned)) !== null) {
    const segText = (match[1] ?? '').trim();
    const delim = (match[2] ?? '').trim();
    if (!segText) continue;
    rawSegments.push({ text: segText, delim });
  }

  // Step 2: Sub-split overly long segments (> 9 words) on natural commas so voice breathes cleanly
  const refined: Array<{ text: string; delim: string }> = [];
  for (const seg of rawSegments) {
    const words = seg.text.split(/\s+/);
    if (words.length >= 10 && seg.text.includes(',')) {
      const commaParts = seg.text
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean);
      let acc = '';
      commaParts.forEach((part, idx) => {
        const isLast = idx === commaParts.length - 1;
        const candidate = acc ? `${acc}, ${part}` : part;
        const candWords = candidate.split(/\s+/).length;
        // Emit clause once it's at least 4 words OR is an interjection opener
        if (!isLast && (candWords >= 4 || INTERJECTION_RE.test(candidate))) {
          refined.push({ text: candidate, delim: ',' });
          acc = '';
        } else if (isLast) {
          refined.push({ text: candidate, delim: seg.delim });
          acc = '';
        } else {
          acc = candidate;
        }
      });
    } else {
      refined.push(seg);
    }
  }

  // Step 3: Compute natural pause duration & expressive pitch/rate curve per clause
  return refined.map((seg, idx) => {
    const isLast = idx === refined.length - 1;
    const isInterjection =
      idx === 0 &&
      seg.text.split(/\s+/).length <= 6 &&
      INTERJECTION_RE.test(seg.text);

    let pauseAfterMs = 0;
    if (!isLast) {
      if (seg.delim === '...') pauseAfterMs = 360;
      else if (seg.delim === '—' || seg.delim === '–') pauseAfterMs = 300;
      else if (seg.delim.includes('!') || seg.delim.includes('?')) pauseAfterMs = 320;
      else if (seg.delim.includes('.') || seg.delim.includes(';')) pauseAfterMs = 330;
      else if (seg.delim === ',') pauseAfterMs = isInterjection ? 220 : 165;
      else pauseAfterMs = 200;
    }

    let rateMultiplier = 1.0;
    let pitchOffset = 0;

    if (isInterjection) {
      rateMultiplier = 0.92;
      pitchOffset = emo === 'check' || emo === 'fierce' ? 0.05 : 0.08;
    } else if (seg.delim.includes('?')) {
      rateMultiplier = 0.96;
      pitchOffset = 0.06;
    } else if (seg.delim.includes('!')) {
      rateMultiplier = emo === 'check' || emo === 'fierce' ? 1.03 : 0.99;
      pitchOffset = emo === 'fierce' ? -0.02 : 0.05;
    } else if (seg.delim === '...') {
      rateMultiplier = 0.93;
      pitchOffset = 0.03;
    } else if (isLast && (emo === 'amused' || emo === 'calm')) {
      // Gentle warm cadence on closing phrase
      rateMultiplier = 0.95;
      pitchOffset = 0.02;
    }

    // Re-attach expressive ? or ! for browser intonation hints (without reading dashes/ellipses awkwardly)
    const spokenText =
      seg.delim === '?' || seg.delim === '!'
        ? `${seg.text}${seg.delim}`
        : seg.text;

    return {
      text: spokenText,
      pauseAfterMs,
      rateMultiplier,
      pitchOffset,
      isInterjection,
    };
  });
}

/**
 * Builds the official Gemini 3.8 TTS text + `speechMetadata.style` payload.
 * Guarantees 100% pure Vietnamese spoken script (zero English instructions leaked into text!)
 * while injecting expressive pacing bursts (`<breath>`, `<laugh>`, `<gasp>`) ONLY on `gemini-3.8-flash-tts`.
 */
export function buildGeminiTtsSpeechPayload(
  rawText: string,
  emotion: string | undefined,
  model: string,
): GeminiTtsPayload {
  const emo = normalizeSpeechEmotion(emotion);
  let text = rawText
    .replace(/<[^>]+>/g, '')
    .replace(/["“”*#]/g, '')
    .replace(/…/g, '...')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 320);

  const supportsVocalBursts = model === 'gemini-3.8-flash-tts';

  if (supportsVocalBursts && text) {
    // Convert dramatic dashes & mid-sentence ellipses into natural spoken breath beats
    text = text
      .replace(/\s*[—–]\s*/g, ', <breath> ')
      .replace(/\.\.\.\s+/g, '... <breath> ');

    if (/^(hì hì|khẽ cười)/i.test(text)) {
      text = `<laugh> ${text}`;
    } else if (/^(ồ!|trời ơi|ái chà)/i.test(text) && (emo === 'surprised' || emo === 'check')) {
      text = `<gasp> ${text}`;
    }
  }

  return {
    text: text.replace(/\s+/g, ' ').trim(),
    style: EMOTION_STYLE_MAP[emo],
  };
}
