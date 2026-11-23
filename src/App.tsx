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
  createInitialBoard,
  generateLegalMovesForSquare,
  makeMove,
} from './engine/xiangqi';
import {
  classifyChatMessage,
  formatMoveVietnamese,
  parseVietnameseChatMove,
} from './engine/notation';
import {
  BotDifficulty,
  DeepAnalysisResult,
  analyzePosition,
  detectMoveMotif,
} from './engine/ai';
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
  createChallenger,
  emotionToMood,
  enqueueChallenger,
  pickNextChallenger,
} from './engine/matchmaker';
import {
  MATCH_PHASE_LABELS_VI,
  PerformanceGesture,
  PerformanceScript,
  buildLiveSessionBeat,
  classifyTacticalEvent,
  countBoardPieces,
  detectMatchPhase,
} from './engine/livePerformance';
import { CameraPreset, XiangqiStage, ZoomFocus } from './scene/XiangqiStage';
import { CharacterMood } from './scene/characters3d';
import { BoardFocusSignal, HostEmotion } from './scene/portraitKinematics';
import {
  ActionCuePayload,
  CinemaCameraAngle,
  MoveChoreoPayload,
} from './scene/cinemaDirector';
import { CommentaryVoiceName, wuxiaAudio } from './utils/wuxiaAudio';
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

const INITIAL_CHALLENGER: ChallengerEntry = createChallenger(
  '@KiemKhach_VN',
  'nam',
  26,
  matchGuestCharacter('nam', 26),
);

