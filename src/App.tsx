/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BoardState,
  Coord,
  Move,
  PIECE_NAME_VI,
  applyMoveOnGrid,
  generateLegalMoves,
  generateLegalMovesForSquare,
  isInCheck,
  makeMove,
} from './engine/xiangqi';
import {
  classifyChatMessage,
  colToFile,
  formatMoveVietnamese,
  parseVietnameseChatMove,
} from './engine/notation';
import {
  BotDifficulty,
  DeepAnalysisResult,
  analyzePosition,
  detectMoveMotif,
} from './engine/ai';
import { xiangqiAiClient } from './engine/aiClient';
import {
  BOT_MASTER_PROFILE,
  GuestGender,
  WuxiaCharacterProfile,
  matchGuestCharacter,
} from './data/characters';
import {
  ChallengerEntry,
  CommentaryItem,
  EMOTION_LABELS_VI,
  LiveChatMessage,
  SIMULATED_TIKTOK_AUDIENCE,
  buildInstantWuxiaCommentary,
  buildMoveCommentaryDelivery,
  createChallenger,
  emotionToMood,
  pickNextChallenger,
} from './engine/matchmaker';
import { buildGeminiCommentaryItem } from './engine/geminiCommentary';
import {
  MATCH_PHASE_LABELS_VI,
  PerformanceGesture,
  PerformanceScript,
  buildLiveSessionBeat,
  buildNightTeaseScript,
  buildRepetitionWarningScript,
  classifyTacticalEvent,
  countBoardPieces,
  detectMatchPhase,
  shouldVoiceCommentary,
} from './engine/livePerformance';
import { detectKillPattern, patternNameVi } from './engine/patterns';
import {
  BridalLadder,
  DOWRY_LAYERS,
  DowryLayer,
  forfeitCandle,
  forfeitForPattern,
  initialLadder,
  ladderStep as countLadderStep,
  loadLadder,
  saveLadder,
  shouldForfeitForPattern,
} from './engine/bridalLadder';
import {
  NightTheme,
  nightBookFavour,
  nightDowryStatus,
  resolveNightTheme,
} from './engine/nightThemes';
import {
  CONCESSION_STORAGE_KEY,
  ConcessionChoice,
  EVEN_CONCESSION,
  ShieldKind,
  afterOwnerPly,
  concessionBlock,
  concessionLegalMoves,
  openConcession,
  pickGuestMove,
  readConcessionFromSearch,
  serializeConcession,
} from './engine/handicap';
import { refereeForBoard } from './engine/repetitionReferee';
import {
  CrowdVoteState,
  LiveControlMode,
  applySeatLockedProfileUpdate,
  buildLiveInteractionScript,
  createEmptyCrowdVote,
  enqueueChallengerWithPriority,
  evaluateTurnClockTransition,
  recordCrowdVote,
  tallyCrowdVotes,
  triageLiveComment,
} from './engine/liveInteraction';
import { UNATTRIBUTED_ACTOR_ID, actorIdFor, reserveActorId } from './engine/liveIdentity';
import {
  CameraPreset,
  MoveLandingPayload,
  XiangqiStage,
  ZoomFocus,
} from './scene/XiangqiStage';
import {
  DEFAULT_PIECE_STYLE,
  PieceLabelMode,
  PieceThemeId,
  PieceVisualConfig,
  nextPieceLabelMode,
  nextPieceTheme,
} from './scene/pieceStyle';
import { CharacterMood } from './scene/characters3d';
import { BoardFocusSignal, HostEmotion } from './scene/portraitKinematics';
import {
  ActionCuePayload,
  CinemaCameraAngle,
  MoveChoreoPayload,
  resolveKillPatternAudioCue,
} from './scene/cinemaDirector';
import { CommentaryVoiceName, wuxiaAudio } from './utils/wuxiaAudio';
import { voiceMoveListener } from './utils/voiceMoveListener';
import { TitleOverlay } from './components/TitleOverlay';
import { TopBroadcastBar } from './components/TopBroadcastBar';
import { CommentaryBanner } from './components/CommentaryBanner';
import { BottomControlDock, DockTab } from './components/BottomControlDock';
import { StatusModal } from './components/StatusModal';
import { TikTokLiveStudioOverlay } from './components/TikTokLiveStudioOverlay';
import { CinematicPavilionPane } from './components/CinematicPavilionPane';

type AppState = 'title' | 'playing' | 'paused' | 'gameover';

function checkAutostart(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('autostart') === '1';
}

function checkInitialTikTok(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('tiktok') === '1';
}

const PIECE_STYLE_STORAGE_KEY = 'ky_dai_piece_style_v1';
const VALID_PIECE_THEMES = new Set<PieceThemeId>([
  'ivory_crimson',
  'classic_red_white',
  'tournament_white',
]);
const VALID_LABEL_MODES = new Set<PieceLabelMode>(['han', 'han_viet', 'viet']);

/** Tonight's rung on the concession ladder: the link, then the saved pick, then the night's own. */
function loadSavedConcession(): ConcessionChoice {
  if (typeof window === 'undefined') return EVEN_CONCESSION;
  return readConcessionFromSearch(
    window.location.search,
    window.localStorage.getItem(CONCESSION_STORAGE_KEY),
    resolveNightTheme(new Date()).concession,
  );
}

function loadSavedPieceStyle(): PieceVisualConfig {
  if (typeof window === 'undefined') return DEFAULT_PIECE_STYLE;
  try {
    const raw = window.localStorage.getItem(PIECE_STYLE_STORAGE_KEY);
    if (!raw) return DEFAULT_PIECE_STYLE;
    const parsed = JSON.parse(raw) as Partial<PieceVisualConfig>;
    const theme =
      parsed.theme && VALID_PIECE_THEMES.has(parsed.theme)
        ? parsed.theme
        : DEFAULT_PIECE_STYLE.theme;
    const labelMode =
      parsed.labelMode && VALID_LABEL_MODES.has(parsed.labelMode)
        ? parsed.labelMode
        : DEFAULT_PIECE_STYLE.labelMode;
    return { theme, labelMode };
  } catch {
    return DEFAULT_PIECE_STYLE;
  }
}

const INITIAL_CHALLENGER: ChallengerEntry = createChallenger(
  '@KiemKhach_VN',
  actorIdFor('local', '@KiemKhach_VN'),
  'nam',
  26,
  matchGuestCharacter('nam', 26),
);

const INITIAL_QUEUE: ChallengerEntry[] = [
  createChallenger('@TieuYenNhi_99', actorIdFor('local', '@TieuYenNhi_99'), 'nu', 24),
  createChallenger('@LaoGiaCoTuong', actorIdFor('local', '@LaoGiaCoTuong'), 'nam', 64),
  createChallenger('@MinhNguyet_88', actorIdFor('local', '@MinhNguyet_88'), 'nu', 34),
];

