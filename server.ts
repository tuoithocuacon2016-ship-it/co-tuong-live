import 'dotenv/config';
import express, { NextFunction, Request, Response } from 'express';
import path from 'path';
import { createHash, timingSafeEqual } from 'crypto';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { buildGeminiTtsSpeechPayload, normalizeSpeechEmotion } from './src/utils/speechProsody';
import { resolvePronounProfile } from './src/engine/livePerformance';
import {
  displayHandle,
  reserveActorId,
  resolveIngestToken,
  sanitizeHandle,
} from './src/engine/liveIdentity';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '1mb' }));

// --- Server-Side Gemini Client (lazy init with required telemetry header) ---
function getGeminiClient(): GoogleGenAI | null {
  const key = process.env.GEMINI_API_KEY;
  if (!key || key === 'MY_GEMINI_API_KEY') return null;
  return new GoogleGenAI({
    apiKey: key,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// --- Real-Time SSE Bus for TikTok Live Chat & Webhook Events ---
interface SseClient {
  id: string;
  res: Response;
}

const sseClients = new Set<SseClient>();

function broadcastLiveEvent(event: string, payload: Record<string, unknown>) {
  const data = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const client of sseClients) {
    try {
      client.res.write(data);
    } catch {
      sseClients.delete(client);
    }
  }
}

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    ok: true,
    clients: sseClients.size,
    geminiConfigured: Boolean(
      process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY',
    ),
    liveIngest: ingestToken() ? 'ready' : 'disabled',
  });
});

app.get('/api/live/stream', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const client: SseClient = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    res,
  };
  sseClients.add(client);

  res.write(
    `event: connected\ndata: ${JSON.stringify({ id: client.id, viewers: sseClients.size })}\n\n`,
  );

  const keepAlive = setInterval(() => {
    try {
      res.write(': keepalive\n\n');
    } catch {
      clearInterval(keepAlive);
    }
  }, 20000);

  req.on('close', () => {
    clearInterval(keepAlive);
    sseClients.delete(client);
  });
});

// --- Live ingest: who may post, and who a message came from ---
// This endpoint used to trust whatever `uniqueId` the body claimed, so any
// request that named itself after the seated challenger could move that
// player's pieces. Two things close that: a shared secret the relay must present,
// and an actor id minted here instead of the handle the viewer typed.
//
// Setup (TikFinity / TikTokLive relay / OBS script):
//   header  x-ctl-ingest-token: <same value as CTL_LIVE_INGEST_TOKEN in .env>
//   POST    /api/live/webhook   {"uniqueId":"..","comment":"p2 bình 5"}
//   POST    /api/live/webhook   {"uniqueId":"..","giftName":"Rose"}
//   POST    /api/live/chat      {"username":"..","text":".."}
function ingestToken(): string | undefined {
  return resolveIngestToken(process.env.CTL_LIVE_INGEST_TOKEN);
}

// Hash first so the comparison is over equal-length digests regardless of token length.
function tokenMatches(presented: string, expected: string): boolean {
  return timingSafeEqual(
    createHash('sha256').update(presented).digest(),
    createHash('sha256').update(expected).digest(),
  );
}

// handle -> actor id, for every handle actually seen on the wire.
const relayActors = new Map<string, string>();

function requireIngestAuth(req: Request, res: Response, next: NextFunction) {
  const token = ingestToken();
  if (!token) {
    res.status(503).json({
      error:
        'Live ingest đang tắt: đặt CTL_LIVE_INGEST_TOKEN vào .env rồi khởi động lại server.',
      code: 'INGEST_NOT_CONFIGURED',
    });
    return;
  }
  const header = req.get('x-ctl-ingest-token') ?? req.get('authorization') ?? '';
  const presented = header.replace(/^Bearer\s+/i, '').trim();
  if (!presented || !tokenMatches(presented, token)) {
    res.status(401).json({ error: 'Sai mã ingest.', code: 'BAD_INGEST_TOKEN' });
    return;
  }
  next();
}