const INITIAL_QUEUE: ChallengerEntry[] = [
  createChallenger('@TieuYenNhi_99', 'nu', 24),
  createChallenger('@LaoGiaCoTuong', 'nam', 64),
  createChallenger('@MinhNguyet_88', 'nu', 34),
];

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<XiangqiStage | null>(null);

  const [appState, setAppState] = useState<AppState>(() =>
    checkAutostart() ? 'playing' : 'title',
  );
  const [board, setBoard] = useState<BoardState>(() => createInitialBoard());
  const [analysis, setAnalysis] = useState<DeepAnalysisResult>(() =>
    analyzePosition(createInitialBoard(), 'cao_thu', { mode: 'preview' }),
  );
  const [moveHistory, setMoveHistory] = useState<string[]>([]);

  const [activeChallenger, setActiveChallenger] =
    useState<ChallengerEntry>(INITIAL_CHALLENGER);
  const [queue, setQueue] = useState<ChallengerEntry[]>(INITIAL_QUEUE);

  const [messages, setMessages] = useState<LiveChatMessage[]>([
    {
      id: 'init_1',
      username: BOT_MASTER_PROFILE.name,
      text: 'Đêm tân hôn nến đỏ khai cuộc! Chàng thắng thiếp thì thiếp nghe lời răm rắp, thua thì ôm gối ngắm trăng nha! Chat "!choi" để lên đài hoặc gửi nước đi như "p2 bình 5", "m8 tiến 7", "x7 bình 3".',
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
    line: 'Chào hai họ phòng live! Trước giờ động phòng hoa chúc... chàng đánh với thiếp một ván nhé — thắng thì thiếp nghe lời chàng răm rắp, còn thua thì ra hành lang ngắm trăng nha!',
    mood: 'calm',
    emotion: 'amused',
    emotionLabel: EMOTION_LABELS_VI.amused,
    gesture: 'closeup_talk',
    stageDirection: 'Mỉm cười rạng rỡ chào hai họ dưới ánh nến hỷ',
    phaseLabel: MATCH_PHASE_LABELS_VI.khai_cuoc,
    source: 'engine',
  });

  const [dockCollapsed, setDockCollapsed] = useState(false);
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
  const [moveEvent, setMoveEvent] = useState<MoveChoreoPayload | null>(null);
  const [actionCue, setActionCue] = useState<ActionCuePayload | null>(null);
  const focusSeqRef = useRef(0);
  const moveChoreoSeqRef = useRef(0);
  const actionCueSeqRef = useRef(0);
  const recentLinesRef = useRef<string[]>([]);
  const recentPosKeysRef = useRef<string[]>([]);
  const prevScoreRef = useRef<number>(0);
  const prevWinProbRedRef = useRef<number>(50);
  const turnSeqRef = useRef<number>(0);
  const nudgedTurnKeyRef = useRef<string>('');
  const countdownTurnKeyRef = useRef<string>('');
  const gestureChoreoTimerRef = useRef<number | null>(null);

  // Refs synced to latest state so Three.js callbacks & SSE listeners never go stale
  const boardRef = useRef(board);
  const analysisRef = useRef(analysis);
  const appStateRef = useRef(appState);
  const activeChallengerRef = useRef(activeChallenger);
  const difficultyRef = useRef(difficulty);
  const selectedSquareRef = useRef(selectedSquare);
  const preferredPieceIdRef = useRef(preferredPieceId);
  const botThinkingRef = useRef(botThinking);
  const botTimerRef = useRef<number | null>(null);
  const speakTimerRef = useRef<number | null>(null);
  const speakUiSeqRef = useRef<number>(0);

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
    recentLinesRef.current = [...recentLinesRef.current.slice(-9), line];
  }, []);

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

  const requestEmotionalGeminiCommentary = useCallback(
    async (params: {
      notation: string;
      playerMoveNotation?: string;
      botMoveNotation?: string;
      actorName: string;
      side: 'red' | 'black';
      nextBoard: BoardState;
      move: Move;
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
            motif: params.nextAnalysis.motif,
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
            recentLines: recentLinesRef.current,
            auto: !params.explicitRequest,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          if (params.explicitRequest) {
            setAiError(data?.error || 'Không thể kết nối bình luận viên AI.');
          }
          return null;
        }
        if (data?.line) {
          const emotion: HostEmotion = data.emotion || 'calm';
          const gesture: PerformanceGesture = data.gesture || 'closeup_talk';
          const stageDirection: string | undefined = data.stageDirection || undefined;
          const item: CommentaryItem = {
            id: `gem_${Date.now()}`,
            moveNumber: params.nextBoard.moveCount,
            actor: BOT_MASTER_PROFILE.name,
            notation: params.notation,
            motif: data.motif || params.nextAnalysis.motif,
            line: data.line,
            mood: emotionToMood(emotion),
            emotion,
            emotionLabel: data.emotionLabel || EMOTION_LABELS_VI[emotion],
            vocalCue: data.vocalCue || '',
            gesture,
            stageDirection,
            phaseLabel: data.phaseLabel || phaseLabel,
            source: 'gemini',
          };
          if (params.explicitRequest) {
            recordRecentLine(item.line);
            setCommentary(item);
            setHostEmotion(emotion);
            dispatchGestureCue(gesture, stageDirection, 0);
            triggerBotSpeaking(item.line, item.mood, {
              emotion,
              vocalCue: item.vocalCue,
            });
          }
          return item;
        }
        return null;
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
      },
    ) => {
      const currentBoard = boardRef.current;
      const notation = formatMoveVietnamese(currentBoard.grid, move);
      const nextBoard = makeMove(currentBoard, move);

      setBoard(nextBoard);
      boardRef.current = nextBoard;
      setMoveHistory((prev) => [...prev, notation]);
      setSelectedSquare(null);
      setMoveHintError(null);
      setTurnSecondsLeft(45);

      if (side === 'red') {
        setPreferredPieceId(move.piece.id);
      }

      // Crisp board audio FX scaled to move weight
      if (nextBoard.inCheck) {
        wuxiaAudio.playCheck();
      } else if (move.captured) {
        wuxiaAudio.playCapture();
      } else {
        wuxiaAudio.playPieceMove();
      }

      const prevScore = prevScoreRef.current;
      const prevWinProbRed = prevWinProbRedRef.current;
      const nextAnalysis =
        precomputed?.nextAnalysis ??
        analyzePosition(nextBoard, difficultyRef.current, {
          mode: nextBoard.turn === 'black' ? 'play' : 'preview',
          recentPositionKeys: recentPosKeysRef.current,
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

      // Update 3D stage immediately
      stageRef.current?.syncBoard(nextBoard, move, true);
      stageRef.current?.setSelectionOverlay(null, []);
      stageRef.current?.updateAnalysisVisuals(nextBoard, nextAnalysis, showAnalysis, null);

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
        seq: ++moveChoreoSeqRef.current,
        side,
        from: move.from,
        to: move.to,
        captured: Boolean(move.captured),
        inCheck: nextBoard.inCheck !== null,
        pieceId: move.piece.id,
      });

      appendMessage({
        username: actorName,
        text: `${notation}${nextBoard.inCheck ? ' — CHIẾU TƯỚNG!' : ''}`,
        kind: side === 'red' ? 'move' : 'bot',
      });

      const playedMotif = detectMoveMotif(currentBoard.grid, move, nextBoard.grid);

      // Case 1: Match Ended (Checkmate / Stalemate) — deliver emotional finale immediately
      if (nextBoard.status !== 'playing') {
        setBotThinking(false);
        const guest = activeChallengerRef.current;
        const fallbackEnd = buildInstantWuxiaCommentary({
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
        });
        recordRecentLine(fallbackEnd.line);
        setCommentary(fallbackEnd);
        setHostEmotion(fallbackEnd.emotion ?? 'victory');
        dispatchGestureCue(fallbackEnd.gesture, fallbackEnd.stageDirection, 900);
        triggerBotSpeaking(fallbackEnd.line, fallbackEnd.mood, {
          emotion: fallbackEnd.emotion,
          vocalCue: fallbackEnd.vocalCue,
        });
        setTimeout(() => {
          setAppState('gameover');
        }, 700);
        return;
      }

      // Case 2: Red (Challenger) just moved -> React visually right away, compute Bot reply,
      // and call Gemini AI commentary in PARALLEL during Bot's natural think beat so speech NEVER cuts off!
      if (nextBoard.turn === 'black') {
        const myTurnToken = ++turnSeqRef.current;
        const redReaction: HostEmotion = nextBoard.inCheck
          ? 'check'
          : move.captured || scoreDeltaForRed >= 80
            ? 'surprised'
            : scoreDeltaForRed <= -110
              ? 'amused'
              : 'thinking';
        setHostEmotion(redReaction);
        setBotThinking(true);
        stageRef.current?.setBotState('thinking', false);
        if (botTimerRef.current) window.clearTimeout(botTimerRef.current);

        // Reuse the full-depth Grandmaster Bot decision already computed for nextBoard!
        const plannedBotMove = nextAnalysis.bestMove;

        let parallelGeminiPromise: Promise<CommentaryItem | null> | undefined;
        let boardAfterBotAnalysis: DeepAnalysisResult | undefined;

        if (plannedBotMove) {
          const botNotation = formatMoveVietnamese(nextBoard.grid, plannedBotMove);
          const simulatedAfterBot = makeMove(nextBoard, plannedBotMove);
          boardAfterBotAnalysis = analyzePosition(simulatedAfterBot, difficultyRef.current, {
            mode: 'preview',
            recentPositionKeys: recentPosKeysRef.current,
          });
          parallelGeminiPromise = requestEmotionalGeminiCommentary({
            notation: botNotation,
            playerMoveNotation: notation,
            botMoveNotation: botNotation,
            actorName: BOT_MASTER_PROFILE.name,
            side: 'black',
            nextBoard: simulatedAfterBot,
            move: plannedBotMove,
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

        botTimerRef.current = window.setTimeout(() => {
          if (appStateRef.current !== 'playing' || turnSeqRef.current !== myTurnToken) {
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
            });
          }
        }, 820);
        return;
      }

      // Case 3: Black (Kỳ Ma) just landed her reply -> Deliver ONE complete, deeply emotional choreographed line!
      const guest = activeChallengerRef.current;
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
      });

      const expectedToken = precomputed?.turnToken ?? turnSeqRef.current;
      const deliverCommentary = (cmt: CommentaryItem) => {
        if (turnSeqRef.current !== expectedToken) return;
        const emo = cmt.emotion ?? 'calm';
        recordRecentLine(cmt.line);
        setCommentary(cmt);
        setHostEmotion(emo);
        // Let the hand-lift shot (table_hands) land cleanly (~1.25s), then cut to the synced gesture!
        dispatchGestureCue(
          cmt.gesture ?? fallbackCmt.gesture,
          cmt.stageDirection ?? fallbackCmt.stageDirection,
          1250,
        );
        triggerBotSpeaking(cmt.line, cmt.mood, {
          emotion: emo,
          vocalCue: cmt.vocalCue,
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
      dispatchGestureCue,
      recordRecentLine,
      requestEmotionalGeminiCommentary,
      showAnalysis,
      triggerBotSpeaking,
    ],
  );

  // Process any incoming chat message (local form, simulated TikTok viewer, or real SSE webhook!)
  const processIncomingChat = useCallback(
    (
      username: string,
      text: string,
      meta?: { gender?: GuestGender; age?: number; giftName?: string },
    ) => {
      const currentChallenger = activeChallengerRef.current;

      // 0. Live TikTok Gift Reaction -> Immediate joyful thank-you & synced gesture!
      if (meta?.giftName) {
        appendMessage({
          username,
          text: `Đã tặng ${meta.giftName}! ${text || ''}`.trim(),
          kind: 'viewer',
        });
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
      const isChallenger =
        username.toLowerCase() === currentChallenger.username.toLowerCase();

      // 1. Viewer requests to join challenge queue (!choi / !thachdau / lên đài)
      if (intent.type === 'challenge') {
        const entry = createChallenger(
          username,
          meta?.gender ?? (Math.random() > 0.45 ? 'nam' : 'nu'),
          meta?.age ?? 22 + Math.floor(Math.random() * 28),
        );
        setQueue((prev) => enqueueChallenger(prev, entry));
        appendMessage({ username, text, kind: 'viewer' });
        appendMessage({
          username: BOT_MASTER_PROFILE.name,
          text: `Đã ghi danh ${username} (${entry.character.title}) vào hàng đợi thách đấu!`,
          kind: 'system',
        });
        return;
      }

      // 2. Quick gender+age profile command (!nam 28, !nu 24)
      if (intent.type === 'guest_profile' && intent.gender && intent.age) {
        const matched = matchGuestCharacter(intent.gender, intent.age);
        const updated = createChallenger(username, intent.gender, intent.age, matched);
        setActiveChallenger(updated);
        stageRef.current?.setGuestCharacter(matched);
        appendMessage({
          username: BOT_MASTER_PROFILE.name,
          text: `Khách mời ${username} hóa thân thành ${matched.name} (${matched.title})!`,
          kind: 'system',
        });
        return;
      }

      // 3. Move command parsing if it's Red's turn & game is playing
      const liveBoard = boardRef.current;
      if (
        appStateRef.current === 'playing' &&
        liveBoard.status === 'playing' &&
        liveBoard.turn === 'red' &&
        !botThinkingRef.current &&
        isChallenger
      ) {
        const parsed = parseVietnameseChatMove(
          liveBoard,
          text,
          preferredPieceIdRef.current,
        );
        if (parsed.move) {
          commitMove(parsed.move, username, 'red');
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
          return;
        }
      }

      // 4. Otherwise display in live chat stream
      appendMessage({
        username,
        text,
        kind: isChallenger ? 'challenger' : 'viewer',
      });
    },
    [appendMessage, commitMove, performScriptBeat],
  );

  // Board click interaction handler (convenience alongside chat commands)
  const handleSquareClick = useCallback(
    (row: number, col: number) => {
      if (appStateRef.current !== 'playing' || botThinkingRef.current) return;
      const current = boardRef.current;
      if (current.status !== 'playing' || current.turn !== 'red') return;

      const clickedPiece = current.grid[row][col];
      const prevSel = selectedSquareRef.current;

      // If clicking a legal target of the already-selected Red piece, execute move!
      if (prevSel) {
        const legal = generateLegalMovesForSquare(current.grid, prevSel.row, prevSel.col);
        const match = legal.find((m) => m.to.row === row && m.to.col === col);
        if (match) {
          commitMove(match, activeChallengerRef.current.username, 'red');
          return;
        }
      }

      // Otherwise select Red piece and highlight its legal moves (soft pickup tap NEVER stops voice!)
      if (clickedPiece && clickedPiece.side === 'red') {
        const legal = generateLegalMovesForSquare(current.grid, row, col);
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
    [commitMove],
  );

  const handleSquareClickRef = useRef(handleSquareClick);
  useEffect(() => {
    handleSquareClickRef.current = handleSquareClick;
  }, [handleSquareClick]);

  // Mount Three.js Stage ONCE in isolated container
  useEffect(() => {
    const mount = canvasMountRef.current;
    if (!mount) return;

    const stage = new XiangqiStage(mount, boardRef.current, activeChallengerRef.current.character, {
      onSquareClick: (r, c) => handleSquareClickRef.current(r, c),
    });
    stageRef.current = stage;

    const autoStart = checkAutostart();
    const initTikTok = checkInitialTikTok();
    stage.setSplitScreen(true);
    stage.setTikTokMode(initTikTok);
    stage.setZoomFocus('bot');
    stage.setCameraPreset('liveBot');
    stage.setTitleMode(!autoStart, autoStart);
    stage.updateAnalysisVisuals(boardRef.current, analysis, true, null);

    return () => {
      if (botTimerRef.current) window.clearTimeout(botTimerRef.current);
      if (speakTimerRef.current) window.clearTimeout(speakTimerRef.current);
      if (gestureChoreoTimerRef.current) window.clearTimeout(gestureChoreoTimerRef.current);
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

  // Subscribe to real-time SSE TikTok Live Stream from Express backend
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

  // Turn countdown timer & live viewer fluctuation while playing
  useEffect(() => {
    if (appState !== 'playing') return;
    const timer = window.setInterval(() => {
      setViewerCount((v) => Math.max(820, v + Math.floor(Math.random() * 11) - 4));
      setTurnSecondsLeft((sec) => {
        if (boardRef.current.turn !== 'red' || botThinkingRef.current) return 45;
        return sec > 0 ? sec - 1 : 45;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [appState]);

  // Playful, non-spammy Live Host thinking nudge (~18s in) & countdown alert (8s left)
  useEffect(() => {
    if (
      appState !== 'playing' ||
      board.status !== 'playing' ||
      board.turn !== 'red' ||
      botThinking ||
      speakingEngine !== null ||
      board.moveCount < 1
    ) {
      return;
    }
    const turnKey = `${turnSeqRef.current}_${board.moveCount}`;
    const guest = activeChallengerRef.current;

    if (turnSecondsLeft === 27 && nudgedTurnKeyRef.current !== turnKey) {
      nudgedTurnKeyRef.current = turnKey;
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
    } else if (turnSecondsLeft === 8 && countdownTurnKeyRef.current !== turnKey) {
      countdownTurnKeyRef.current = turnKey;
      const alert = buildLiveSessionBeat({
        beat: 'countdown_alert',
        challengerName: guest.username,
        guestTitle: guest.character.title,
        guestGender: guest.gender,
        guestAge: guest.age,
        winProbRed: analysisRef.current.winProbRed,
        moveCount: board.moveCount,
        recentLines: recentLinesRef.current,
      });
      performScriptBeat(alert, { notation: 'Đếm Ngược 8s' });
    }
  }, [
    appState,
    board.moveCount,
    board.status,
    board.turn,
    botThinking,
    performScriptBeat,
    speakingEngine,
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
      const opening = buildLiveSessionBeat({
        beat: 'live_opening',
        challengerName: guest.username,
        guestTitle: guest.character.title,
        guestGender: guest.gender,
        guestAge: guest.age,
        winProbRed: analysisRef.current.winProbRed,
        moveCount: boardRef.current.moveCount,
        recentLines: recentLinesRef.current,
      });
      performScriptBeat(opening, { moveNumber: 0, notation: 'Khai Đài Live' });
    },
    [performScriptBeat],
  );

  const handleResetMatch = useCallback(() => {
    turnSeqRef.current++;
    if (botTimerRef.current) window.clearTimeout(botTimerRef.current);
    if (gestureChoreoTimerRef.current) {
      window.clearTimeout(gestureChoreoTimerRef.current);
      gestureChoreoTimerRef.current = null;
    }
    const fresh = createInitialBoard();
    const freshAnalysis = analyzePosition(fresh, difficultyRef.current, { mode: 'preview' });
    prevScoreRef.current = freshAnalysis.score;
    prevWinProbRedRef.current = freshAnalysis.winProbRed;
    nudgedTurnKeyRef.current = '';
    countdownTurnKeyRef.current = '';
    recentLinesRef.current = [];
    recentPosKeysRef.current = freshAnalysis.positionKey ? [freshAnalysis.positionKey] : [];
    setBoard(fresh);
    boardRef.current = fresh;
    setAnalysis(freshAnalysis);
    setMoveHistory([]);
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
    const resetBeat = buildLiveSessionBeat({
      beat: 'live_opening',
      challengerName: guest.username,
      guestTitle: guest.character.title,
      guestGender: guest.gender,
      guestAge: guest.age,
      winProbRed: freshAnalysis.winProbRed,
      moveCount: 0,
      recentLines: [],
    });
    performScriptBeat(resetBeat, { moveNumber: 0, notation: 'Khai Cuộc Mới' });
    wuxiaAudio.playGuzhengSweep();
  }, [performScriptBeat, showAnalysis]);

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

      const script = buildLiveSessionBeat({
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
      const entry = createChallenger(username || '@KhachMoi', gender, age, char);
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
      const pickMode = mode === 'random' ? 'random' : 'fifo';
      const { picked, rest } = pickNextChallenger(queue, pickMode);
      if (!picked) return;
      setQueue(rest);
      setActiveChallenger(picked);
      activeChallengerRef.current = picked;
      stageRef.current?.setGuestCharacter(picked.character);
      appendMessage({
        username: BOT_MASTER_PROFILE.name,
        text: `Bot đã chọn ${picked.username} (${picked.character.title}) làm kỳ thủ tiếp theo! Mời xuất chiêu qua khung chat.`,
        kind: 'bot',
      });
      wuxiaAudio.playGuzhengSweep();
      if (appStateRef.current === 'playing' && !botThinkingRef.current) {
        const welcome = buildLiveSessionBeat({
          beat: 'challenger_welcome',
          challengerName: picked.username,
          guestTitle: picked.character.title,
          guestGender: picked.gender,
          guestAge: picked.age,
          winProbRed: analysisRef.current.winProbRed,
          moveCount: boardRef.current.moveCount,
          recentLines: recentLinesRef.current,
        });
        performScriptBeat(welcome, { notation: 'Mời Cao Thủ Lên Đài' });
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
      await fetch('/api/live/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uniqueId: activeChallengerRef.current.username.replace(/^@/, ''),
          comment: boardRef.current.moveCount === 0 ? 'p2 bình 5' : 'Chào Kỳ Ma từ TikTok Live Webhook!',
        }),
      });
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
                nextAnalysis: analysis,
                explicitRequest: true,
              });
            }
          }}
          aiLoading={aiLoading}
          audienceWaveOn={audienceWaveOn}
          onToggleAudienceWave={() => setAudienceWaveOn((w) => !w)}
          onSubmitChat={(username, text) => processIncomingChat(username, text)}
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
            onSubmitChat={(username, text) => processIncomingChat(username, text)}
            moveHintError={moveHintError}
            queue={queue}
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
            difficulty={difficulty}
            onSelectDifficulty={setDifficulty}
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