// The demo audience is simulated, but it is simulated as a *viewer*: the fake relay mints ids the
// same way the real ingest server does, so a scripted fan who happens to type the seated player's
// handle gets their own id instead of the operator's `local:` privileges.
const simulatedAudienceActors = new Map<string, string>();

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<XiangqiStage | null>(null);

  const [appState, setAppState] = useState<AppState>(() =>
    checkAutostart() ? 'playing' : 'title',
  );
  const [concession, setConcession] = useState<ConcessionChoice>(loadSavedConcession);
  // The conceded array and the ledger that tracks its shields are laid together, once, before the
  // first stone is touched - a board and a rule set that disagree is the failure this avoids.
  const [initialOpening] = useState(() => openConcession(concession));
  const [board, setBoard] = useState<BoardState>(() => initialOpening.board);
  const [analysis, setAnalysis] = useState<DeepAnalysisResult>(() =>
    analyzePosition(initialOpening.board, 'cao_thu', { mode: 'preview' }),
  );
  const concessionRef = useRef(initialOpening.state);
  const [moveHistory, setMoveHistory] = useState<string[]>([]);

  const [activeChallenger, setActiveChallenger] =
    useState<ChallengerEntry>(INITIAL_CHALLENGER);
  const [queue, setQueue] = useState<ChallengerEntry[]>(INITIAL_QUEUE);

  const [messages, setMessages] = useState<LiveChatMessage[]>([
    {
      id: 'init_1',
      username: BOT_MASTER_PROFILE.name,
      text: 'Đêm tân hôn nến đỏ khai cuộc! Chàng thắng thiếp thì thiếp giao lại một lớp hồi môn, thua thì ôm gối ngắm trăng nha! Chat "!choi" để lên đài hoặc gửi nước đi như "p2 bình 5", "m8 tiến 7", "x7 bình 3".',
      timestamp: Date.now() - 4000,
      kind: 'bot',
    },
    {
      id: 'init_2',
      username: '@TieuYenNhi_99',
      text: '!choi — hai họ vào xem tân nương áo đỏ thử tài chú rể nè!',
      timestamp: Date.now() - 2000,
      kind: 'viewer',
    },
  ]);

  const [commentary, setCommentary] = useState<CommentaryItem | null>({
    id: 'cmt_open',
    moveNumber: 0,
    actor: BOT_MASTER_PROFILE.name,
    notation: 'Khai Cuộc',
    motif: 'Hoa Chúc Khai Đài',
    line: 'Chào hai họ phòng live! Trước giờ động phòng hoa chúc... chàng đánh với thiếp một ván nhé — thắng thì thiếp giao lại một lớp hồi môn, còn thua thì ra hành lang ngắm trăng nha!',
    mood: 'calm',
    emotion: 'amused',
    emotionLabel: EMOTION_LABELS_VI.amused,
    gesture: 'closeup_talk',
    stageDirection: 'Mỉm cười rạng rỡ chào hai họ dưới ánh nến hỷ',
    phaseLabel: MATCH_PHASE_LABELS_VI.khai_cuoc,
    source: 'engine',
  });

  const [dockCollapsed, setDockCollapsed] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth < 768 : false,
  );
  const [activeTab, setActiveTab] = useState<DockTab>('chat');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('liveBot');
  const [splitScreen, setSplitScreen] = useState(true);
  const [zoomFocus, setZoomFocus] = useState<ZoomFocus>('bot');
  const [showAnalysis, setShowAnalysis] = useState(true);
  const [previewVariationIdx, setPreviewVariationIdx] = useState<number | null>(null);
  const [difficulty, setDifficulty] = useState<BotDifficulty>('cao_thu');
  const [muted, setMuted] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [voiceName, setVoiceName] = useState<CommentaryVoiceName>('Kore');
  const [speechRate, setSpeechRate] = useState<number>(1.0);
  const [speakingEngine, setSpeakingEngine] = useState<'gemini' | 'browser' | null>(null);
  const [tiktokFrame, setTiktokFrame] = useState<boolean>(() => checkInitialTikTok());
  const [audienceWaveOn, setAudienceWaveOn] = useState(true);
  const [autoCommentReply, setAutoCommentReply] = useState(true);
  const [liveMode, setLiveMode] = useState<LiveControlMode>('duel_1v1');
  const [awaitingReadyCheck, setAwaitingReadyCheck] = useState(false);
  const [afkStrikes, setAfkStrikes] = useState(0);
  const [crowdVote, setCrowdVote] = useState<CrowdVoteState>(() => createEmptyCrowdVote());
  const [voiceListening, setVoiceListening] = useState(false);
  const [voiceInterimText, setVoiceInterimText] = useState('');
  const [pendingVoiceMove, setPendingVoiceMove] = useState<{
    move: Move;
    notation: string;
    transcript: string;
  } | null>(null);
  const [spotlightComment, setSpotlightComment] = useState<{
    username: string;
    text: string;
    score: number;
    receivedAt: number;
  } | null>(null);
  const [botThinking, setBotThinking] = useState(false);
  const [turnSecondsLeft, setTurnSecondsLeft] = useState(45);
  const [viewerCount, setViewerCount] = useState(1284);
  const [moveHintError, setMoveHintError] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const [selectedSquare, setSelectedSquare] = useState<Coord | null>(null);
  const [preferredPieceId, setPreferredPieceId] = useState<string | null>(null);
  const [boardFocus, setBoardFocus] = useState<BoardFocusSignal | null>(null);
  const [hostEmotion, setHostEmotion] = useState<HostEmotion>('amused');
  const [cinemaAngle, setCinemaAngle] = useState<CinemaCameraAngle>('auto');
  const [pieceStyle, setPieceStyle] = useState<PieceVisualConfig>(() =>
    loadSavedPieceStyle(),
  );
  const pieceStyleRef = useRef(pieceStyle);
  const [dowry, setDowry] = useState<BridalLadder>(() => loadLadder(window.localStorage));
  const dowryRef = useRef(dowry);
  // One evening is one chapter: resolved once per session so the rotation cannot flip at midnight
  // and strand a game halfway through a different night's book line.
  const nightRef = useRef<NightTheme>(resolveNightTheme(new Date()));
  const [moveEvent, setMoveEvent] = useState<MoveChoreoPayload | null>(null);
  const [actionCue, setActionCue] = useState<ActionCuePayload | null>(null);
  const focusSeqRef = useRef(0);
  const moveChoreoSeqRef = useRef(0);
  const lastVerifiedMotifRef = useRef('');
  const actionCueSeqRef = useRef(0);
  const recentLinesRef = useRef<string[]>([]);
  const recentPosKeysRef = useRef<string[]>([]);
  const phaseRef = useRef<ReturnType<typeof detectMatchPhase> | null>(null);
  const prevScoreRef = useRef<number>(0);
  const prevWinProbRedRef = useRef<number>(50);
  const turnSeqRef = useRef<number>(0);
  const nudgedTurnKeyRef = useRef<string>('');
  const countdownTurnKeyRef = useRef<string>('');
  const gestureChoreoTimerRef = useRef<number | null>(null);
  const lastViewerReplyAtRef = useRef<number>(0);
  const lastIllegalSpokenAtRef = useRef<number>(0);
  const lastRepetitionSpokenAtRef = useRef<number>(0);
  const lastRepetitionWarnPlyRef = useRef<number>(-999);
  const voiceConfirmTimerRef = useRef<number | null>(null);
  const landedMoveSeqRef = useRef(0);
  const settledMoveSeqRef = useRef(0);
  const pendingLandingCuesRef = useRef(new Map<number, Array<() => void>>());
  const pendingSettledCuesRef = useRef(new Map<number, Array<() => void>>());

  const queueMoveLandingCue = useCallback((seq: number, cue: () => void) => {
    if (landedMoveSeqRef.current >= seq) {
      cue();
      return;
    }
    const cues = pendingLandingCuesRef.current.get(seq) ?? [];
    cues.push(cue);
    pendingLandingCuesRef.current.set(seq, cues);
  }, []);

  const queueMoveSettledCue = useCallback((seq: number, cue: () => void) => {
    if (settledMoveSeqRef.current >= seq) {
      cue();
      return;
    }
    const cues = pendingSettledCuesRef.current.get(seq) ?? [];
    cues.push(cue);
    pendingSettledCuesRef.current.set(seq, cues);
  }, []);

  const flushMoveCues = useCallback(
    (phase: 'landing' | 'settle', seq: number) => {
      if (phase === 'landing') {
        if (landedMoveSeqRef.current >= seq) return;
        landedMoveSeqRef.current = seq;
      } else {
        if (settledMoveSeqRef.current >= seq) return;
        settledMoveSeqRef.current = seq;
      }
      const queue =
        phase === 'landing'
          ? pendingLandingCuesRef.current
          : pendingSettledCuesRef.current;
      const cues = queue.get(seq) ?? [];
      queue.delete(seq);
      for (const cue of cues) cue();
    },
    [],
  );

  // Refs synced to latest state so Three.js callbacks & SSE listeners never go stale
  const boardRef = useRef(board);
  const analysisRef = useRef(analysis);
  const appStateRef = useRef(appState);
  const activeChallengerRef = useRef(activeChallenger);
  const queueRef = useRef(queue);
  const liveModeRef = useRef(liveMode);
  const autoCommentReplyRef = useRef(autoCommentReply);
  const awaitingReadyCheckRef = useRef(awaitingReadyCheck);
  const afkStrikesRef = useRef(afkStrikes);
  const crowdVoteRef = useRef(crowdVote);
  const speakingEngineRef = useRef(speakingEngine);
  const difficultyRef = useRef(difficulty);
  const selectedSquareRef = useRef(selectedSquare);
  const preferredPieceIdRef = useRef(preferredPieceId);
  const botThinkingRef = useRef(botThinking);
  const botTimerRef = useRef<number | null>(null);
  const speakTimerRef = useRef<number | null>(null);
  const speakUiSeqRef = useRef<number>(0);

  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);
  useEffect(() => {
    liveModeRef.current = liveMode;
  }, [liveMode]);
  useEffect(() => {
    autoCommentReplyRef.current = autoCommentReply;
  }, [autoCommentReply]);
  useEffect(() => {
    awaitingReadyCheckRef.current = awaitingReadyCheck;
  }, [awaitingReadyCheck]);
  useEffect(() => {
    afkStrikesRef.current = afkStrikes;
  }, [afkStrikes]);
  useEffect(() => {
    crowdVoteRef.current = crowdVote;
  }, [crowdVote]);
  useEffect(() => {
    speakingEngineRef.current = speakingEngine;
    // Echo-Guard: suppress Voice Move Listener whenever Kỳ Ma is speaking or thinking!
    voiceMoveListener.setSuppressed(speakingEngine !== null || botThinkingRef.current);
  }, [speakingEngine, botThinking]);

  useEffect(() => {
    boardRef.current = board;
  }, [board]);
  useEffect(() => {
    analysisRef.current = analysis;
  }, [analysis]);
  useEffect(() => {
    appStateRef.current = appState;
    document.body.dataset.state = appState;
  }, [appState]);
  useEffect(() => {
    activeChallengerRef.current = activeChallenger;
  }, [activeChallenger]);
  useEffect(() => {
    difficultyRef.current = difficulty;
  }, [difficulty]);
  useEffect(() => {
    selectedSquareRef.current = selectedSquare;
  }, [selectedSquare]);
  useEffect(() => {
    preferredPieceIdRef.current = preferredPieceId;
  }, [preferredPieceId]);
  useEffect(() => {
    botThinkingRef.current = botThinking;
  }, [botThinking]);

  const appendMessage = useCallback((msg: Omit<LiveChatMessage, 'id' | 'timestamp'>) => {
    setMessages((prev) => [
      ...prev.slice(-45),
      {
        ...msg,
        id: `m_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        timestamp: Date.now(),
      },
    ]);
  }, []);

  const voiceNameRef = useRef(voiceName);
  useEffect(() => {
    voiceNameRef.current = voiceName;
    wuxiaAudio.voiceName = voiceName;
  }, [voiceName]);

  const speechRateRef = useRef(speechRate);
  useEffect(() => {
    speechRateRef.current = speechRate;
    wuxiaAudio.speechRate = speechRate;
  }, [speechRate]);

  const triggerBotSpeaking = useCallback(
    (
      text: string,
      mood: CharacterMood,
      opts?: { emotion?: HostEmotion; vocalCue?: string },
    ) => {
      const uiSeq = ++speakUiSeqRef.current;
      stageRef.current?.setBotState(mood, true);
      if (speakTimerRef.current) window.clearTimeout(speakTimerRef.current);

      const canSpeak = !wuxiaAudio.muted && wuxiaAudio.voiceEnabled;
      if (canSpeak) {
        // Keep Live2D speaking state active while TTS prepares & hands off seamlessly
        setSpeakingEngine('gemini');
      }

      const ttsMood: 'calm' | 'fierce' | 'check' | 'victory' =
        mood === 'check' || mood === 'victory' || mood === 'fierce' ? mood : 'calm';

      void wuxiaAudio.speakCommentary(text, {
        mood: ttsMood,
        emotion: opts?.emotion ?? ttsMood,
        voice: voiceNameRef.current,
        rate: speechRateRef.current,
        onStart: (engine) => {
          if (uiSeq !== speakUiSeqRef.current) return;
          setSpeakingEngine(engine);
          stageRef.current?.setBotState(mood, true);
          if (speakTimerRef.current) window.clearTimeout(speakTimerRef.current);
          // Generous safety cap so audio.onended always drives natural stop without premature cutoff
          speakTimerRef.current = window.setTimeout(() => {
            if (uiSeq !== speakUiSeqRef.current) return;
            setSpeakingEngine(null);
            stageRef.current?.setBotState(mood, false);
          }, Math.min(24000, Math.max(8500, text.length * 130)));
        },
        onEnd: () => {
          if (uiSeq !== speakUiSeqRef.current) return;
          if (speakTimerRef.current) window.clearTimeout(speakTimerRef.current);
          setSpeakingEngine(null);
          stageRef.current?.setBotState(mood, false);
        },
      });

      // Fallback jaw-stop timer ONLY if muted or browser blocks autoplay before user gesture
      speakTimerRef.current = window.setTimeout(() => {
        if (uiSeq !== speakUiSeqRef.current) return;
        setSpeakingEngine(null);
        stageRef.current?.setBotState(mood, false);
      }, Math.min(14000, Math.max(5500, text.length * 95)));
    },
    [],
  );

  const recordRecentLine = useCallback((line: string) => {
    // Wider than any single event pool, otherwise pickFresh filters to empty and cycles anyway.
    recentLinesRef.current = [...recentLinesRef.current.slice(-14), line];
  }, []);

  const applyDowryForfeit = useCallback(
    (next: BridalLadder, lost: DowryLayer | null, reason: string) => {
      if (!lost) return;
      dowryRef.current = next;
      setDowry(next);
      saveLadder(window.localStorage, next);
      appendMessage({
        username: 'Trong Tài Kỳ Đài',
        text:
          `${reason} — tân nương giao lại ${lost.nameVi} cho ` +
          `${activeChallengerRef.current.username}. ` +
          `Hồi môn còn lại: ${next.held.length}/${DOWRY_LAYERS.length}.`,
        kind: 'system',
      });
    },
    [appendMessage],
  );

  const dispatchGestureCue = useCallback(
    (gesture?: PerformanceGesture, stageDirection?: string, delayMs = 0) => {
      if (!gesture) return;
      if (gestureChoreoTimerRef.current) {
        window.clearTimeout(gestureChoreoTimerRef.current);
        gestureChoreoTimerRef.current = null;
      }
      const fire = () => {
        setActionCue({
          seq: ++actionCueSeqRef.current,
          type: gesture,
          actor: gesture === 'groom_react' ? 'groom' : 'bride',
          stageDirectionVi: stageDirection,
        });
      };
      if (delayMs > 0) {
        gestureChoreoTimerRef.current = window.setTimeout(fire, delayMs);
      } else {
        fire();
      }
    },
    [],
  );

  const performScriptBeat = useCallback(
    (
      script: PerformanceScript,
      opts?: {
        moveNumber?: number;
        notation?: string;
        delayGestureMs?: number;
        source?: 'engine' | 'gemini';
      },
    ) => {
      const mood = emotionToMood(script.emotion);
      const item: CommentaryItem = {
        id: `beat_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        moveNumber: opts?.moveNumber ?? boardRef.current.moveCount,
        actor: BOT_MASTER_PROFILE.name,
        notation: opts?.notation ?? script.motif,
        motif: script.motif,
        line: script.line,
        mood,
        emotion: script.emotion,
        emotionLabel: EMOTION_LABELS_VI[script.emotion],
        gesture: script.gesture,
        stageDirection: script.stageDirection,
        phaseLabel: script.phaseLabel,
        source: opts?.source ?? 'engine',
      };
      recordRecentLine(item.line);
      setCommentary(item);
      setHostEmotion(script.emotion);
      dispatchGestureCue(script.gesture, script.stageDirection, opts?.delayGestureMs ?? 0);
      triggerBotSpeaking(item.line, mood, { emotion: script.emotion });
    },
    [dispatchGestureCue, recordRecentLine, triggerBotSpeaking],
  );

  const lastConcessionSpokenAtRef = useRef<number>(0);
  const concessionClaimTimerRef = useRef<number | null>(null);

  /**
   * The gate every Red door runs through: a stone tonight's concession protects stays where it is,
   * and the rule is said out loud rather than the move played and then walked back.
   */
  const refuseConcessionMove = useCallback(
    (blocked: { rule: ShieldKind }) => {
      const guest = activeChallengerRef.current;
      const script = buildLiveInteractionScript({
        kind: 'concession_refused',
        shield: blocked.rule,
        challengerName: guest.username,
        guestGender: guest.gender,
        guestAge: guest.age,
        recentLines: recentLinesRef.current,
      });
      setMoveHintError(script.line);
      appendMessage({ username: BOT_MASTER_PROFILE.name, text: script.line, kind: 'system' });
      const now = Date.now();
      if (now - lastConcessionSpokenAtRef.current > 5000 && speakingEngineRef.current === null) {
        lastConcessionSpokenAtRef.current = now;
        performScriptBeat(script, { notation: 'Lệ Chấp Quân' });
      }
    },
    [appendMessage, performScriptBeat],
  );

  /** Tonight's rung in the bride's own words, said after whatever else just opened the game. */
  const speakConcessionClaim = useCallback(
    (delayMs = 0) => {
      const handicap = concessionRef.current.handicap;
      if (handicap.rank === 0) return;
      const guest = activeChallengerRef.current;
      const script = buildLiveInteractionScript({
        kind: 'concession_claim',
        concessionClaim: handicap.claimVi,
        challengerName: guest.username,
        guestGender: guest.gender,
        guestAge: guest.age,
        recentLines: recentLinesRef.current,
      });
      appendMessage({
        username: BOT_MASTER_PROFILE.name,
        text: `${handicap.nameVi} — ${script.line}`,
        kind: 'system',
      });
      if (concessionClaimTimerRef.current) window.clearTimeout(concessionClaimTimerRef.current);
      const token = turnSeqRef.current;
      concessionClaimTimerRef.current = window.setTimeout(() => {
        concessionClaimTimerRef.current = null;
        if (turnSeqRef.current !== token) return;
        performScriptBeat(script, { notation: handicap.nameVi });
      }, delayMs);
    },
    [appendMessage, performScriptBeat],
  );

  /**
   * Re-lay the board for a new rung. Only before the first stone: mid-game the choice is recorded and
   * waits for the next duel, because withdrawing a piece once the referee has seen the array would
   * contradict the position ledger.
   */
  const handleSelectConcession = useCallback(
    (next: ConcessionChoice) => {
      setConcession(next);
      window.localStorage.setItem(CONCESSION_STORAGE_KEY, serializeConcession(next));
      const setup = openConcession(next);
      if (boardRef.current.moveCount > 0) {
        appendMessage({
          username: BOT_MASTER_PROFILE.name,
          text: `Đã ghi ${setup.handicap.nameVi} cho ván sau — hạ quân rồi thì không rút chấp lại được đâu ${activeChallengerRef.current.username} ơi!`,
          kind: 'system',
        });
        return;
      }
      const freshAnalysis = analyzePosition(setup.board, difficultyRef.current, {
        mode: 'preview',
      });
      concessionRef.current = setup.state;
      prevScoreRef.current = freshAnalysis.score;
      prevWinProbRedRef.current = freshAnalysis.winProbRed;
      setBoard(setup.board);
      boardRef.current = setup.board;
      setAnalysis(freshAnalysis);
      setSelectedSquare(null);
      setPreferredPieceId(null);
      setMoveHistory([]);
      lastVerifiedMotifRef.current = '';
      stageRef.current?.syncBoard(setup.board, null, false);
      stageRef.current?.setSelectionOverlay(null, []);
      stageRef.current?.updateAnalysisVisuals(setup.board, freshAnalysis, showAnalysis, null);
      speakConcessionClaim();
    },
    [appendMessage, showAnalysis, speakConcessionClaim],
  );

  const requestEmotionalGeminiCommentary = useCallback(
    async (params: {
      notation: string;
      playerMoveNotation?: string;
      botMoveNotation?: string;
      actorName: string;
      side: 'red' | 'black';
      nextBoard: BoardState;
      move: Move;
      verifiedMotif: string;
      nextAnalysis: DeepAnalysisResult;
      scoreDeltaForRed?: number;
      prevWinProbRed?: number;
      playerCaptured?: string;
      botCaptured?: string;
      explicitRequest?: boolean;
    }): Promise<CommentaryItem | null> => {
      if (params.explicitRequest) {
        setAiLoading(true);
        setAiError(null);
      }
      try {
        const guest = activeChallengerRef.current;
        const phase = detectMatchPhase(params.nextBoard);
        const phaseLabel = MATCH_PHASE_LABELS_VI[phase];
        const pieceCount = countBoardPieces(params.nextBoard.grid);
        const tacticalEvent = classifyTacticalEvent({
          boardAfter: params.nextBoard,
          move: params.move,
          analysis: params.nextAnalysis,
          scoreDeltaForRed: params.scoreDeltaForRed ?? 0,
          prevWinProbRed: params.prevWinProbRed,
          phase,
        });

        const res = await fetch('/api/commentary', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            notation: params.notation,
            playerMoveNotation: params.playerMoveNotation,
            botMoveNotation: params.botMoveNotation,
            actorName: params.actorName,
            challengerName: guest.username,
            guestGender: guest.gender,
            guestAge: guest.age,
            side: params.side,
            motif: params.verifiedMotif,
            phaseLabel,
            tacticalEvent,
            pieceCount,
            score: params.nextAnalysis.score,
            scoreDeltaForRed: params.scoreDeltaForRed ?? 0,
            winProbRed: params.nextAnalysis.winProbRed,
            inCheck: params.nextBoard.inCheck !== null,
            isGameOver: params.nextBoard.status !== 'playing',
            captured: params.move.captured
              ? PIECE_NAME_VI[params.move.captured.side][params.move.captured.type]
              : undefined,
            playerCaptured: params.playerCaptured,
            botCaptured: params.botCaptured,
            guestCharacter: guest.character.title,
            moveCount: params.nextBoard.moveCount,
            ladderStep: countLadderStep(dowryRef.current),
            nightIndex: nightRef.current.index,
            recentLines: recentLinesRef.current,
            auto: !params.explicitRequest,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          // A 429 means the show keeps running on the scripted bank instead of Gemini. That is the
          // right failure, but it is invisible on air, so say where the voice came from.
          if (data?.code === 'RATE_LIMITED') {
            console.warn(
              `[commentary] hết lượt gọi Gemini (${Math.ceil(
                Number(data?.retryAfterMs ?? 0) / 1000,
              )}s), chuyển sang lời bình sẵn có.`,
            );
          }
          if (params.explicitRequest) {
            setAiError(data?.error || 'Không thể kết nối bình luận viên AI.');
          }
          return null;
        }
        const item = buildGeminiCommentaryItem(data, {
          id: `gem_${Date.now()}`,
          moveNumber: params.nextBoard.moveCount,
          actor: BOT_MASTER_PROFILE.name,
          notation: params.notation,
          motif: params.verifiedMotif,
          phaseLabel,
        });
        if (!item) return null;
        if (params.explicitRequest) {
          const emotion = item.emotion ?? 'calm';
          recordRecentLine(item.line);
          setCommentary(item);
          setHostEmotion(emotion);
          dispatchGestureCue(item.gesture ?? 'closeup_talk', item.stageDirection, 0);
          triggerBotSpeaking(item.line, item.mood, {
            emotion,
            vocalCue: item.vocalCue,
          });
        }
        return item;
      } catch {
        if (params.explicitRequest) {
          setAiError('Mất kết nối tới máy chủ bình luận AI.');
        }
        return null;
      } finally {
        if (params.explicitRequest) {
          setAiLoading(false);
        }
      }
    },
    [dispatchGestureCue, recordRecentLine, triggerBotSpeaking],
  );

  // Execute a legal move (seamless parallel Gemini emotional commentary — ZERO mid-sentence cutoffs!)
  const commitMove = useCallback(
    (
      move: Move,
      actorName: string,
      side: 'red' | 'black',
      precomputed?: {
        nextAnalysis?: DeepAnalysisResult;
        geminiPromise?: Promise<CommentaryItem | null>;
        scoreDeltaForRed?: number;
        turnToken?: number;
        voiceReply?: boolean;
      },
    ) => {
      if (appStateRef.current !== 'playing' || stageRef.current?.isMoveAnimating()) {
        return;
      }
      const currentBoard = boardRef.current;
      if (side === 'red') {
        const refusal = concessionBlock(currentBoard, concessionRef.current, move);
        if (refusal) {
          refuseConcessionMove(refusal);
          return;
        }
      }
      const notation = formatMoveVietnamese(currentBoard.grid, move);
      const nextBoard = makeMove(currentBoard, move);
      if (side === 'black') {
        // The bride's own plies are what the shield ledger watches: 出林车 only ever exists for one
        // ply, so every Black move has to pass through it, whatever door the search chose it from.
        concessionRef.current = afterOwnerPly(concessionRef.current, move);
      }

      setBoard(nextBoard);
      boardRef.current = nextBoard;
      setMoveHistory((prev) => [...prev, notation]);
      setSelectedSquare(null);
      setMoveHintError(null);
      setTurnSecondsLeft(45);

      if (side === 'red') {
        setPreferredPieceId(move.piece.id);
      }

      const playedMotif = detectMoveMotif(
        currentBoard.grid,
        move,
        nextBoard.grid,
        nightRef.current.focusPattern,
      );
      lastVerifiedMotifRef.current = playedMotif;
      // The dowry follows the strongest pattern on the board, not the one tonight advertised: the
      // focus decides what the room is told, never what the bride pays.
      const killStrike = detectKillPattern(currentBoard.grid, nextBoard.grid, move);
      // The focus may be real but not nameable on this ply. Only the hit that matches the banner
      // drives her line, shot and audio, so the presentation cannot invent a second sát pháp.
      const spokenPattern = detectKillPattern(
        currentBoard.grid,
        nextBoard.grid,
        move,
        nightRef.current.focusPattern,
      );
      const namedPattern =
        [spokenPattern, killStrike].find(
          (hit) => hit && patternNameVi(hit.id) === playedMotif,
        ) ?? null;

      const choreoSeq = ++moveChoreoSeqRef.current;
      const animationStarted =
        stageRef.current?.syncBoard(nextBoard, move, true, choreoSeq) ?? false;
      stageRef.current?.setSelectionOverlay(null, []);
      const isCurrentMove = () =>
        appStateRef.current === 'playing' && boardRef.current === nextBoard;
      const afterLanding = (cue: () => void) => {
        const run = () => {
          if (isCurrentMove()) cue();
        };
        if (animationStarted) {
          queueMoveLandingCue(choreoSeq, run);
        } else {
          run();
        }
      };
      const afterSettled = (cue: () => void) => {
        const run = () => {
          if (isCurrentMove()) cue();
        };
        if (animationStarted) {
          queueMoveSettledCue(choreoSeq, run);
        } else {
          run();
        }
      };

      const patternAudio = namedPattern
        ? resolveKillPatternAudioCue(namedPattern.id, namedPattern.forcing)
        : null;
      afterLanding(() => {
        if (patternAudio === 'guzheng') {
          wuxiaAudio.playGuzhengSweep();
        } else if (patternAudio === 'capture') {
          wuxiaAudio.playCapture();
        } else if (patternAudio === 'check' || nextBoard.inCheck) {
          wuxiaAudio.playCheck();
        } else if (move.captured) {
          wuxiaAudio.playCapture();
        } else {
          wuxiaAudio.playPieceMove();
        }
      });

      const prevScore = prevScoreRef.current;
      const prevWinProbRed = prevWinProbRedRef.current;

      // Direct Virtual Host eye-gaze & head turn smoothly toward exact landing square!
      setBoardFocus({
        row: move.to.row,
        col: move.to.col,
        side,
        captured: Boolean(move.captured),
        inCheck: nextBoard.inCheck !== null,
        notation,
        seq: ++focusSeqRef.current,
      });

      // Trigger Full-Body 3D Pavilion Arm Reach -> Lift Piece -> Carry -> Place Choreography!
      setMoveEvent({
        seq: choreoSeq,
        side,
        from: move.from,
        to: move.to,
        captured: Boolean(move.captured),
        inCheck: nextBoard.inCheck !== null,
        pieceId: move.piece.id,
        killPatternId: namedPattern?.id ?? null,
      });

      appendMessage({
        username: actorName,
        text: `${notation}${nextBoard.inCheck ? ' — CHIẾU TƯỚNG!' : ''}`,
        kind: side === 'red' ? 'move' : 'bot',
      });

      // The dowry only moves when a checking pattern really lands on the bride, or when she
      // loses the game - it is a consequence on the board, never a scripted handicap.
      if (
        killStrike &&
        shouldForfeitForPattern(killStrike.forcing, side, nextBoard.status)
      ) {
        const forfeit = forfeitForPattern(dowryRef.current, killStrike.id);
        applyDowryForfeit(
          forfeit.ladder,
          forfeit.lost,
          `${killStrike.nameVi} của ${actorName} đã thành công`,
        );
      }
      if (nextBoard.status === 'red_win') {
        const snuffed = forfeitCandle(dowryRef.current);
        applyDowryForfeit(snuffed.ladder, snuffed.lost, 'Ván cờ ngã ngũ bên phía đỏ');
      }

      // Case 0: Repetition referee. The warning is a once-per-cycle chat line ALWAYS (viewers need
      // the rule spelled out), while the spoken nudge waits for the bride to finish talking.
      const referee = refereeForBoard(nextBoard);
      if (referee.warning === 'perpetual_check_warning' && referee.offender) {
        const offender = referee.offender;
        if (nextBoard.moveCount - lastRepetitionWarnPlyRef.current >= 4) {
          lastRepetitionWarnPlyRef.current = nextBoard.moveCount;
          appendMessage({
            username: 'Trong Tài Kỳ Đài',
            text:
              `Thế cờ đã lặp lại vòng thứ hai với nước chiếu liên tiếp của ` +
              `${offender === 'red' ? activeChallengerRef.current.username : BOT_MASTER_PROFILE.name}. ` +
              `Đủ 3 vòng là phạm luật Trường Chiếu — bên chiếu bị xử thua, nên đổi nước khác.`,
            kind: 'system',
          });
          const now = Date.now();
          if (
            now - lastRepetitionSpokenAtRef.current > 6000 &&
            speakingEngineRef.current === null
          ) {
            lastRepetitionSpokenAtRef.current = now;
            const guest = activeChallengerRef.current;
            afterSettled(() => {
              performScriptBeat(
                buildRepetitionWarningScript({
                  offender,
                  challengerName: guest.username,
                  guestGender: guest.gender,
                  guestAge: guest.age,
                  moveCount: nextBoard.moveCount,
                  recentLines: recentLinesRef.current,
                }),
                { notation: 'Nhắc Luật Trường Chiếu' },
              );
            });
          }
        }
      }

      // Case 1: Match Ended (checkmate, stalemate, or a referee ruling) — finale immediately
      if (nextBoard.status !== 'playing') {
        const terminalAnalysis =
          precomputed?.nextAnalysis ??
          analyzePosition(nextBoard, difficultyRef.current, {
            mode: 'preview',
            recentPositionKeys: recentPosKeysRef.current,
            focusPattern: nightRef.current.focusPattern,
          });
        const scoreDeltaForRed =
          precomputed?.scoreDeltaForRed ?? terminalAnalysis.score - prevScore;
        prevScoreRef.current = terminalAnalysis.score;
        prevWinProbRedRef.current = terminalAnalysis.winProbRed;
        setAnalysis(terminalAnalysis);
        stageRef.current?.updateAnalysisVisuals(
          nextBoard,
          terminalAnalysis,
          showAnalysis,
          null,
        );

        setBotThinking(false);
        const guest = activeChallengerRef.current;
        const fallbackEnd = buildInstantWuxiaCommentary({
          boardAfter: nextBoard,
          move,
          notation,
          actorName,
          playedMotif,
          analysis: terminalAnalysis,
          challengerName: guest.username,
          guestGender: guest.gender,
          guestAge: guest.age,
          scoreDeltaForRed,
          prevWinProbRed,
          recentLines: recentLinesRef.current,
          ladderStep: countLadderStep(dowryRef.current),
          killPatternId: namedPattern?.id ?? null,
        });
        afterLanding(() => {
          recordRecentLine(fallbackEnd.line);
          setCommentary(fallbackEnd);
          setHostEmotion(fallbackEnd.emotion ?? 'victory');
          triggerBotSpeaking(fallbackEnd.line, fallbackEnd.mood, {
            emotion: fallbackEnd.emotion,
            vocalCue: fallbackEnd.vocalCue,
          });
        });
        afterSettled(() => {
          dispatchGestureCue(fallbackEnd.gesture, fallbackEnd.stageDirection, 0);
          setAppState('gameover');
        });
        return;
      }

      // Case 2: Red (Challenger) just moved -> Run deep Grandmaster AI search OFF THE MAIN THREAD
      // inside a Web Worker while 3D WebGL & Pavilion animations glide smoothly at 60fps!
      if (nextBoard.turn === 'black') {
        const myTurnToken = ++turnSeqRef.current;
        const thinkStartMs = Date.now();
        const initialReaction: HostEmotion = nextBoard.inCheck
          ? 'check'
          : move.captured
            ? 'surprised'
            : 'thinking';
        setHostEmotion(initialReaction);
        setBotThinking(true);
        stageRef.current?.setBotState('thinking', false);
        if (botTimerRef.current) window.clearTimeout(botTimerRef.current);

        void (async () => {
          const botSearch =
            precomputed?.nextAnalysis ??
            (await xiangqiAiClient.analyzeAsync(nextBoard, difficultyRef.current, {
              mode: 'play',
              recentPositionKeys: recentPosKeysRef.current,
              bookFavour: nightBookFavour(nightRef.current, nextBoard),
              focusPattern: nightRef.current.focusPattern,
            }));

          if (
            appStateRef.current !== 'playing' ||
            turnSeqRef.current !== myTurnToken ||
            boardRef.current.turn !== 'black' ||
            boardRef.current.status !== 'playing'
          ) {
            setBotThinking(false);
            return;
          }

          if (botSearch.positionKey) {
            recentPosKeysRef.current = [
              ...recentPosKeysRef.current.slice(-15),
              botSearch.positionKey,
            ];
          }
          const scoreDeltaForRed =
            precomputed?.scoreDeltaForRed ?? botSearch.score - prevScore;
          prevScoreRef.current = botSearch.score;
          prevWinProbRedRef.current = botSearch.winProbRed;
          setAnalysis(botSearch);
          stageRef.current?.updateAnalysisVisuals(
            nextBoard,
            botSearch,
            showAnalysis,
            null,
          );

          const refinedReaction: HostEmotion = nextBoard.inCheck
            ? 'check'
            : move.captured || scoreDeltaForRed >= 80
              ? 'surprised'
              : scoreDeltaForRed <= -110
                ? 'amused'
                : 'thinking';
          setHostEmotion(refinedReaction);

          const guest = activeChallengerRef.current;
          const redDelivery = buildMoveCommentaryDelivery({
            boardAfter: nextBoard,
            move,
            notation,
            actorName,
            playedMotif,
            analysis: botSearch,
            challengerName: guest.username,
            guestGender: guest.gender,
            guestAge: guest.age,
            scoreDeltaForRed,
            prevWinProbRed,
            recentLines: recentLinesRef.current,
            ladderStep: countLadderStep(dowryRef.current),
            killPatternId: namedPattern?.id ?? null,
            previousPhase: phaseRef.current,
            forcingPattern: Boolean(killStrike?.forcing),
          });
          phaseRef.current = detectMatchPhase(nextBoard);
          afterLanding(() => {
            recordRecentLine(redDelivery.commentary.line);
            setCommentary(redDelivery.commentary);
            setHostEmotion(redDelivery.commentary.emotion ?? refinedReaction);
            if (redDelivery.voiceReply) {
              triggerBotSpeaking(
                redDelivery.commentary.line,
                redDelivery.commentary.mood,
                {
                  emotion: redDelivery.commentary.emotion,
                  vocalCue: redDelivery.commentary.vocalCue,
                },
              );
            }
          });
          afterSettled(() => {
            dispatchGestureCue(
              redDelivery.commentary.gesture ?? 'closeup_talk',
              redDelivery.commentary.stageDirection,
              0,
            );
          });

          const plannedBotMove = botSearch.bestMove;
          let parallelGeminiPromise: Promise<CommentaryItem | null> | undefined;
          let voicePlannedReply: boolean | undefined;
          let boardAfterBotAnalysis: DeepAnalysisResult | undefined;

          if (plannedBotMove) {
            const botNotation = formatMoveVietnamese(nextBoard.grid, plannedBotMove);
            const simulatedAfterBot = makeMove(nextBoard, plannedBotMove);
            const plannedMotif = detectMoveMotif(
              nextBoard.grid,
              plannedBotMove,
              simulatedAfterBot.grid,
              nightRef.current.focusPattern,
            );
            boardAfterBotAnalysis = await xiangqiAiClient.analyzeAsync(
              simulatedAfterBot,
              difficultyRef.current,
              {
                mode: 'preview',
                recentPositionKeys: recentPosKeysRef.current,
              },
            );

            if (
              appStateRef.current !== 'playing' ||
              turnSeqRef.current !== myTurnToken ||
              boardRef.current.turn !== 'black'
            ) {
              setBotThinking(false);
              return;
            }

            const plannedReplyPhase = detectMatchPhase(simulatedAfterBot);
            const plannedReplyEvent = classifyTacticalEvent({
              boardAfter: simulatedAfterBot,
              move: plannedBotMove,
              analysis: boardAfterBotAnalysis,
              scoreDeltaForRed,
              prevWinProbRed,
              phase: plannedReplyPhase,
            });
            // The paid Gemini round-trip is only worth firing on a ply she would actually speak
            // over, so the silence budget decides the network call too — same inputs, same answer.
            voicePlannedReply = shouldVoiceCommentary({
              tacticalEvent: plannedReplyEvent,
              killPattern: Boolean(
                detectKillPattern(nextBoard.grid, simulatedAfterBot.grid, plannedBotMove)?.forcing,
              ),
              phaseChanged: plannedReplyPhase !== phaseRef.current,
              moveCount: simulatedAfterBot.moveCount,
            });

            if (voicePlannedReply) {
              parallelGeminiPromise = requestEmotionalGeminiCommentary({
                notation: botNotation,
                playerMoveNotation: notation,
                botMoveNotation: botNotation,
                actorName: BOT_MASTER_PROFILE.name,
                side: 'black',
                nextBoard: simulatedAfterBot,
                move: plannedBotMove,
                verifiedMotif: plannedMotif,
                nextAnalysis: boardAfterBotAnalysis,
                scoreDeltaForRed,
                prevWinProbRed,
                playerCaptured: move.captured
                  ? PIECE_NAME_VI[move.captured.side][move.captured.type]
                  : undefined,
                botCaptured: plannedBotMove.captured
                  ? PIECE_NAME_VI[plannedBotMove.captured.side][plannedBotMove.captured.type]
                  : undefined,
              });
            }
          }

          const remainingThinkMs = Math.max(120, 760 - (Date.now() - thinkStartMs));
          botTimerRef.current = window.setTimeout(() => {
            const playBotMove = () => {
              if (
                appStateRef.current !== 'playing' ||
                turnSeqRef.current !== myTurnToken
              ) {
                setBotThinking(false);
                return;
              }
              const liveBoard = boardRef.current;
              if (liveBoard.turn !== 'black' || liveBoard.status !== 'playing') {
                setBotThinking(false);
                return;
              }
              setBotThinking(false);
              if (plannedBotMove) {
                commitMove(plannedBotMove, BOT_MASTER_PROFILE.name, 'black', {
                  nextAnalysis: boardAfterBotAnalysis,
                  geminiPromise: parallelGeminiPromise,
                  scoreDeltaForRed,
                  turnToken: myTurnToken,
                  voiceReply: voicePlannedReply,
                });
              }
            };
            if (stageRef.current?.isMoveAnimating()) {
              queueMoveSettledCue(choreoSeq, () => {
                window.setTimeout(playBotMove, 0);
              });
            } else {
              playBotMove();
            }
          }, remainingThinkMs);
        })();
        return;
      }

      // Case 3: Black (Kỳ Ma) just landed her reply -> Apply precomputed preview analysis & deliver emotional commentary!
      const nextAnalysis =
        precomputed?.nextAnalysis ??
        analyzePosition(nextBoard, difficultyRef.current, {
          mode: 'preview',
          recentPositionKeys: recentPosKeysRef.current,
          focusPattern: nightRef.current.focusPattern,
        });
      if (nextAnalysis.positionKey) {
        recentPosKeysRef.current = [
          ...recentPosKeysRef.current.slice(-15),
          nextAnalysis.positionKey,
        ];
      }
      const scoreDeltaForRed =
        precomputed?.scoreDeltaForRed ?? nextAnalysis.score - prevScore;
      prevScoreRef.current = nextAnalysis.score;
      prevWinProbRedRef.current = nextAnalysis.winProbRed;
      setAnalysis(nextAnalysis);
      stageRef.current?.updateAnalysisVisuals(nextBoard, nextAnalysis, showAnalysis, null);

      const guest = activeChallengerRef.current;
      const replyPhase = detectMatchPhase(nextBoard);
      const replyPhaseChanged = phaseRef.current !== replyPhase;
      phaseRef.current = replyPhase;
      const replyEvent = classifyTacticalEvent({
        boardAfter: nextBoard,
        move,
        analysis: nextAnalysis,
        scoreDeltaForRed,
        prevWinProbRed,
        phase: replyPhase,
      });
      // Silence budget: the bride talks on beats that actually changed the show, not on every ply.
      const voiceReply =
        precomputed?.voiceReply ??
        shouldVoiceCommentary({
          tacticalEvent: replyEvent,
          killPattern: Boolean(killStrike?.forcing),
          phaseChanged: replyPhaseChanged,
          moveCount: nextBoard.moveCount,
        });
      const fallbackCmt = buildInstantWuxiaCommentary({
        boardAfter: nextBoard,
        move,
        notation,
        actorName,
        playedMotif,
        analysis: nextAnalysis,
        challengerName: guest.username,
        guestGender: guest.gender,
        guestAge: guest.age,
        scoreDeltaForRed,
        prevWinProbRed,
        recentLines: recentLinesRef.current,
        ladderStep: countLadderStep(dowryRef.current),
        killPatternId: namedPattern?.id ?? null,
      });

      const expectedToken = precomputed?.turnToken ?? turnSeqRef.current;
      const deliverCommentary = (cmt: CommentaryItem) => {
        if (
          turnSeqRef.current !== expectedToken ||
          appStateRef.current !== 'playing' ||
          boardRef.current !== nextBoard
        ) {
          return;
        }
        const emo = cmt.emotion ?? 'calm';
        afterLanding(() => {
          recordRecentLine(cmt.line);
          setCommentary(cmt);
          setHostEmotion(emo);
          if (voiceReply) {
            triggerBotSpeaking(cmt.line, cmt.mood, {
              emotion: emo,
              vocalCue: cmt.vocalCue,
            });
          }
        });
        afterSettled(() => {
          dispatchGestureCue(
            cmt.gesture ?? fallbackCmt.gesture,
            cmt.stageDirection ?? fallbackCmt.stageDirection,
            0,
          );
        });
      };

      if (precomputed?.geminiPromise) {
        // Wait briefly for the already-in-flight Gemini response (usually resolves within 0–450ms!)
        const timeoutRace = new Promise<null>((resolve) =>
          window.setTimeout(() => resolve(null), 950),
        );
        void Promise.race([precomputed.geminiPromise, timeoutRace]).then((aiCmt) => {
          deliverCommentary(aiCmt ?? fallbackCmt);
        });
      } else {
        deliverCommentary(fallbackCmt);
      }
    },
    [
      appendMessage,
      applyDowryForfeit,
      dispatchGestureCue,
      performScriptBeat,
      queueMoveLandingCue,
      queueMoveSettledCue,
      recordRecentLine,
      refuseConcessionMove,
      requestEmotionalGeminiCommentary,
      showAnalysis,
      triggerBotSpeaking,
    ],
  );

  // Respond aloud & with synced gesture to a live viewer comment, backseat coach, or challenger banter
  const respondToLiveChat = useCallback(
    async (
      kind: 'backseat_coach' | 'viewer_spotlight' | 'challenger_banter',
      speakerName: string,
      messageText: string,
      suggestedNotation?: string,
    ) => {
      const guest = activeChallengerRef.current;
      const fallbackScript = buildLiveInteractionScript({
        kind,
        challengerName: guest.username,
        guestGender: guest.gender,
        guestAge: guest.age,
        viewerName: speakerName,
        viewerText: messageText,
        suggestedNotation,
        recentLines: recentLinesRef.current,
      });

      const notationTag =
        kind === 'backseat_coach'
          ? `Bắt Bài ${speakerName}`
          : kind === 'challenger_banter'
            ? `Đáp Lời ${speakerName}`
            : `Giao Lưu ${speakerName}`;

      // Try server-side Gemini live reply first (fast low-latency), fall back cleanly to instant script
      try {
        const resp = await fetch('/api/live-reply', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            kind,
            speakerName,
            messageText,
            challengerName: guest.username,
            guestGender: guest.gender,
            guestAge: guest.age,
            suggestedNotation,
            winProbRed: analysisRef.current.winProbRed,
          }),
        });
        const data = await resp.json();
        if (resp.ok && data.ok && data.line) {
          performScriptBeat(
            {
              ...fallbackScript,
              line: data.line,
              emotion: (data.emotion as HostEmotion) ?? fallbackScript.emotion,
              gesture: (data.gesture as PerformanceGesture) ?? fallbackScript.gesture,
              stageDirection: data.stageDirection ?? fallbackScript.stageDirection,
            },
            { notation: notationTag, source: 'gemini' },
          );
          return;
        }
      } catch {
        // silent fallback to expressive instant script
      }

      performScriptBeat(fallbackScript, { notation: notationTag, source: 'engine' });
    },
    [performScriptBeat],
  );

  // Hybrid Gemini NLU Fallback: resolves complex natural-language moves ("đẩy tốt giữa lên", "lấy xe bên phải chiếu")
  const resolveMoveWithGeminiNlu = useCallback(
    async (username: string, rawText: string, snapshotBoard: BoardState) => {
      // The model is offered only the moves tonight's concession allows, and data.moveIndex is read
      // back against this same filtered array - the two lists must never be allowed to disagree.
      const legal = concessionLegalMoves(
        snapshotBoard,
        concessionRef.current,
        generateLegalMoves(snapshotBoard.grid, 'red'),
      );
      if (legal.length === 0) return;

      const payloadMoves = legal.map((mv, index) => {
        const afterGrid = applyMoveOnGrid(snapshotBoard.grid, mv);
        return {
          index,
          notation: formatMoveVietnamese(snapshotBoard.grid, mv),
          pieceVi: PIECE_NAME_VI.red[mv.piece.type],
          fromFile: colToFile(mv.from.col, 'red'),
          toFile: colToFile(mv.to.col, 'red'),
          capturedVi: mv.captured ? PIECE_NAME_VI.black[mv.captured.type] : undefined,
          givesCheck: isInCheck(afterGrid, 'black'),
        };
      });

      try {
        const resp = await fetch('/api/parse-move', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: rawText, legalMoves: payloadMoves }),
        });
        const data = await resp.json();
        // Ensure board hasn't already advanced while awaiting NLU
        if (
          boardRef.current.moveCount !== snapshotBoard.moveCount ||
          boardRef.current.turn !== 'red' ||
          botThinkingRef.current
        ) {
          return;
        }
        if (resp.ok && data.ok && typeof data.moveIndex === 'number' && legal[data.moveIndex]) {
          commitMove(legal[data.moveIndex], username, 'red');
          return;
        }
        if (
          resp.ok &&
          data.ok &&
          Array.isArray(data.ambiguousIndices) &&
          data.ambiguousIndices.length > 1
        ) {
          const cands = data.ambiguousIndices
            .map((idx: number) => legal[idx])
            .filter(Boolean) as Move[];
          if (cands.length > 0) {
            stageRef.current?.setSelectionOverlay(
              cands[0].from,
              cands.map((c) => c.to),
            );
            const guest = activeChallengerRef.current;
            const script = buildLiveInteractionScript({
              kind: 'move_ambiguous',
              challengerName: guest.username,
              guestGender: guest.gender,
              guestAge: guest.age,
              candidateNotations: cands.map((c) =>
                formatMoveVietnamese(snapshotBoard.grid, c),
              ),
              recentLines: recentLinesRef.current,
            });
            performScriptBeat(script, { notation: 'Hỏi Lại Nước Đi' });
            return;
          }
        }
      } catch {
        // Fallback silently to casual challenger banter
      }

      if (autoCommentReplyRef.current && speakingEngineRef.current === null) {
        void respondToLiveChat('challenger_banter', username, rawText);
      }
    },
    [commitMove, performScriptBeat, respondToLiveChat],
  );

  // Process any incoming chat message (local form, simulated TikTok viewer, Voice Mic, or real SSE webhook!)
  const processIncomingChat = useCallback(
    (
      username: string,
      text: string,
      meta?: {
        actorId?: string;
        gender?: GuestGender;
        age?: number;
        giftName?: string;
        fromVoice?: boolean;
      },
    ) => {
      const currentChallenger = activeChallengerRef.current;
      // Identity is only ever what the receiver minted, never something read back off the message:
      // relay events carry server-minted `actor:...` ids, and just the Studio panel mints
      // `local:...` for the operator's own machine. A message with no attribution is a stranger,
      // not the handle it typed - falling back to a name-derived id is how a lookalike inherits
      // the seated player's seat.
      const senderActorId = meta?.actorId ?? UNATTRIBUTED_ACTOR_ID;
      const isChallenger = senderActorId === currentChallenger.actorId;

      // 0. Live TikTok Gift Reaction -> Immediate joyful thank-you + VIP Fast-Track Queue Upgrade!
      if (meta?.giftName) {
        appendMessage({
          username,
          text: `Đã tặng ${meta.giftName}! ${text || ''}`.trim(),
          kind: 'viewer',
        });

        // Upgrade gift sender to VIP priority in the challenger queue if they aren't already playing
        if (!isChallenger) {
          const vipEntry = {
            ...createChallenger(
              username,
              senderActorId,
              meta.gender ?? 'nam',
              meta.age ?? 26,
            ),
            isVip: true,
            giftCount: 1,
          };
          setQueue((prev) => enqueueChallengerWithPriority(prev, vipEntry));
        }

        if (appStateRef.current === 'playing' && !botThinkingRef.current) {
          const giftScript = buildLiveSessionBeat({
            beat: 'gift_reaction',
            challengerName: currentChallenger.username,
            guestTitle: currentChallenger.character.title,
            guestGender: currentChallenger.gender,
            guestAge: currentChallenger.age,
            winProbRed: analysisRef.current.winProbRed,
            moveCount: boardRef.current.moveCount,
            viewerName: username,
            giftName: meta.giftName,
            recentLines: recentLinesRef.current,
          });
          performScriptBeat(giftScript, { notation: `Tri Ân ${meta.giftName}` });
        }
        return;
      }

      const intent = classifyChatMessage(text);

      // 1. Viewer requests to join challenge queue (!choi / !thachdau / lên đài)
      if (intent.type === 'challenge') {
        const entry = createChallenger(
          username,
          senderActorId,
          meta?.gender ?? (Math.random() > 0.45 ? 'nam' : 'nu'),
          meta?.age ?? 22 + Math.floor(Math.random() * 28),
        );
        setQueue((prev) => enqueueChallengerWithPriority(prev, entry));
        appendMessage({ username, text, kind: 'viewer' });
        appendMessage({
          username: BOT_MASTER_PROFILE.name,
          text: `Đã ghi danh ${username} (${entry.character.title}) vào hàng đợi thách đấu!`,
          kind: 'system',
        });
        return;
      }

      // 2. Seat-Locked Gender+Age Profile Command (!nam 28, !nu 24)
      // NEVER lets a random viewer or lookalike handle hijack the active challenger's seat!
      if (intent.type === 'guest_profile' && intent.gender && intent.age) {
        const matched = matchGuestCharacter(intent.gender, intent.age);
        const updated = createChallenger(
          username,
          senderActorId,
          intent.gender,
          intent.age,
          matched,
        );
        const res = applySeatLockedProfileUpdate({
          senderActorId,
          activeChallenger: currentChallenger,
          queue: queueRef.current,
          updatedEntry: updated,
        });
        if (res.updatedActive) {
          setActiveChallenger(res.updatedActive);
          activeChallengerRef.current = res.updatedActive;
          stageRef.current?.setGuestCharacter(matched);
          appendMessage({
            username: BOT_MASTER_PROFILE.name,
            text: `Khách mời ${username} hóa thân thành ${matched.name} (${matched.title})!`,
            kind: 'system',
          });
        } else {
          setQueue(res.updatedQueue);
          appendMessage({
            username: BOT_MASTER_PROFILE.name,
            text: `Đã lưu nhân vật ${matched.name} cho ${username} trong hàng đợi (ghế hiện tại đang thuộc về ${currentChallenger.username}).`,
            kind: 'system',
          });
        }
        return;
      }

      const liveBoard = boardRef.current;
      const redTurnOpen =
        appStateRef.current === 'playing' &&
        liveBoard.status === 'playing' &&
        liveBoard.turn === 'red' &&
        !botThinkingRef.current;

      // 3. CROWD VOTE MODE: Any viewer can vote for the next Red move!
      if (redTurnOpen && liveModeRef.current === 'crowd_vote') {
        const parsed = parseVietnameseChatMove(liveBoard, text, preferredPieceIdRef.current);
        if (parsed.move && parsed.notation) {
          setCrowdVote((prev) =>
            recordCrowdVote(prev, username, parsed.move!, liveBoard.grid, senderActorId),
          );
          appendMessage({
            username,
            text: `[Vote ${parsed.notation}] ${text}`,
            kind: 'move',
          });
          return;
        }
      }

      // 4. ACTIVE CHALLENGER PRIORITY CHANNEL (Tier 0 — 1v1 Duel)
      if (isChallenger) {
        // Challenger is clearly present -> clear ready check & AFK strikes
        if (awaitingReadyCheckRef.current) {
          setAwaitingReadyCheck(false);
          setTurnSecondsLeft(45);
        }
        if (afkStrikesRef.current > 0) setAfkStrikes(0);

        // 4A. Ready Check Confirmation
        if (intent.type === 'ready_check') {
          appendMessage({ username, text, kind: 'challenger' });
          setTurnSecondsLeft(45);
          appendMessage({
            username: BOT_MASTER_PROFILE.name,
            text: `${username} đã sẵn sàng ứng chiến! Mời hạ quân khai cuộc.`,
            kind: 'system',
          });
          return;
        }

        // 4B. Special Live Challenger Commands (!xinthua, !hoaco, !dilai, !goiy)
        if (intent.type === 'resign' && appStateRef.current === 'playing') {
          appendMessage({ username, text, kind: 'challenger' });
          const nextBoard: BoardState = {
            ...liveBoard,
            status: 'black_win',
            statusReason: 'resign',
          };
          setBoard(nextBoard);
          boardRef.current = nextBoard;
          const script = buildLiveInteractionScript({
            kind: 'resign_outro',
            challengerName: currentChallenger.username,
            guestGender: currentChallenger.gender,
            guestAge: currentChallenger.age,
            recentLines: recentLinesRef.current,
          });
          performScriptBeat(script, { notation: 'Nhận Thua' });
          setAppState('gameover');
          return;
        }

        if (intent.type === 'draw_offer' && appStateRef.current === 'playing') {
          appendMessage({ username, text, kind: 'challenger' });
          const redScore = analysisRef.current.score;
          const script = buildLiveInteractionScript({
            kind: 'draw_offer_response',
            challengerName: currentChallenger.username,
            guestGender: currentChallenger.gender,
            guestAge: currentChallenger.age,
            redScore,
            recentLines: recentLinesRef.current,
          });
          performScriptBeat(script, { notation: 'Cầu Hòa' });
          if (redScore > -130) {
            const drawBoard: BoardState = {
              ...liveBoard,
              status: 'draw',
              statusReason: 'draw_agreement',
            };
            setBoard(drawBoard);
            boardRef.current = drawBoard;
            setAppState('gameover');
          }
          return;
        }

        if (intent.type === 'undo_request' && appStateRef.current === 'playing') {
          appendMessage({ username, text, kind: 'challenger' });
          const script = buildLiveInteractionScript({
            kind: 'undo_tease',
            challengerName: currentChallenger.username,
            guestGender: currentChallenger.gender,
            guestAge: currentChallenger.age,
            recentLines: recentLinesRef.current,
          });
          performScriptBeat(script, { notation: 'Xin Đi Lại' });
          return;
        }

        if (intent.type === 'hint_request' && redTurnOpen) {
          appendMessage({ username, text, kind: 'challenger' });
          setShowAnalysis(true);
          setPreviewVariationIdx(0);
          const script = buildLiveInteractionScript({
            kind: 'hint_reveal',
            challengerName: currentChallenger.username,
            guestGender: currentChallenger.gender,
            guestAge: currentChallenger.age,
            bestHintNotation: analysisRef.current.bestNotation,
            recentLines: recentLinesRef.current,
          });
          performScriptBeat(script, { notation: 'Mách Kiếm Ý' });
          return;
        }

        // 4C. Move Parsing on Red's Turn (Layer 1 Fast Parser -> Layer 2 Gemini NLU Fallback)
        if (redTurnOpen && liveModeRef.current === 'duel_1v1') {
          const parsed = parseVietnameseChatMove(
            liveBoard,
            text,
            preferredPieceIdRef.current,
          );
          if (parsed.move) {
            commitMove(parsed.move, username, 'red');
            return;
          }

          if (parsed.ambiguous && parsed.candidates && parsed.candidates.length > 0) {
            setMoveHintError(parsed.error ?? 'Nước đi có nhiều lựa chọn, vui lòng chọn rõ cột.');
            appendMessage({ username, text, kind: 'challenger' });
            stageRef.current?.setSelectionOverlay(
              parsed.candidates[0].from,
              parsed.candidates.map((c) => c.to),
            );
            const script = buildLiveInteractionScript({
              kind: 'move_ambiguous',
              challengerName: currentChallenger.username,
              guestGender: currentChallenger.gender,
              guestAge: currentChallenger.age,
              candidateNotations: parsed.candidates.map((c) =>
                formatMoveVietnamese(liveBoard.grid, c),
              ),
              recentLines: recentLinesRef.current,
            });
            performScriptBeat(script, { notation: 'Hỏi Lại Nước Đi' });
            return;
          }

          if (parsed.needsAiFallback) {
            appendMessage({ username, text, kind: 'challenger' });
            void resolveMoveWithGeminiNlu(username, text, liveBoard);
            return;
          }

          if (intent.type === 'move_candidate' && parsed.error) {
            setMoveHintError(parsed.error);
            appendMessage({ username, text, kind: 'challenger' });
            appendMessage({
              username: BOT_MASTER_PROFILE.name,
              text: parsed.error,
              kind: 'system',
            });
            const now = Date.now();
            if (now - lastIllegalSpokenAtRef.current > 6000 && speakingEngineRef.current === null) {
              lastIllegalSpokenAtRef.current = now;
              const script = buildLiveInteractionScript({
                kind: 'move_illegal',
                challengerName: currentChallenger.username,
                guestGender: currentChallenger.gender,
                guestAge: currentChallenger.age,
                recentLines: recentLinesRef.current,
              });
              performScriptBeat(script, { notation: 'Nhắc Luật' });
            }
            return;
          }
        }

        // 4D. Casual Banter from the Active Challenger -> Kỳ Ma replies warmly in character!
        appendMessage({ username, text, kind: 'challenger' });
        if (
          appStateRef.current === 'playing' &&
          !botThinkingRef.current &&
          autoCommentReplyRef.current &&
          !meta?.fromVoice &&
          text.trim().length >= 3
        ) {
          void respondToLiveChat('challenger_banter', username, text);
        }
        return;
      }

      // 5. GENERAL AUDIENCE COMMENTS -> Triage (Backseat Coach Detection + Spotlight Queue + Spam Filter)
      appendMessage({ username, text, kind: 'viewer' });

      if (appStateRef.current !== 'playing') return;
      const decision = triageLiveComment({
        username,
        text,
        isChallenger: false,
        board: liveBoard,
      });

      const now = Date.now();
      const cooldownOk = now - lastViewerReplyAtRef.current >= 14_000;

      // Tier 1: Caught a viewer whispering a legal move ("mách nước")!
      if (
        decision.category === 'backseat_coach' &&
        autoCommentReplyRef.current &&
        cooldownOk &&
        !botThinkingRef.current &&
        speakingEngineRef.current === null
      ) {
        lastViewerReplyAtRef.current = now;
        void respondToLiveChat('backseat_coach', username, text, decision.suggestedNotation);
        return;
      }

      // Tier 2: Save sharpest viewer question / cheer for idle-window spotlight reading
      if (decision.tier === 2) {
        setSpotlightComment((prev) => {
          const isStale = !prev || now - prev.receivedAt > 20_000;
          if (isStale || decision.score >= prev.score) {
            return { username, text, score: decision.score, receivedAt: now };
          }
          return prev;
        });
      }
    },
    [
      appendMessage,
      commitMove,
      performScriptBeat,
      resolveMoveWithGeminiNlu,
      respondToLiveChat,
    ],
  );

  // Board click interaction handler (convenience alongside chat commands)
  const handleSquareClick = useCallback(
    (row: number, col: number) => {
      if (
        appStateRef.current !== 'playing' ||
        botThinkingRef.current ||
        stageRef.current?.isMoveAnimating()
      ) {
        return;
      }
      const current = boardRef.current;
      if (current.status !== 'playing' || current.turn !== 'red') return;

      const clickedPiece = current.grid[row][col];
      const prevSel = selectedSquareRef.current;

      // If clicking a legal target of the already-selected Red piece, execute move!
      if (prevSel) {
        const legal = generateLegalMovesForSquare(current.grid, prevSel.row, prevSel.col);
        const playable = concessionLegalMoves(current, concessionRef.current, legal);
        const match = playable.find((m) => m.to.row === row && m.to.col === col);
        if (match) {
          commitMove(match, activeChallengerRef.current.username, 'red');
          return;
        }
        // Tapping a protected stone is the one door worth answering out loud: the guest aimed at it.
        const aimed = legal.find((m) => m.to.row === row && m.to.col === col);
        const refusal = aimed ? concessionBlock(current, concessionRef.current, aimed) : null;
        if (refusal) {
          refuseConcessionMove(refusal);
          return;
        }
      }

      // Otherwise select Red piece and highlight its legal moves (soft pickup tap NEVER stops voice!)
      if (clickedPiece && clickedPiece.side === 'red') {
        const legal = concessionLegalMoves(
          current,
          concessionRef.current,
          generateLegalMovesForSquare(current.grid, row, col),
        );
        wuxiaAudio.playPieceSelect();
        setSelectedSquare({ row, col });
        setPreferredPieceId(clickedPiece.id);
        setBoardFocus({
          row,
          col,
          side: 'red',
          seq: ++focusSeqRef.current,
        });
        stageRef.current?.setSelectionOverlay(
          { row, col },
          legal.map((m) => m.to),
        );
      } else {
        setSelectedSquare(null);
        stageRef.current?.setSelectionOverlay(null, []);
      }
    },
    [commitMove, refuseConcessionMove],
  );

  const handleSquareClickRef = useRef(handleSquareClick);
  useEffect(() => {
    handleSquareClickRef.current = handleSquareClick;
  }, [handleSquareClick]);

  const handleMoveLandedRef = useRef<(move: MoveLandingPayload) => void>(() => {});
  const handleMoveSettledRef = useRef<(move: MoveLandingPayload) => void>(() => {});
  handleMoveLandedRef.current = (move) => {
    if (move.seq !== moveChoreoSeqRef.current) return;
    flushMoveCues('landing', move.seq);
  };
  handleMoveSettledRef.current = (move) => {
    if (move.seq !== moveChoreoSeqRef.current) return;
    flushMoveCues('settle', move.seq);
  };

  // Mount Three.js Stage ONCE in isolated container
  useEffect(() => {
    const mount = canvasMountRef.current;
    if (!mount) return;

    const stage = new XiangqiStage(mount, boardRef.current, activeChallengerRef.current.character, {
      onSquareClick: (r, c) => handleSquareClickRef.current(r, c),
      onMoveLanded: (move) => handleMoveLandedRef.current(move),
      onMoveSettled: (move) => handleMoveSettledRef.current(move),
    });
    stageRef.current = stage;

    const autoStart = checkAutostart();
    const initTikTok = checkInitialTikTok();
    stage.setSplitScreen(true);
    stage.setTikTokMode(initTikTok);
    stage.setZoomFocus('bot');
    stage.setCameraPreset('liveBot');
    stage.setTitleMode(!autoStart, autoStart);
    stage.setPieceStyle(pieceStyleRef.current);
    stage.updateAnalysisVisuals(boardRef.current, analysis, true, null);

    return () => {
      if (botTimerRef.current) window.clearTimeout(botTimerRef.current);
      if (speakTimerRef.current) window.clearTimeout(speakTimerRef.current);
      if (gestureChoreoTimerRef.current) window.clearTimeout(gestureChoreoTimerRef.current);
      pendingLandingCuesRef.current.clear();
      pendingSettledCuesRef.current.clear();
      wuxiaAudio.stopSpeech();
      stage.dispose();
      stageRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync analysis visualization toggle & hovered variation arc into Three.js + Host Gaze
  useEffect(() => {
    stageRef.current?.updateAnalysisVisuals(
      board,
      analysis,
      showAnalysis,
      previewVariationIdx,
    );
    if (previewVariationIdx !== null) {
      const variation = analysis.variations[previewVariationIdx];
      if (variation) {
        setBoardFocus({
          row: variation.move.to.row,
          col: variation.move.to.col,
          side: variation.move.piece.side,
          notation: variation.notation,
          seq: ++focusSeqRef.current,
        });
      }
    }
  }, [board, analysis, showAnalysis, previewVariationIdx]);

  // Sync Title / Playing state, TikTok 9:16 mode & Split-Screen zoom focus to Three.js
  useEffect(() => {
    stageRef.current?.setTitleMode(appState === 'title');
  }, [appState]);

  useEffect(() => {
    stageRef.current?.setSplitScreen(splitScreen);
  }, [splitScreen]);

  useEffect(() => {
    stageRef.current?.setTikTokMode(tiktokFrame);
  }, [tiktokFrame]);

  useEffect(() => {
    stageRef.current?.setZoomFocus(zoomFocus);
  }, [zoomFocus]);

  // Sync high-contrast piece theme & label mode live into 3D textures + persist preference
  useEffect(() => {
    pieceStyleRef.current = pieceStyle;
    stageRef.current?.setPieceStyle(pieceStyle);
    try {
      window.localStorage.setItem(PIECE_STYLE_STORAGE_KEY, JSON.stringify(pieceStyle));
    } catch {
      // ignore storage quota errors
    }
  }, [pieceStyle]);

  const handleCyclePieceTheme = useCallback(() => {
    setPieceStyle((prev) => ({ ...prev, theme: nextPieceTheme(prev.theme) }));
  }, []);

  const handleCyclePieceLabelMode = useCallback(() => {
    setPieceStyle((prev) => ({
      ...prev,
      labelMode: nextPieceLabelMode(prev.labelMode),
    }));
  }, []);

  // Subscribe to real-time SSE TikTok Live Stream from Express backend
  // The Studio panel is the operator's own keyboard, so it is the one place that may mint a
  // `local:` id - and it says so out loud instead of relying on a default a remote path could
  // inherit.
  const submitStudioChat = useCallback(
    (username: string, text: string) =>
      processIncomingChat(username, text, { actorId: actorIdFor('local', username) }),
    [processIncomingChat],
  );

  const processIncomingChatRef = useRef(processIncomingChat);
  useEffect(() => {
    processIncomingChatRef.current = processIncomingChat;
  }, [processIncomingChat]);

  useEffect(() => {
    const es = new EventSource('/api/live/stream');
    es.addEventListener('chat', (ev) => {
      try {
        const data = JSON.parse((ev as MessageEvent).data);
        if ((data?.text || data?.giftName) && data?.username) {
          processIncomingChatRef.current(data.username, data.text || '', {
            actorId:
              typeof data.actorId === 'string' && data.actorId.length > 0
                ? data.actorId
                : UNATTRIBUTED_ACTOR_ID,
            gender: data.gender,
            age: data.age,
            giftName: data.giftName,
          });
        }
      } catch {
        // ignore malformed payload
      }
    });
    return () => {
      es.close();
    };
  }, []);

  // Clear Crowd Vote tally & pending voice move whenever turn advances
  useEffect(() => {
    setCrowdVote(createEmptyCrowdVote());
    setPendingVoiceMove(null);
    if (voiceConfirmTimerRef.current) {
      window.clearTimeout(voiceConfirmTimerRef.current);
      voiceConfirmTimerRef.current = null;
    }
  }, [board.moveCount, liveMode]);

  // Turn countdown timer & live viewer fluctuation while playing
  useEffect(() => {
    if (appState !== 'playing') return;
    const timer = window.setInterval(() => {
      setViewerCount((v) => Math.max(820, v + Math.floor(Math.random() * 11) - 4));
      setTurnSecondsLeft((sec) => {
        if (boardRef.current.turn !== 'red' || botThinkingRef.current) {
          return liveModeRef.current === 'crowd_vote' ? 18 : 45;
        }
        return sec > 0 ? sec - 1 : 0;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [appState]);

  const handleCommitCrowdVote = useCallback(() => {
    const liveBoard = boardRef.current;
    if (
      appStateRef.current !== 'playing' ||
      liveBoard.status !== 'playing' ||
      liveBoard.turn !== 'red' ||
      botThinkingRef.current
    ) {
      return;
    }
    // A vote for a protected stone is counted in the chat but cannot win: the room chooses, the
    // concession rules, and the runner-up takes the trick.
    const tally = tallyCrowdVotes(crowdVoteRef.current, 3).filter(
      (ballot) => concessionBlock(liveBoard, concessionRef.current, ballot.move) === null,
    );
    const winner = tally[0];
    const chosenMove =
      winner?.move ??
      pickGuestMove(
        liveBoard,
        concessionRef.current,
        generateLegalMoves(liveBoard.grid, 'red'),
        analysisRef.current.bestMove,
      );
    if (!chosenMove) return;

    const notation = winner?.notation ?? formatMoveVietnamese(liveBoard.grid, chosenMove);
    setCrowdVote(createEmptyCrowdVote());
    setTurnSecondsLeft(18);

    const guest = activeChallengerRef.current;
    if (winner) {
      const announce = buildLiveInteractionScript({
        kind: 'crowd_vote_commit',
        challengerName: guest.username,
        guestGender: guest.gender,
        guestAge: guest.age,
        suggestedNotation: notation,
        voteCount: winner.count,
        recentLines: recentLinesRef.current,
      });
      performScriptBeat(announce, { notation: `Vote: ${notation}` });
    }
    commitMove(
      chosenMove,
      winner ? `Cả Phòng Live (${winner.count} phiếu)` : 'Kiếm Ý Khán Giả',
      'red',
    );
  }, [commitMove, performScriptBeat]);

  const handleReadSpotlightComment = useCallback(() => {
    if (!spotlightComment || botThinkingRef.current) return;
    const picked = spotlightComment;
    setSpotlightComment(null);
    lastViewerReplyAtRef.current = Date.now();
    void respondToLiveChat('viewer_spotlight', picked.username, picked.text);
  }, [respondToLiveChat, spotlightComment]);

  const handleSelectLiveMode = useCallback(
    (nextMode: LiveControlMode) => {
      setLiveMode(nextMode);
      setCrowdVote(createEmptyCrowdVote());
      setAwaitingReadyCheck(false);
      setAfkStrikes(0);
      setTurnSecondsLeft(nextMode === 'crowd_vote' ? 18 : 45);
      appendMessage({
        username: BOT_MASTER_PROFILE.name,
        text:
          nextMode === 'crowd_vote'
            ? 'Đã bật chế độ CẢ PHÒNG BỎ PHIẾU! Mọi khán giả đều gõ nước đi (vd: p25, m87, pháo đầu) để hợp sức đấu Kỳ Ma!'
            : `Đã quay về chế độ ĐẤU 1v1 cùng người được chọn ${activeChallengerRef.current.username}.`,
        kind: 'system',
      });
    },
    [appendMessage],
  );

  // Voice Move Listener handlers (with 1.6s confirmation window & Echo-Guard)
  const handleConfirmPendingVoiceMove = useCallback(() => {
    if (voiceConfirmTimerRef.current) {
      window.clearTimeout(voiceConfirmTimerRef.current);
      voiceConfirmTimerRef.current = null;
    }
    setPendingVoiceMove((curr) => {
      if (curr && boardRef.current.turn === 'red' && !botThinkingRef.current) {
        commitMove(curr.move, activeChallengerRef.current.username, 'red');
      }
      return null;
    });
  }, [commitMove]);

  const handleCancelPendingVoiceMove = useCallback(() => {
    if (voiceConfirmTimerRef.current) {
      window.clearTimeout(voiceConfirmTimerRef.current);
      voiceConfirmTimerRef.current = null;
    }
    setPendingVoiceMove(null);
    setVoiceInterimText('');
  }, []);

  const handleToggleVoiceListening = useCallback(() => {
    if (voiceMoveListener.isActive()) {
      voiceMoveListener.stop();
      setVoiceListening(false);
      setVoiceInterimText('');
      handleCancelPendingVoiceMove();
      return;
    }

    const started = voiceMoveListener.start({
      onTranscript: ({ transcript, isFinal }) => {
        setVoiceInterimText(transcript);
        const liveBoard = boardRef.current;
        if (
          appStateRef.current !== 'playing' ||
          liveBoard.status !== 'playing' ||
          liveBoard.turn !== 'red' ||
          botThinkingRef.current
        ) {
          return;
        }
        const parsed = parseVietnameseChatMove(
          liveBoard,
          transcript,
          preferredPieceIdRef.current,
        );
        if (parsed.move && parsed.notation) {
          if (voiceConfirmTimerRef.current) window.clearTimeout(voiceConfirmTimerRef.current);
          const matchedMove = parsed.move;
          const matchedNotation = parsed.notation;
          setPendingVoiceMove({
            move: matchedMove,
            notation: matchedNotation,
            transcript,
          });
          setVoiceInterimText('');
          voiceConfirmTimerRef.current = window.setTimeout(() => {
            voiceConfirmTimerRef.current = null;
            setPendingVoiceMove((curr) => {
              if (
                curr &&
                curr.notation === matchedNotation &&
                boardRef.current.turn === 'red' &&
                !botThinkingRef.current
              ) {
                commitMove(curr.move, activeChallengerRef.current.username, 'red');
              }
              return null;
            });
          }, 1600);
        } else if (isFinal && parsed.needsAiFallback) {
          void resolveMoveWithGeminiNlu(
            activeChallengerRef.current.username,
            transcript,
            liveBoard,
          );
          setVoiceInterimText('');
        } else if (isFinal) {
          setVoiceInterimText('');
        }
      },
      onError: (msg) => {
        setMoveHintError(msg);
        setVoiceListening(false);
      },
      onStatus: (listening) => setVoiceListening(listening),
    });

    if (started) {
      voiceMoveListener.setSuppressed(speakingEngineRef.current !== null || botThinkingRef.current);
      setMoveHintError(null);
    }
  }, [commitMove, handleCancelPendingVoiceMove, resolveMoveWithGeminiNlu]);

  useEffect(() => {
    return () => {
      voiceMoveListener.stop();
      if (voiceConfirmTimerRef.current) window.clearTimeout(voiceConfirmTimerRef.current);
    };
  }, []);

  // Smart Turn Clock: idle viewer spotlight reading, 10s warning, AFK auto-move/rotate, and Crowd Vote commit!
  useEffect(() => {
    if (
      appState !== 'playing' ||
      board.status !== 'playing' ||
      board.turn !== 'red' ||
      botThinking
    ) {
      return;
    }
    const turnKey = `${turnSeqRef.current}_${board.moveCount}`;
    const guest = activeChallengerRef.current;

    // Idle Window (~17s into turn): spotlight the sharpest viewer comment if available, otherwise gentle thinking nudge!
    if (
      liveMode === 'duel_1v1' &&
      !awaitingReadyCheck &&
      turnSecondsLeft === 28 &&
      nudgedTurnKeyRef.current !== turnKey &&
      speakingEngine === null
    ) {
      nudgedTurnKeyRef.current = turnKey;
      const now = Date.now();
      if (
        autoCommentReply &&
        spotlightComment &&
        now - spotlightComment.receivedAt <= 22_000 &&
        now - lastViewerReplyAtRef.current >= 14_000
      ) {
        const picked = spotlightComment;
        setSpotlightComment(null);
        lastViewerReplyAtRef.current = now;
        void respondToLiveChat('viewer_spotlight', picked.username, picked.text);
      } else if (board.moveCount >= 1) {
        const nudge = buildLiveSessionBeat({
          beat: 'thinking_nudge',
          challengerName: guest.username,
          guestTitle: guest.character.title,
          guestGender: guest.gender,
          guestAge: guest.age,
          winProbRed: analysisRef.current.winProbRed,
          moveCount: board.moveCount,
          recentLines: recentLinesRef.current,
        });
        performScriptBeat(nudge, { notation: 'Đợi Xuất Chiêu' });
      }
      return;
    }

    const clockAction = evaluateTurnClockTransition({
      secondsLeft: turnSecondsLeft,
      awaitingReadyCheck,
      afkStrikes,
      queueLength: queue.length,
      mode: liveMode,
    });

    if (clockAction.type === 'warn_10s' && countdownTurnKeyRef.current !== turnKey && speakingEngine === null) {
      countdownTurnKeyRef.current = turnKey;
      const warn = buildLiveInteractionScript({
        kind: 'afk_warn_10s',
        challengerName: guest.username,
        guestGender: guest.gender,
        guestAge: guest.age,
        recentLines: recentLinesRef.current,
      });
      performScriptBeat(warn, { notation: 'Đếm Ngược 10s' });
    } else if (clockAction.type === 'crowd_vote_commit') {
      handleCommitCrowdVote();
    } else if (clockAction.type === 'ready_timeout_extend') {
      setAwaitingReadyCheck(false);
      setTurnSecondsLeft(45);
    } else if (
      clockAction.type === 'ready_timeout_rotate' ||
      clockAction.type === 'afk_rotate_challenger'
    ) {
      const { picked, rest } = pickNextChallenger(queue, 'fifo');
      if (picked) {
        setQueue(rest);
        setActiveChallenger(picked);
        activeChallengerRef.current = picked;
        stageRef.current?.setGuestCharacter(picked.character);
        setAfkStrikes(0);
        setAwaitingReadyCheck(true);
        setTurnSecondsLeft(20);
        const rotateScript = buildLiveInteractionScript({
          kind: 'afk_rotate',
          challengerName: guest.username,
          guestGender: guest.gender,
          guestAge: guest.age,
          nextChallengerName: picked.username,
          recentLines: recentLinesRef.current,
        });
        performScriptBeat(rotateScript, { notation: 'Luân Chuyển Đài' });
        appendMessage({
          username: BOT_MASTER_PROFILE.name,
          text: `${guest.username} quá giờ phản hồi — mời ${picked.username} lên đài (gõ nước đi hoặc "sẵn sàng" trong 20s)!`,
          kind: 'system',
        });
      } else {
        setTurnSecondsLeft(45);
      }
    } else if (clockAction.type === 'afk_auto_move_warn') {
      setAfkStrikes(clockAction.nextStrikes);
      setTurnSecondsLeft(45);
      const timeoutBoard = boardRef.current;
      const bestRed = pickGuestMove(
        timeoutBoard,
        concessionRef.current,
        generateLegalMoves(timeoutBoard.grid, 'red'),
        analysisRef.current.bestMove,
      );
      if (bestRed) {
        const autoScript = buildLiveInteractionScript({
          kind: 'afk_auto_move',
          challengerName: guest.username,
          guestGender: guest.gender,
          guestAge: guest.age,
          recentLines: recentLinesRef.current,
        });
        performScriptBeat(autoScript, { notation: 'Đi Hộ Giữ Nhịp' });
        commitMove(bestRed, `${guest.username} (Hết giờ)`, 'red');
      }
    }
  }, [
    afkStrikes,
    appState,
    appendMessage,
    autoCommentReply,
    awaitingReadyCheck,
    board.moveCount,
    board.status,
    board.turn,
    botThinking,
    commitMove,
    handleCommitCrowdVote,
    liveMode,
    performScriptBeat,
    queue,
    respondToLiveChat,
    speakingEngine,
    spotlightComment,
    turnSecondsLeft,
  ]);

  // Optional simulated TikTok audience wave (viewers chatting & queueing !choi)
  useEffect(() => {
    if (appState !== 'playing' || !audienceWaveOn) return;
    let idx = 0;
    const wave = window.setInterval(() => {
      const fan = SIMULATED_TIKTOK_AUDIENCE[idx % SIMULATED_TIKTOK_AUDIENCE.length];
      const line = fan.lines[Math.floor(Math.random() * fan.lines.length)];
      idx++;
      processIncomingChatRef.current(fan.username, line, {
        actorId: reserveActorId(fan.username, simulatedAudienceActors, 'relay'),
        gender: fan.gender,
        age: fan.age,
      });
    }, 9500);
    return () => window.clearInterval(wave);
  }, [appState, audienceWaveOn]);

  // Actions
  const handleStartLive = useCallback(
    (withAudience = true) => {
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      setAudienceWaveOn(withAudience);
      setAppState('playing');
      document.body.dataset.state = 'playing';
      setSplitScreen(true);
      setZoomFocus('bot');
      setCameraPreset('liveBot');
      stageRef.current?.setTitleMode(false);
      stageRef.current?.setSplitScreen(true);
      stageRef.current?.setZoomFocus('bot');
      stageRef.current?.setCameraPreset('liveBot');
      wuxiaAudio.playGuzhengSweep();

      const guest = activeChallengerRef.current;
      const opening = buildNightTeaseScript({
        night: nightRef.current,
        board: boardRef.current,
        ladder: dowryRef.current,
        challengerName: guest.username,
        guestGender: guest.gender,
        guestAge: guest.age,
        recentLines: recentLinesRef.current,
      });
      performScriptBeat(opening, {
        moveNumber: boardRef.current.moveCount,
        notation: 'Khai Đài Live',
      });
      if (boardRef.current.moveCount === 0) speakConcessionClaim(3800);
    },
    [performScriptBeat, speakConcessionClaim],
  );

  const handleResetMatch = useCallback(() => {
    turnSeqRef.current++;
    pendingLandingCuesRef.current.clear();
    pendingSettledCuesRef.current.clear();
    if (botTimerRef.current) window.clearTimeout(botTimerRef.current);
    if (gestureChoreoTimerRef.current) {
      window.clearTimeout(gestureChoreoTimerRef.current);
      gestureChoreoTimerRef.current = null;
    }
    // A new duel re-lays the conceded array: the rung is a pre-game gift, so it is reset with the
    // stones, and the shield ledger starts against exactly the board the referee is about to see.
    const nextOpening = openConcession(concession);
    concessionRef.current = nextOpening.state;
    const fresh = nextOpening.board;
    const freshAnalysis = analyzePosition(fresh, difficultyRef.current, { mode: 'preview' });
    prevScoreRef.current = freshAnalysis.score;
    prevWinProbRedRef.current = freshAnalysis.winProbRed;
    nudgedTurnKeyRef.current = '';
    countdownTurnKeyRef.current = '';
    recentLinesRef.current = [];
    phaseRef.current = null;
    lastRepetitionWarnPlyRef.current = -999;
    recentPosKeysRef.current = freshAnalysis.positionKey ? [freshAnalysis.positionKey] : [];
    // A new duel puts the whole stake back on the table; the ladder only escalates within one.
    dowryRef.current = initialLadder();
    setDowry(dowryRef.current);
    saveLadder(window.localStorage, dowryRef.current);
    setBoard(fresh);
    boardRef.current = fresh;
    setAnalysis(freshAnalysis);
    setMoveHistory([]);
    lastVerifiedMotifRef.current = '';
    setSelectedSquare(null);
    setPreferredPieceId(null);
    setBoardFocus(null);
    setHostEmotion('amused');
    setBotThinking(false);
    setTurnSecondsLeft(45);
    setMoveHintError(null);
    setAppState('playing');
    document.body.dataset.state = 'playing';

    stageRef.current?.syncBoard(fresh, null, false);
    stageRef.current?.setSelectionOverlay(null, []);
    stageRef.current?.updateAnalysisVisuals(fresh, freshAnalysis, showAnalysis, null);
    stageRef.current?.setBotState('calm', false);

    const guest = activeChallengerRef.current;
    const resetBeat = buildNightTeaseScript({
      night: nightRef.current,
      board: fresh,
      ladder: dowryRef.current,
      challengerName: guest.username,
      guestGender: guest.gender,
      guestAge: guest.age,
      recentLines: [],
    });
    performScriptBeat(resetBeat, { moveNumber: 0, notation: 'Khai Cuộc Mới' });
    wuxiaAudio.playGuzhengSweep();
    // She says the opening first, then what she is giving away - one voice, two lines, in that order.
    speakConcessionClaim(3800);
  }, [concession, performScriptBeat, showAnalysis, speakConcessionClaim]);

  const handleSelectCamera = useCallback((preset: CameraPreset) => {
    setCameraPreset(preset);
    stageRef.current?.setCameraPreset(preset);
  }, []);

  const handleTriggerActionCue = useCallback(
    (
      type: 'sip_tea' | 'tease' | 'think_fan' | 'audience_call',
      _actor: 'bride' | 'groom' = 'bride',
    ) => {
      const guest = activeChallengerRef.current;
      const beatMap = {
        sip_tea: 'gesture_sip_tea',
        tease: 'gesture_tease',
        think_fan: 'gesture_think_fan',
        audience_call: 'audience_call',
      } as const;

      // The tease cue is the night's own voice; the other gestures keep the general beat pool.
      const script =
        type === 'tease'
          ? buildNightTeaseScript({
              night: nightRef.current,
              board: boardRef.current,
              ladder: dowryRef.current,
              challengerName: guest.username,
              guestGender: guest.gender,
              guestAge: guest.age,
              recentLines: recentLinesRef.current,
            })
          : buildLiveSessionBeat({
              beat: beatMap[type],
              challengerName: guest.username,
              guestTitle: guest.character.title,
              guestGender: guest.gender,
              guestAge: guest.age,
              winProbRed: analysisRef.current.winProbRed,
              moveCount: boardRef.current.moveCount,
              recentLines: recentLinesRef.current,
            });

      if (type === 'tease' || type === 'audience_call') {
        wuxiaAudio.playPieceSelect();
      }
      performScriptBeat(script, { notation: script.motif });
    },
    [performScriptBeat],
  );

  const handleApplyGuestQuickMatch = useCallback(
    (
      username: string,
      gender: GuestGender,
      age: number,
      explicitChar?: WuxiaCharacterProfile,
    ) => {
      const char = explicitChar ?? matchGuestCharacter(gender, age);
      const safeName = username || '@KhachMoi';
      const entry = createChallenger(
        safeName,
        actorIdFor('local', safeName),
        gender,
        age,
        char,
      );
      setActiveChallenger(entry);
      activeChallengerRef.current = entry;
      stageRef.current?.setGuestCharacter(char);
      appendMessage({
        username: BOT_MASTER_PROFILE.name,
        text: `Mời ${entry.username} nhập vai ${char.name} (${char.title} · ${gender === 'nam' ? 'Nam' : 'Nữ'} ${age} tuổi) lên kỳ đài!`,
        kind: 'system',
      });
      if (appStateRef.current === 'playing' && !botThinkingRef.current) {
        const welcome = buildLiveSessionBeat({
          beat: 'challenger_welcome',
          challengerName: entry.username,
          guestTitle: char.title,
          guestGender: gender,
          guestAge: age,
          winProbRed: analysisRef.current.winProbRed,
          moveCount: boardRef.current.moveCount,
          recentLines: recentLinesRef.current,
        });
        performScriptBeat(welcome, { notation: 'Đón Khách Lên Đài' });
      }
    },
    [appendMessage, performScriptBeat],
  );

  const handlePickFromQueue = useCallback(
    (mode: 'fifo' | 'random' | string) => {
      let picked: ChallengerEntry | null = null;
      let rest: ChallengerEntry[] = queue;

      if (mode === 'fifo' || mode === 'random') {
        const res = pickNextChallenger(queue, mode);
        picked = res.picked;
        rest = res.rest;
      } else {
        // Explicit queue ID picked directly by host
        const found = queue.find((q) => q.id === mode);
        if (found) {
          picked = found;
          rest = queue.filter((q) => q.id !== mode);
        }
      }

      if (!picked) return;
      setQueue(rest);
      setActiveChallenger(picked);
      activeChallengerRef.current = picked;
      setAfkStrikes(0);
      setAwaitingReadyCheck(true);
      setTurnSecondsLeft(20);
      stageRef.current?.setGuestCharacter(picked.character);
      appendMessage({
        username: BOT_MASTER_PROFILE.name,
        text: `Đã mời ${picked.username}${picked.isVip ? ' [VIP]' : ''} (${picked.character.title}) lên đài! Gõ nước đi hoặc nhắn "sẵn sàng" trong 20 giây.`,
        kind: 'bot',
      });
      wuxiaAudio.playGuzhengSweep();
      if (appStateRef.current === 'playing' && !botThinkingRef.current) {
        const readyScript = buildLiveInteractionScript({
          kind: 'ready_check_call',
          challengerName: picked.username,
          guestGender: picked.gender,
          guestAge: picked.age,
          recentLines: recentLinesRef.current,
        });
        performScriptBeat(readyScript, { notation: 'Mời Cao Thủ Lên Đài' });
      }
    },
    [appendMessage, performScriptBeat, queue],
  );

  const handleToggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      wuxiaAudio.muted = next;
      if (next) {
        wuxiaAudio.stopSpeech();
        setSpeakingEngine(null);
      }
      return next;
    });
  }, []);

  const handleToggleVoice = useCallback(() => {
    setVoiceEnabled((prev) => {
      const next = !prev;
      wuxiaAudio.voiceEnabled = next;
      if (!next) {
        wuxiaAudio.stopSpeech();
        setSpeakingEngine(null);
      }
      return next;
    });
  }, []);

  const handleReplayOrTestVoice = useCallback(
    (customLine?: string) => {
      if (muted) {
        setMuted(false);
        wuxiaAudio.muted = false;
      }
      if (!voiceEnabled) {
        setVoiceEnabled(true);
        wuxiaAudio.voiceEnabled = true;
      }
      const line =
        customLine ??
        commentary?.line ??
        'Chàng ơi, đèn hoa chúc sáng rực rồi — mời chàng đi nước cờ đầu tiên cho hai họ phòng live cùng chiêm ngưỡng nha!';
      triggerBotSpeaking(line, commentary?.mood ?? 'calm', {
        emotion: commentary?.emotion ?? hostEmotion,
      });
    },
    [commentary, hostEmotion, muted, triggerBotSpeaking, voiceEnabled],
  );

  const handleTestWebhook = useCallback(async () => {
    try {
      const resp = await fetch('/api/live/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uniqueId: activeChallengerRef.current.username.replace(/^@/, ''),
          comment: boardRef.current.moveCount === 0 ? 'p2 bình 5' : 'Chào Kỳ Ma từ TikTok Live Webhook!',
        }),
      });
      if (!resp.ok) {
        const payload = await resp.json().catch(() => ({}));
        const code = String(payload?.code ?? '');
        appendMessage({
          username: 'Hệ thống',
          text:
            code === 'INGEST_NOT_CONFIGURED'
              ? 'Webhook đang khóa an toàn (503): hãy cấu hình CTL_LIVE_INGEST_TOKEN trong .env / Secrets và gửi header x-ctl-ingest-token từ relay.'
              : code === 'BAD_INGEST_TOKEN'
                ? 'Webhook đã xác thực bảo mật (401): relay cần gửi đúng header x-ctl-ingest-token.'
                : `Webhook phản hồi mã ${resp.status}.`,
          kind: 'system',
        });
      }
    } catch {
      appendMessage({
        username: 'Hệ thống',
        text: 'Không gửi được tín hiệu thử nghiệm tới /api/live/webhook.',
        kind: 'system',
      });
    }
  }, [appendMessage]);

  // Global keyboard shortcuts (Enter/Space on Title, H dock toggle, P/Esc pause, M mute)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      const isTyping = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

      if (appStateRef.current === 'title') {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleStartLive(true);
        }
        return;
      }

      if (isTyping) return;

      if (e.key === 'h' || e.key === 'H') {
        e.preventDefault();
        setDockCollapsed((c) => !c);
      } else if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
        e.preventDefault();
        setAppState((prev) =>
          prev === 'playing' ? 'paused' : prev === 'paused' ? 'playing' : prev,
        );
      } else if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        handleToggleMute();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleStartLive, handleToggleMute]);

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[#0d0a0c] select-none">
      {/* Isolated Full-Bleed WebGL 3D Canvas Container */}
      <div
        ref={canvasMountRef}
        data-testid="xiangqi-canvas-stage"
        className="fixed inset-0 w-full h-full"
      />

      {/* Title Screen Overlay */}
      {appState === 'title' && (
        <TitleOverlay
          onStartLive={() => handleStartLive(true)}
          onStartFreePlay={() => handleStartLive(false)}
        />
      )}

      {/* ====================================================================
          MODE A: TIKTOK LIVE 9:16 VERTICAL BROADCAST STUDIO
          (Centered pure 9:16 stage: Top 42% Zoom Character + Bottom 58% Board,
           with desktop side Studio Wings outside the 9:16 capture area!)
      ==================================================================== */}
      {appState !== 'title' && tiktokFrame && (
        <TikTokLiveStudioOverlay
          board={board}
          activeChallenger={activeChallenger}
          queue={queue}
          turn={board.turn}
          moveCount={board.moveCount}
          turnSecondsLeft={turnSecondsLeft}
          inCheck={board.inCheck}
          botThinking={botThinking}
          viewerCount={viewerCount}
          nightName={nightRef.current.nameVi}
          nightDowryLabel={nightDowryStatus(nightRef.current, dowry).labelVi}
          analysis={analysis}
          commentary={commentary}
          messages={messages}
          moveHintError={moveHintError}
          boardFocus={boardFocus}
          moveEvent={moveEvent}
          actionCue={actionCue}
          cinemaAngle={cinemaAngle}
          onSelectCinemaAngle={setCinemaAngle}
          onTriggerActionCue={handleTriggerActionCue}
          zoomFocus={zoomFocus}
          onSelectZoomFocus={setZoomFocus}
          showAnalysis={showAnalysis}
          onToggleAnalysis={() => {
            setShowAnalysis((s) => {
              const next = !s;
              if (next) wuxiaAudio.playGuzhengSweep();
              return next;
            });
          }}
          previewVariationIdx={previewVariationIdx}
          onHoverVariation={setPreviewVariationIdx}
          difficulty={difficulty}
          onSelectDifficulty={setDifficulty}
          pieceStyle={pieceStyle}
          onCyclePieceTheme={handleCyclePieceTheme}
          onCyclePieceLabelMode={handleCyclePieceLabelMode}
          muted={muted}
          onToggleMute={handleToggleMute}
          voiceEnabled={voiceEnabled}
          onToggleVoice={handleToggleVoice}
          voiceName={voiceName}
          onSelectVoiceName={(v) => {
            setVoiceName(v);
            wuxiaAudio.voiceName = v;
            handleReplayOrTestVoice(
              'Hì hì... chàng nghe giọng này của thiếp — đã đủ ngọt ngào cho đêm hoa chúc chưa nào?',
            );
          }}
          speechRate={speechRate}
          onSelectSpeechRate={(r) => {
            setSpeechRate(r);
            wuxiaAudio.speechRate = r;
          }}
          speakingEngine={speakingEngine}
          onReplayVoice={() => handleReplayOrTestVoice()}
          onTestVoice={() =>
            handleReplayOrTestVoice(
              'Đêm hoa chúc... ánh trăng in bóng hồ sen đẹp quá! Chàng thắng ván này thì thiếp nghe lời — còn thua thì ra hành lang ngắm trăng nha!',
            )
          }
          onRequestAiCommentary={() => {
            if (!board.lastMove && analysis.bestMove) {
              void requestEmotionalGeminiCommentary({
                notation: analysis.bestNotation,
                actorName: BOT_MASTER_PROFILE.name,
                side: board.turn,
                nextBoard: board,
                move: analysis.bestMove,
                verifiedMotif: '',
                nextAnalysis: analysis,
                explicitRequest: true,
              });
            } else if (board.lastMove) {
              void requestEmotionalGeminiCommentary({
                notation: moveHistory[moveHistory.length - 1] ?? analysis.bestNotation,
                actorName:
                  board.lastMove.piece.side === 'red'
                    ? activeChallenger.username
                    : BOT_MASTER_PROFILE.name,
                side: board.lastMove.piece.side,
                nextBoard: board,
                move: board.lastMove,
                verifiedMotif: lastVerifiedMotifRef.current,
                nextAnalysis: analysis,
                explicitRequest: true,
              });
            }
          }}
          aiLoading={aiLoading}
          audienceWaveOn={audienceWaveOn}
          onToggleAudienceWave={() => setAudienceWaveOn((w) => !w)}
          autoCommentReply={autoCommentReply}
          onToggleAutoCommentReply={() => setAutoCommentReply((v) => !v)}
          liveMode={liveMode}
          onSelectLiveMode={handleSelectLiveMode}
          crowdTopVotes={tallyCrowdVotes(crowdVote, 3)}
          crowdTotalVotes={crowdVote.totalVotes}
          onCommitCrowdVote={handleCommitCrowdVote}
          voiceListening={voiceListening}
          voiceInterimText={voiceInterimText}
          pendingVoiceMove={
            pendingVoiceMove
              ? {
                  notation: pendingVoiceMove.notation,
                  transcript: pendingVoiceMove.transcript,
                }
              : null
          }
          onToggleVoiceListening={handleToggleVoiceListening}
          onConfirmPendingVoiceMove={handleConfirmPendingVoiceMove}
          onCancelPendingVoiceMove={handleCancelPendingVoiceMove}
          awaitingReadyCheck={awaitingReadyCheck}
          onSubmitChat={submitStudioChat}
          onApplyGuestQuickMatch={handleApplyGuestQuickMatch}
          onPickFromQueue={handlePickFromQueue}
          onResetMatch={handleResetMatch}
          onTestWebhook={handleTestWebhook}
          onExitTikTokMode={() => setTiktokFrame(false)}
          onPause={() => setAppState('paused')}
        />
      )}

      {/* ====================================================================
          MODE B: WIDESCREEN 2-SCREEN SPLIT / FULLSCREEN BROADCAST HUD
      ==================================================================== */}
      {appState !== 'title' && !tiktokFrame && (
        <>
          {/* Split-Screen Right 40% (Desktop) / Bottom 44% (Mobile) Full-Body Moonlit Lotus Pavilion Movie Stage */}
          {splitScreen && (
            <div className="fixed left-0 right-0 bottom-0 h-[44%] md:top-0 md:left-auto md:right-0 md:bottom-0 md:h-auto md:w-[40%] z-10 border-t md:border-t-0 md:border-l border-[#d4a44e]/45 overflow-hidden">
              <CinematicPavilionPane
                board={board}
                guestProfile={activeChallenger.character}
                guestName={activeChallenger.character.name}
                zoomFocus={zoomFocus}
                mood={commentary?.mood ?? 'calm'}
                emotion={hostEmotion}
                emotionLabel={EMOTION_LABELS_VI[hostEmotion]}
                isSpeaking={speakingEngine !== null}
                inCheck={board.inCheck !== null}
                botThinking={botThinking}
                boardFocus={boardFocus}
                moveEvent={moveEvent}
                actionCue={actionCue}
                cinemaAngle={cinemaAngle}
                onSelectCinemaAngle={setCinemaAngle}
                onTriggerActionCue={handleTriggerActionCue}
                onSelectZoomFocus={setZoomFocus}
                variant="widescreen"
              />
            </div>
          )}

          <TopBroadcastBar
            activeChallenger={activeChallenger}
            turn={board.turn}
            moveCount={board.moveCount}
            turnSecondsLeft={turnSecondsLeft}
            winProbRed={analysis.winProbRed}
            score={analysis.score}
            inCheck={board.inCheck}
            botThinking={botThinking}
            showAnalysis={showAnalysis}
            splitScreen={splitScreen}
            muted={muted}
            tiktokFrame={tiktokFrame}
            viewerCount={viewerCount}
            dowry={dowry}
            night={nightRef.current}
            liveMode={liveMode}
            awaitingReadyCheck={awaitingReadyCheck}
            onToggleAnalysis={() => {
              setShowAnalysis((s) => {
                const next = !s;
                if (next) wuxiaAudio.playGuzhengSweep();
                return next;
              });
            }}
            onToggleSplitScreen={() => setSplitScreen((s) => !s)}
            onToggleMute={handleToggleMute}
            onToggleTikTokFrame={() => setTiktokFrame((f) => !f)}
            pieceStyle={pieceStyle}
            onCyclePieceTheme={handleCyclePieceTheme}
            onCyclePieceLabelMode={handleCyclePieceLabelMode}
            onPause={() => setAppState('paused')}
          />

          <CommentaryBanner
            commentary={commentary}
            dockCollapsed={dockCollapsed}
            splitScreen={splitScreen}
            speakingEngine={speakingEngine}
            voiceEnabled={voiceEnabled}
            muted={muted}
            onReplayVoice={() => handleReplayOrTestVoice()}
          />

          <BottomControlDock
            collapsed={dockCollapsed}
            onToggleCollapse={() => setDockCollapsed((c) => !c)}
            activeTab={activeTab}
            onSelectTab={setActiveTab}
            messages={messages}
            activeChallenger={activeChallenger}
            audienceWaveOn={audienceWaveOn}
            onToggleAudienceWave={() => setAudienceWaveOn((w) => !w)}
            autoCommentReply={autoCommentReply}
            onToggleAutoCommentReply={() => setAutoCommentReply((v) => !v)}
            liveMode={liveMode}
            onSelectLiveMode={handleSelectLiveMode}
            crowdTopVotes={tallyCrowdVotes(crowdVote, 3)}
            crowdTotalVotes={crowdVote.totalVotes}
            onCommitCrowdVote={handleCommitCrowdVote}
            voiceListening={voiceListening}
            voiceInterimText={voiceInterimText}
            pendingVoiceMove={
              pendingVoiceMove
                ? {
                    notation: pendingVoiceMove.notation,
                    transcript: pendingVoiceMove.transcript,
                  }
                : null
            }
            onToggleVoiceListening={handleToggleVoiceListening}
            onConfirmPendingVoiceMove={handleConfirmPendingVoiceMove}
            onCancelPendingVoiceMove={handleCancelPendingVoiceMove}
            onReadSpotlightComment={handleReadSpotlightComment}
            hasSpotlightComment={spotlightComment !== null}
            onSubmitChat={submitStudioChat}
            moveHintError={moveHintError}
            queue={queue}
            awaitingReadyCheck={awaitingReadyCheck}
            afkStrikes={afkStrikes}
            onApplyGuestQuickMatch={handleApplyGuestQuickMatch}
            onPickFromQueue={handlePickFromQueue}
            analysis={analysis}
            moveHistory={moveHistory}
            previewVariationIdx={previewVariationIdx}
            onHoverVariation={setPreviewVariationIdx}
            onRequestAiCommentary={() => {
              if (!board.lastMove && analysis.bestMove) {
                void requestEmotionalGeminiCommentary({
                  notation: analysis.bestNotation,
                  actorName: BOT_MASTER_PROFILE.name,
                  side: board.turn,
                  nextBoard: board,
                  move: analysis.bestMove,
                  verifiedMotif: '',
                  nextAnalysis: analysis,
                  explicitRequest: true,
                });
              } else if (board.lastMove) {
                void requestEmotionalGeminiCommentary({
                  notation: moveHistory[moveHistory.length - 1] ?? analysis.bestNotation,
                  actorName:
                    board.lastMove.piece.side === 'red'
                      ? activeChallenger.username
                      : BOT_MASTER_PROFILE.name,
                  side: board.lastMove.piece.side,
                  nextBoard: board,
                  move: board.lastMove,
                  verifiedMotif: lastVerifiedMotifRef.current,
                  nextAnalysis: analysis,
                  explicitRequest: true,
                });
              }
            }}
            aiLoading={aiLoading}
            aiError={aiError}
            cameraPreset={cameraPreset}
            onSelectCamera={handleSelectCamera}
            splitScreen={splitScreen}
            onToggleSplitScreen={() => setSplitScreen((s) => !s)}
            tiktokFrame={tiktokFrame}
            onToggleTikTokFrame={() => setTiktokFrame((f) => !f)}
            zoomFocus={zoomFocus}
            onSelectZoomFocus={setZoomFocus}
            pieceStyle={pieceStyle}
            onSelectPieceStyle={setPieceStyle}
            difficulty={difficulty}
            onSelectDifficulty={setDifficulty}
            concession={concession}
            onSelectConcession={handleSelectConcession}
            voiceEnabled={voiceEnabled}
            onToggleVoice={handleToggleVoice}
            voiceName={voiceName}
            onSelectVoiceName={(v) => {
              setVoiceName(v);
              wuxiaAudio.voiceName = v;
              handleReplayOrTestVoice(
                'Hì hì... chàng nghe giọng này của thiếp — đã đủ ngọt ngào cho đêm hoa chúc chưa nào?',
              );
            }}
            speechRate={speechRate}
            onSelectSpeechRate={(r) => {
              setSpeechRate(r);
              wuxiaAudio.speechRate = r;
            }}
            onTestVoice={() =>
              handleReplayOrTestVoice(
                'Đêm hoa chúc... ánh trăng in bóng hồ sen đẹp quá! Chàng thắng ván này thì thiếp nghe lời — còn thua thì ra hành lang ngắm trăng nha!',
              )
            }
            onResetMatch={handleResetMatch}
            onTestWebhook={handleTestWebhook}
          />
        </>
      )}

      {/* Focused Pause / Match Over Modal */}
      {(appState === 'paused' || appState === 'gameover') && (
        <StatusModal
          mode={appState}
          status={board.status}
          statusReason={board.statusReason}
          moveCount={board.moveCount}
          winProbRed={analysis.winProbRed}
          challenger={activeChallenger}
          onResume={() => setAppState('playing')}
          onRestart={handleResetMatch}
          onReturnTitle={() => {
            if (botTimerRef.current) window.clearTimeout(botTimerRef.current);
            setBotThinking(false);
            setAppState('title');
          }}
        />
      )}
    </main>
  );
}