app.post('/api/live/chat', requireIngestAuth, (req: Request, res: Response) => {
  const body = req.body ?? {};
  const username = displayHandle(sanitizeHandle(body.username, 'Khách TikTok'));
  const text = String(body.text ?? '').trim().slice(0, 200);
  if (!text) {
    res.status(400).json({ error: 'Nội dung tin nhắn không được để trống.' });
    return;
  }

  const eventPayload = {
    id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    username,
    actorId: reserveActorId(username, relayActors),
    text,
    gender: body.gender === 'nu' ? 'nu' : body.gender === 'nam' ? 'nam' : undefined,
    age: typeof body.age === 'number' ? body.age : undefined,
    source: String(body.source ?? 'chat'),
    timestamp: Date.now(),
  };

  broadcastLiveEvent('chat', eventPayload);
  res.json({ ok: true, message: eventPayload });
});

// Real TikTok Live Webhook compatible with TikFinity / TikTokLive relay / OBS scripts
app.post('/api/live/webhook', requireIngestAuth, (req: Request, res: Response) => {
  const body = req.body ?? {};
  const username = displayHandle(
    sanitizeHandle(
      body.uniqueId ?? body.nickname ?? body.username ?? body.user,
      'TikTokViewer',
    ),
  );
  const text = String(body.comment ?? body.message ?? body.text ?? '').trim().slice(0, 200);
  const giftName = body.giftName ? String(body.giftName).slice(0, 60) : undefined;

  if (!text && !giftName) {
    res.status(400).json({ error: 'Webhook thiếu trường comment/text hoặc giftName.' });
    return;
  }

  const eventPayload = {
    id: `tt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    username,
    actorId: reserveActorId(username, relayActors),
    text: text || `đã tặng quà ${giftName}!`,
    giftName,
    source: 'tiktok_webhook',
    timestamp: Date.now(),
  };

  broadcastLiveEvent('chat', eventPayload);
  res.json({ ok: true, delivered: sseClients.size, event: eventPayload });
});

// Server-side Gemini Expressive TikTok Live Chess Host Commentator
const VALID_EMOTIONS = new Set([
  'calm',
  'amused',
  'thinking',
  'surprised',
  'fierce',
  'check',
  'victory',
]);

const EMOTION_LABEL_MAP: Record<string, string> = {
  calm: 'Điềm tĩnh',
  amused: 'Trêu chọc',
  thinking: 'Trầm ngâm',
  surprised: 'Bất ngờ',
  fierce: 'Sát khí',
  check: 'Chiếu tướng!',
  victory: 'Khải hoàn',
};

const VALID_GESTURES = new Set([
  'sip_tea',
  'tease',
  'think_fan',
  'closeup_talk',
  'groom_react',
]);

app.post('/api/commentary', async (req: Request, res: Response) => {
  const ai = getGeminiClient();
  if (!ai) {
    res.status(503).json({
      error: 'GEMINI_API_KEY chưa được cấu hình trong Settings > Secrets.',
      code: 'NO_API_KEY',
    });
    return;
  }

  const {
    notation,
    playerMoveNotation,
    botMoveNotation,
    actorName,
    challengerName,
    side,
    motif,
    score,
    scoreDeltaForRed,
    winProbRed,
    inCheck,
    isGameOver,
    captured,
    playerCaptured,
    botCaptured,
    guestCharacter,
    guestGender,
    guestAge,
    phaseLabel,
    tacticalEvent,
    pieceCount,
    moveCount,
    recentLines,
  } = req.body ?? {};

  if (!notation && !botMoveNotation && !playerMoveNotation) {
    res.status(400).json({ error: 'Thiếu dữ liệu nước đi để bình luận.' });
    return;
  }

  try {
    const cleanGuest = String(challengerName ?? actorName ?? 'khách mời').replace(/^@/, '');
    const gender = guestGender === 'nu' ? 'nu' : 'nam';
    const age = typeof guestAge === 'number' ? guestAge : 26;
    const pronouns = resolvePronounProfile(gender, age);
    const delta = typeof scoreDeltaForRed === 'number' ? scoreDeltaForRed : 0;

    const tacticalRead =
      inCheck
        ? `Đang CHIẾU TƯỚNG nghẹt thở — chỉ một sơ suất là ${pronouns.guest} thua trận ngay!`
        : isGameOver
          ? 'Ván cờ vừa PHÂN ĐỊNH THẮNG BẠI!'
          : tacticalEvent === 'comeback_player'
            ? `${pronouns.guestCap} vừa tung cú LẬT KÈO ngoạn mục từ thế thua sang thế cân bằng/áp đảo!`
            : botCaptured
              ? `${pronouns.self} vừa chớp thời cơ thu phục quân ${botCaptured} của ${pronouns.guest}!`
              : playerCaptured
                ? `${pronouns.guestCap} vừa ra tay mạnh mẽ đoạt quân ${playerCaptured} của ${pronouns.self}!`
                : delta <= -110
                  ? `${pronouns.guestCap} vừa đi hơi vội vàng để hở sườn — cơ hội vàng cho ${pronouns.self} chọc ghẹo và phản công!`
                  : delta >= 95
                    ? `${pronouns.guestCap} vừa đi một nước cờ xuất thần sâu sắc khiến ${pronouns.self} phải trầm trồ nể phục!`
                    : (winProbRed ?? 50) <= 36
                      ? `${pronouns.self} đang chiếm thượng phong rõ rệt trên bàn cờ!`
                      : (winProbRed ?? 50) >= 64
                        ? `${pronouns.guestCap} đang ép sân rất gắt khiến ${pronouns.self} phải tập trung hóa giải!`
                        : 'Đôi bên đang so kè cân tài cân sức đầy kịch tính dưới ánh trăng hồ sen.';

    const recentContext =
      Array.isArray(recentLines) && recentLines.length > 0
        ? `Các câu vừa nói gần đây (TUYỆT ĐỐI KHÔNG lặp ý, không lặp thán từ mở đầu): ${recentLines.slice(-5).join(' | ')}`
        : '';

    const prompt = [
      `Giai đoạn ván cờ: ${phaseLabel || 'Hồi II · Trung Cuộc'} (Nước thứ ${moveCount ?? 1}, còn ${pieceCount ?? 28} quân trên bàn).`,
      `Khách mời đang đấu: "${cleanGuest}" (${guestCharacter || 'Kỳ thủ giang hồ'}, ${gender === 'nu' ? 'Nữ' : 'Nam'} ${age} tuổi).`,
      `Xưng hô BẮT BUỘC: tự xưng "${pronouns.self}", gọi đối thủ "${pronouns.guest}", gọi khán giả "${pronouns.audience}".`,
      playerMoveNotation ? `Bối cảnh kín (TUYỆT ĐỐI KHÔNG đọc ký hiệu): ${pronouns.guestCap} vừa đi ${playerMoveNotation}.` : '',
      botMoveNotation ? `Bối cảnh kín (TUYỆT ĐỐI KHÔNG đọc ký hiệu): ${pronouns.self} vừa đáp ${botMoveNotation}.` : `Bối cảnh kín: ${side === 'red' ? pronouns.guestCap : pronouns.self} đi ${notation}.`,
      captured ? `Quân vừa bị bắt: ${captured}.` : '',
      `Diễn biến chiến thuật & cảm xúc: ${tacticalRead} (Thế trận: ${motif ?? 'Hoa Chúc Luận Kỳ'}, tỷ lệ thắng của ${pronouns.guest}: ${winProbRed ?? 50}%, điểm ${score ?? 0}).`,
      recentContext,
      'Viết lời thoại + chỉ đạo cử chỉ đồng bộ cho Kỳ Ma Điêu Nguyệt. Lời thoại gồm 2–3 vế ngắn sắc sảo (16–28 từ) BẮT BUỘC có dấu ngắt nhịp ("...", "—", "!", "?") để đọc lên có cảm xúc và độ lắng. Chọn cử chỉ (gesture) KHỚP 100% với nội dung vừa nói!',
    ]
      .filter(Boolean)
      .join('\n');

    const isAuto = Boolean(req.body?.auto);
    const modelPlans: Array<{ model: string; thinkingLevel: ThinkingLevel }> = [
      { model: 'gemini-4-hydrogen', thinkingLevel: ThinkingLevel.LOW },
      { model: 'gemini-3.1-flash-lite', thinkingLevel: ThinkingLevel.MINIMAL },
    ];

    let response;
    let lastErr: unknown;
    for (const plan of modelPlans) {
      try {
        response = await ai.models.generateContent({
          model: plan.model,
          contents: prompt,
          config: {
            systemInstruction:
              `Bạn là Biên kịch & Đạo diễn cho nhân vật livestream TikTok Kỳ Ma Điêu Nguyệt — mỹ nhân mặc hỷ phục đỏ phượng quan vàng ngồi trong chòi cổ giữa hồ sen dưới ánh trăng đánh cờ tướng. ` +
              `BỐI CẢNH ĐỐI TRẬN HIỆN TẠI: ${pronouns.storyBrief}. ` +
              'NGUYÊN TẮC VÀNG CHO LỜI NÓI & CỬ CHỈ CUỐN HÚT: ' +
              `(1) XƯNG HÔ NHẤT QUÁN 100%: tự xưng "${pronouns.self}", gọi người chơi "${pronouns.guest}", gọi khán giả "${pronouns.audience}". ` +
              '(2) CẤM ĐỌC KÝ HIỆU KHÔ KHAN: tuyệt đối không nói "P2 bình 5", "M8 tiến 7", mà biến thế cờ thành cảm xúc, tâm lý, lời khen ngợi thật lòng khi khách đánh hay, hoặc lời trêu ghẹo duyên dáng khi khách hở sườn. ' +
              '(3) NHỊP ĐIỆU & NGẮT NGHỈ ĐIỆN ẢNH: luôn viết 2–3 vế ngắn (16–28 từ), mở đầu bằng thán từ tự nhiên ("Hì hì...", "Ái chà...", "Ồ!", "Khoan đã...", "Trời ơi..."), dùng "...", "—", "!", "?" tạo khoảng lặng trước câu chốt. Thỉnh thoảng (30–40%) lồng câu hỏi mở kéo khán giả phòng chat thả tim/bình luận. ' +
              '(4) ĐỒNG BỘ CỬ CHỈ (gesture): ' +
              '- "sip_tea": khi ung dung thưởng trà sen, thế trận cân bằng hoặc đang dẫn trước thong thả. ' +
              '- "tease": khi che quạt lụa đỏ chọc ghẹo, cười tinh nghịch lúc đối thủ hở sườn hoặc vừa mất quân. ' +
              '- "think_fan": khi trầm ngâm suy tính thế cờ khó hoặc khen nước sâu hiểm. ' +
              '- "closeup_talk": khi chiếu tướng nghẹt thở, bất ngờ sửng sốt, lật kèo, hoặc trò chuyện trực diện đầy cảm xúc. ' +
              '- "groom_react": khi đối thủ vừa ra đòn xuất thần/chiếu ngược khiến camera lia sang tôn vinh đối thủ. ' +
              '(5) KHÔNG emoji, KHÔNG ngoặc kép thừa, KHÔNG thẻ XML, KHÔNG tiếng Anh trong lời thoại.',
            thinkingConfig: {
              thinkingLevel: plan.thinkingLevel,
            },
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                motif: {
                  type: Type.STRING,
                  description: 'Tên sắc thái thế trận 2–4 chữ giàu chất kiếm hiệp hoa chúc.',
                },
                line: {
                  type: Type.STRING,
                  description: '2–3 vế ngắn tiếng Việt giàu cảm xúc có dấu ngắt (... — ! ?), tổng 16–28 từ, không đọc ký hiệu nước đi.',
                },
                emotion: {
                  type: Type.STRING,
                  description: 'Một trong: calm, amused, thinking, surprised, fierce, check, victory.',
                },
                gesture: {
                  type: Type.STRING,
                  description: 'Cử chỉ nhân vật đồng bộ với lời nói: sip_tea, tease, think_fan, closeup_talk, hoặc groom_react.',
                },
                stageDirection: {
                  type: Type.STRING,
                  description: 'Mô tả cử chỉ diễn xuất ngắn gọn 5–10 chữ tiếng Việt (vd: Khẽ nâng chén trà sen, liếc nhìn bàn cờ).',
                },
              },
              required: ['motif', 'line', 'emotion', 'gesture', 'stageDirection'],
            },
          },
        });
        break;
      } catch (err) {
        lastErr = err;
        const msg = err instanceof Error ? err.message : '';
        if (/503|UNAVAILABLE|429|RESOURCE_EXHAUSTED/i.test(msg)) {
          await new Promise((r) => setTimeout(r, 250));
          continue;
        }
        throw err;
      }
    }

    if (!response) {
      if (isAuto) {
        res.json({ ok: false, fallback: 'engine' });
        return;
      }
      throw lastErr ?? new Error('Không nhận được phản hồi từ Gemini.');
    }

    const rawText = (response.text ?? '').trim();
    const parsed = JSON.parse(rawText);
    const emotion = VALID_EMOTIONS.has(parsed.emotion) ? String(parsed.emotion) : 'calm';
    const gesture = VALID_GESTURES.has(parsed.gesture) ? String(parsed.gesture) : 'closeup_talk';
    const mood =
      emotion === 'check'
        ? 'check'
        : emotion === 'victory'
          ? 'victory'
          : emotion === 'fierce'
            ? 'fierce'
            : 'calm';
    const cleanLine = String(parsed.line ?? '')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    const cleanStageDirection = String(parsed.stageDirection ?? '')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 64);

    res.json({
      ok: true,
      motif: String(parsed.motif ?? motif ?? 'Hoa Chúc Luận Kỳ'),
      line: cleanLine,
      mood,
      emotion,
      emotionLabel: EMOTION_LABEL_MAP[emotion] ?? 'Điềm tĩnh',
      gesture,
      stageDirection: cleanStageDirection,
      phaseLabel: phaseLabel || undefined,
      vocalCue: '',
    });
  } catch (err: unknown) {
    if (req.body?.auto) {
      res.json({ ok: false, fallback: 'engine' });
      return;
    }
    const message = err instanceof Error ? err.message : 'Lỗi gọi Gemini commentary API.';
    const isTransient = /503|UNAVAILABLE/i.test(message);
    res.status(isTransient ? 503 : 502).json({
      error: isTransient
        ? 'Máy chủ bình luận AI đang cao tải tạm thời, vui lòng thử lại sau giây lát.'
        : message,
    });
  }
});

// Server-side Single-Speaker Consistent Gemini TTS (gemini-3.8-flash-lite-tts)
const VALID_VOICES = new Set(['Charon', 'Fenrir', 'Kore', 'Puck', 'Zephyr']);

function wrapPcmAsWav(pcmBuf: Buffer, sampleRate = 24000, channels = 1, bitDepth = 16): Buffer {
  // Already a valid RIFF/WAVE file
  if (pcmBuf.length >= 12 && pcmBuf.subarray(0, 4).toString('ascii') === 'RIFF') {
    return pcmBuf;
  }
  const byteRate = sampleRate * channels * (bitDepth / 8);
  const blockAlign = channels * (bitDepth / 8);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcmBuf.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitDepth, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcmBuf.length, 40);
  return Buffer.concat([header, pcmBuf]);
}

function getGeminiClientWithVersion(apiVersion?: string): GoogleGenAI | null {
  const key = process.env.GEMINI_API_KEY;
  if (!key || key === 'MY_GEMINI_API_KEY') return null;
  return new GoogleGenAI({
    apiKey: key,
    ...(apiVersion ? { apiVersion } : {}),
    httpOptions: {
      ...(apiVersion ? { apiVersion } : {}),
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// In-memory LRU WAV cache (max 60 entries) so repeated opening/test/reaction lines never waste TTS quota
const ttsWavCache = new Map<string, { audioBase64: string; model: string }>();

app.post('/api/tts', async (req: Request, res: Response) => {
  const key = process.env.GEMINI_API_KEY;
  if (!key || key === 'MY_GEMINI_API_KEY') {
    res.status(503).json({
      error: 'GEMINI_API_KEY chưa được cấu hình cho giọng bình luận AI.',
      code: 'NO_API_KEY',
    });
    return;
  }

  // Strip any XML tags or stray quotes so the single-speaker TTS model speaks 100% pure Vietnamese
  // with ONE unified voice timbre (never switching speakers or narrating English stage directions!).
  const cleanText = String(req.body?.text ?? '')
    .replace(/<[^>]+>/g, '')
    .replace(/["“”*#]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 320);

  const requestedVoice = String(req.body?.voice ?? 'Kore');
  const voiceName = VALID_VOICES.has(requestedVoice) ? requestedVoice : 'Kore';
  const emotion = normalizeSpeechEmotion(String(req.body?.emotion ?? req.body?.mood ?? 'calm'));

  if (!cleanText) {
    res.status(400).json({ error: 'Thiếu nội dung lời bình để đọc.' });
    return;
  }

  const cacheKey = `${voiceName}::${emotion}::${cleanText}`;
  const cached = ttsWavCache.get(cacheKey);
  if (cached) {
    res.json({
      ok: true,
      mimeType: 'audio/wav',
      audioBase64: cached.audioBase64,
      voice: voiceName,
      model: cached.model,
      cached: true,
    });
    return;
  }

  // Official Gemini 3.8 TTS expressive speechMetadata.style + single consistent prebuiltVoiceConfig
  const ttsModels = ['gemini-3.8-flash-tts', 'gemini-3.8-flash-lite-tts'];
  const errNotes: string[] = [];
  let quotaHit = false;
  for (const model of ttsModels) {
    try {
      const client = getGeminiClientWithVersion('v1beta');
      if (!client) break;

      const speechPayload = buildGeminiTtsSpeechPayload(cleanText, emotion, model);

      const r = await client.models.generateContent({
        model,
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: speechPayload.text,
                speechMetadata: {
                  style: speechPayload.style,
                },
              } as Record<string, unknown>,
            ],
          },
        ],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName } },
          },
        },
      });

      const audioPart = r.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
      if (audioPart?.inlineData?.data) {
        const rawBuf = Buffer.from(audioPart.inlineData.data, 'base64');
        const wavBuf = wrapPcmAsWav(rawBuf);
        const audioBase64 = wavBuf.toString('base64');
        if (ttsWavCache.size >= 60) {
          const oldest = ttsWavCache.keys().next().value;
          if (oldest) ttsWavCache.delete(oldest);
        }
        ttsWavCache.set(cacheKey, { audioBase64, model });
        res.json({
          ok: true,
          mimeType: 'audio/wav',
          audioBase64,
          voice: voiceName,
          model,
          emotion,
        });
        return;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/429|RESOURCE_EXHAUSTED|quota/i.test(msg)) quotaHit = true;
      errNotes.push(`${model}: ${msg.slice(0, 140)}`);
      if (/503|UNAVAILABLE|429|RESOURCE_EXHAUSTED/i.test(msg)) {
        await new Promise((r) => setTimeout(r, 240));
        continue;
      }
      break;
    }
  }

  // Graceful 200 fallback signal so client switches seamlessly to clause-paused Vietnamese prosody engine
  res.json({
    ok: false,
    fallback: 'browser',
    reason: quotaHit ? 'quota_exceeded' : 'unavailable',
    voice: voiceName,
    detail: errNotes.join(' | ').slice(0, 320),
  });
});

async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Ky Dai Giang Ho 3D] Listening on http://0.0.0.0:${PORT}`);
    console.log(
      ingestToken()
        ? '[live] ingest ready: relay POSTs need the x-ctl-ingest-token header.'
        : '[live] CTL_LIVE_INGEST_TOKEN unset - relay POSTs get 503, so no anonymous writes reach the board.',
    );
  });
}

startServer();
