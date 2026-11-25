import React, { useEffect, useRef, useState } from 'react';
import {
  Camera,
  Check,
  Coffee,
  Copy,
  Crown,
  Eye,
  Heart,
  Megaphone,
  MessageCircle,
  Mic,
  MicOff,
  Monitor,
  Pause,
  RefreshCw,
  Send,
  Share2,
  ShieldCheck,
  Sparkles,
  UserCheck,
  Volume2,
  VolumeX,
  Vote,
  X,
} from 'lucide-react';
import {
  BOT_MASTER_PROFILE,
  GuestGender,
  WuxiaCharacterProfile,
  matchGuestCharacter,
} from '../data/characters';
import { BotDifficulty, DeepAnalysisResult } from '../engine/ai';
import { CrowdVoteEntry, LiveControlMode } from '../engine/liveInteraction';
import { ChallengerEntry, CommentaryItem, LiveChatMessage } from '../engine/matchmaker';
import { BoardState, Side } from '../engine/xiangqi';
import { ZoomFocus } from '../scene/XiangqiStage';
import {
  PIECE_LABEL_MODES,
  PIECE_THEMES,
  PieceVisualConfig,
} from '../scene/pieceStyle';
import { BoardFocusSignal } from '../scene/portraitKinematics';
import {
  ActionCuePayload,
  CinemaCameraAngle,
  MoveChoreoPayload,
} from '../scene/cinemaDirector';
import { CommentaryVoiceName } from '../utils/wuxiaAudio';
import { CinematicPavilionPane } from './CinematicPavilionPane';

interface TikTokLiveStudioOverlayProps {
  board: BoardState;
  activeChallenger: ChallengerEntry;
  queue: ChallengerEntry[];
  turn: Side;
  moveCount: number;
  turnSecondsLeft: number;
  inCheck: Side | null;
  botThinking: boolean;
  viewerCount: number;
  analysis: DeepAnalysisResult;
  commentary: CommentaryItem | null;
  messages: LiveChatMessage[];
  moveHintError: string | null;
  boardFocus: BoardFocusSignal | null;
  moveEvent: MoveChoreoPayload | null;
  actionCue: ActionCuePayload | null;
  cinemaAngle: CinemaCameraAngle;
  onSelectCinemaAngle: (angle: CinemaCameraAngle) => void;
  onTriggerActionCue: (
    type: 'sip_tea' | 'tease' | 'think_fan' | 'audience_call',
    actor?: 'bride' | 'groom',
  ) => void;

  zoomFocus: ZoomFocus;
  onSelectZoomFocus: (focus: ZoomFocus) => void;
  showAnalysis: boolean;
  onToggleAnalysis: () => void;
  previewVariationIdx: number | null;
  onHoverVariation: (idx: number | null) => void;

  difficulty: BotDifficulty;
  onSelectDifficulty: (diff: BotDifficulty) => void;
  muted: boolean;
  onToggleMute: () => void;
  voiceEnabled: boolean;
  onToggleVoice: () => void;
  voiceName: CommentaryVoiceName;
  onSelectVoiceName: (v: CommentaryVoiceName) => void;
  speechRate: number;
  onSelectSpeechRate: (r: number) => void;
  speakingEngine: 'gemini' | 'browser' | null;
  onReplayVoice: () => void;
  onTestVoice: () => void;
  onRequestAiCommentary: () => void;
  aiLoading: boolean;

  audienceWaveOn: boolean;
  onToggleAudienceWave: () => void;
  autoCommentReply: boolean;
  onToggleAutoCommentReply: () => void;
  liveMode: LiveControlMode;
  onSelectLiveMode: (mode: LiveControlMode) => void;
  crowdTopVotes: CrowdVoteEntry[];
  crowdTotalVotes: number;
  onCommitCrowdVote: () => void;
  voiceListening: boolean;
  voiceInterimText: string;
  pendingVoiceMove: { notation: string; transcript: string } | null;
  onToggleVoiceListening: () => void;
  onConfirmPendingVoiceMove: () => void;
  onCancelPendingVoiceMove: () => void;
  awaitingReadyCheck: boolean;
  onSubmitChat: (username: string, text: string) => void;
  onApplyGuestQuickMatch: (
    username: string,
    gender: GuestGender,
    age: number,
    explicitChar?: WuxiaCharacterProfile,
  ) => void;
  onPickFromQueue: (mode: 'fifo' | 'random' | string) => void;
  onResetMatch: () => void;
  onTestWebhook: () => void;
  pieceStyle: PieceVisualConfig;
  onCyclePieceTheme: () => void;
  onCyclePieceLabelMode: () => void;
  onExitTikTokMode: () => void;
  onPause: () => void;
}

const QUICK_MOVES = [
  'p2 bình 5',
  'm8 tiến 7',
  'x9 bình 8',
  'b7 tiến 1',
  'tiến 4',
  'thoái 1',
];

const CINEMA_ANGLE_BUTTONS: Array<{ id: CinemaCameraAngle; label: string }> = [
  { id: 'auto', label: 'Đạo Diễn' },
  { id: 'wide_pavilion', label: 'Hồ Sen' },
  { id: 'medium_bride', label: 'Uống Trà' },
  { id: 'over_shoulder', label: 'Chọc Ghẹo' },
  { id: 'table_hands', label: 'Nhấc Quân' },
  { id: 'dramatic_orbit', label: 'Tân Lang' },
  { id: 'closeup_cgi', label: 'Cận Mặt' },
];

export const TikTokLiveStudioOverlay: React.FC<TikTokLiveStudioOverlayProps> = ({
  board,
  activeChallenger,
  queue,
  turn,
  moveCount,
  turnSecondsLeft,
  inCheck,
  botThinking,
  viewerCount,
  analysis,
  commentary,
  messages,
  moveHintError,
  boardFocus,
  moveEvent,
  actionCue,
  cinemaAngle,
  onSelectCinemaAngle,
  onTriggerActionCue,
  zoomFocus,
  onSelectZoomFocus,
  showAnalysis,
  onToggleAnalysis,
  previewVariationIdx,
  onHoverVariation,
  difficulty,
  onSelectDifficulty,
  muted,
  onToggleMute,
  voiceEnabled,
  onToggleVoice,
  voiceName,
  onSelectVoiceName,
  speechRate,
  onSelectSpeechRate,
  speakingEngine,
  onReplayVoice,
  onTestVoice,
  onRequestAiCommentary,
  aiLoading,
  audienceWaveOn,
  onToggleAudienceWave,
  autoCommentReply,
  onToggleAutoCommentReply,
  liveMode,
  onSelectLiveMode,
  crowdTopVotes,
  crowdTotalVotes,
  onCommitCrowdVote,
  voiceListening,
  voiceInterimText,
  pendingVoiceMove,
  onToggleVoiceListening,
  onConfirmPendingVoiceMove,
  onCancelPendingVoiceMove,
  awaitingReadyCheck,
  onSubmitChat,
  onApplyGuestQuickMatch,
  onPickFromQueue,
  onResetMatch,
  onTestWebhook,
  pieceStyle,
  onCyclePieceTheme,
  onCyclePieceLabelMode,
  onExitTikTokMode,
  onPause,
}) => {
  const [showSafeZones, setShowSafeZones] = useState(true);
  const [obsCleanMode, setObsCleanMode] = useState(false);
  const [chatUser, setChatUser] = useState(activeChallenger.username);
  const [chatText, setChatText] = useState('');
  const [guestGender, setGuestGender] = useState<GuestGender>(activeChallenger.gender);
  const [guestAge, setGuestAge] = useState<number>(activeChallenger.age);
  const [guestName, setGuestName] = useState<string>(activeChallenger.username);
  const [copiedWebhook, setCopiedWebhook] = useState(false);

  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setChatUser(activeChallenger.username);
    setGuestName(activeChallenger.username);
    setGuestGender(activeChallenger.gender);
    setGuestAge(activeChallenger.age);
  }, [activeChallenger.id, activeChallenger.username, activeChallenger.gender, activeChallenger.age]);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  const matchedChar = matchGuestCharacter(guestGender, guestAge);
  const scoreFormatted =
    analysis.score === 0
      ? '0.0'
      : `${analysis.score > 0 ? '+' : ''}${(analysis.score / 100).toFixed(1)}`;
  const isSpeaking = speakingEngine !== null;
  const webhookUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/api/live/webhook`
      : '/api/live/webhook';

  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = chatText.trim();
    if (!trimmed) return;
    onSubmitChat(chatUser.trim() || activeChallenger.username, trimmed);
    setChatText('');
  };

  const handleCopyWebhook = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(webhookUrl).catch(() => {});
      setCopiedWebhook(true);
      setTimeout(() => setCopiedWebhook(false), 1800);
    }
  };

  return (
    <div className="fixed inset-0 z-20 pointer-events-none">
      {/* ================================================================
          CENTER: PURE 9:16 TIKTOK LIVE VERTICAL BROADCAST STAGE
          (Matches XiangqiStage's centered 9:16 WebGL viewport 1:1!)
      ================================================================ */}
      <div
        data-testid="tiktok-916-stage"
        className="fixed top-0 bottom-0 left-1/2 -translate-x-1/2 border-x border-[#d4a44e]/45 pointer-events-none overflow-hidden"
        style={{ width: 'min(100vw, calc(100vh * 9 / 16))' }}
      >
        {/* 0. TOP 42%: 3D MOONLIT LOTUS-LAKE ANCIENT PAVILION MOVIE STAGE (Full-Body + Multi-Camera) */}
        <div
          className="absolute top-0 left-0 right-0 z-0 overflow-hidden"
          style={{ height: '42%' }}
        >
          <CinematicPavilionPane
            board={board}
            guestProfile={activeChallenger.character}
            guestName={activeChallenger.character.name}
            zoomFocus={zoomFocus}
            mood={commentary?.mood ?? 'calm'}
            emotion={commentary?.emotion}
            emotionLabel={commentary?.emotionLabel}
            isSpeaking={isSpeaking}
            inCheck={inCheck !== null}
            botThinking={botThinking}
            boardFocus={boardFocus}
            moveEvent={moveEvent}
            actionCue={actionCue}
            cinemaAngle={cinemaAngle}
            onSelectCinemaAngle={onSelectCinemaAngle}
            onTriggerActionCue={onTriggerActionCue}
            onSelectZoomFocus={onSelectZoomFocus}
            variant="tiktok"
            hideControls
          />
        </div>

        {/* 1. Minimal Unobtrusive Top Corner LIVE + Viewer/Timer Badges (Crown & Face 100% Clear!) */}
        <div className="absolute top-2.5 left-2.5 right-2.5 z-20 flex items-center justify-between gap-2 pointer-events-auto">
          <div className="flex items-center gap-1.5">
            <span className="px-2 py-0.5 rounded bg-[#b82820] text-[#fff3de] text-[10px] font-bold tracking-wider shadow">
              LIVE
            </span>
            <span
              className="px-2 py-0.5 rounded border border-[#d4a44e]/35 text-[10px] font-medium"
              style={{
                backgroundColor: inCheck
                  ? 'rgba(110, 22, 20, 0.90)'
                  : 'rgba(13, 10, 16, 0.78)',
                color: inCheck
                  ? '#ffd4cb'
                  : turn === 'red'
                    ? '#f5a59a'
                    : '#8de3d6',
              }}
            >
              {inCheck
                ? 'CHIẾU TƯỚNG!'
                : botThinking
                  ? 'Kỳ Ma suy tính...'
                  : liveMode === 'crowd_vote'
                    ? `Vote Cờ · ${crowdTotalVotes} phiếu`
                    : awaitingReadyCheck
                      ? 'Chờ khách điểm danh'
                      : turn === 'red'
                        ? `Hiệp ${Math.floor(moveCount / 2) + 1} · Mời đi cờ`
                        : `Hiệp ${Math.floor(moveCount / 2) + 1} · Kỳ Ma đánh`}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <div
              className="flex items-center gap-1.5 px-2 py-0.5 rounded border border-[#d4a44e]/30 text-[10px] font-mono-num"
              style={{ backgroundColor: 'rgba(13, 10, 16, 0.78)' }}
            >
              <Eye className="w-3 h-3 text-[#d9b673]" />
              <span className="text-[#e8decb]">{viewerCount.toLocaleString('vi-VN')}</span>
              <span aria-hidden="true" className="text-[#695c4d]">
                ·
              </span>
              <span
                className={
                  turnSecondsLeft <= 10 && turn === 'red'
                    ? 'text-[#ff6a57] font-bold'
                    : 'text-[#e8c67e] font-semibold'
                }
              >
                {turnSecondsLeft}s
              </span>
            </div>

            {/* Mobile/Narrow Quick Exit Button (visible below lg where side wings hide) */}
            <button
              type="button"
              onClick={onExitTikTokMode}
              title="Thoát khung 9:16"
              className="lg:hidden px-2 py-0.5 rounded border border-[#d4a44e]/40 text-[10px] font-semibold text-[#f7e7c5] cursor-pointer shrink-0"
              style={{ backgroundColor: 'rgba(143, 38, 31, 0.92)' }}
            >
              16:9
            </button>
          </div>
        </div>

        {/* 2. Mid Seam Broadcast Bar at EXACT 42%: Matchup, Nội Lực Gauge & Kỳ Ma/Khách Toggle */}
        <div
          className="absolute left-0 right-0 z-20 -translate-y-1/2 px-2 py-1 border-y border-[#d4a44e]/50 flex items-center justify-between gap-2 pointer-events-auto"
          style={{ top: '42%', backgroundColor: 'rgba(13, 10, 16, 0.94)' }}
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-[10px] leading-tight whitespace-nowrap overflow-hidden">
              <span className="font-semibold text-[#f38072] truncate">
                {activeChallenger.username}
              </span>
              <span className="text-[#d4a44e] font-bold">VS</span>
              <span className="font-semibold text-[#ebd093] truncate">
                {BOT_MASTER_PROFILE.name}
              </span>
              <span className="font-mono-num text-[#d9b673] ml-auto shrink-0">
                {scoreFormatted}
              </span>
            </div>
            <div className="mt-1 h-1 bg-[#29222c] rounded-sm overflow-hidden flex">
              <div
                className="h-full bg-[#c93b2f] transition-all duration-300"
                style={{ width: `${analysis.winProbRed}%` }}
              />
              <div
                className="h-full bg-[#4ca69a] transition-all duration-300"
                style={{ width: `${100 - analysis.winProbRed}%` }}
              />
            </div>
          </div>

          {!obsCleanMode && (
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                title="Đổi màu quân cờ siêu nét cho điện thoại"
                onClick={onCyclePieceTheme}
                className="px-1.5 py-0.5 rounded bg-[#271822] hover:bg-[#3a2232] text-[#fce7be] border border-[#e5b864]/45 text-[9px] font-semibold cursor-pointer whitespace-nowrap"
              >
                {PIECE_THEMES[pieceStyle.theme]?.shortLabel ?? 'Ngà Đỏ'}
              </button>
              <button
                type="button"
                title="Đổi kiểu chữ quân cờ (Hán / H+V / Việt)"
                onClick={onCyclePieceLabelMode}
                className="px-1.5 py-0.5 rounded bg-[#182927] hover:bg-[#233d3a] text-[#b9f4e9] border border-[#72c4b4]/45 text-[9px] font-semibold cursor-pointer whitespace-nowrap"
              >
                {PIECE_LABEL_MODES.find((m) => m.id === pieceStyle.labelMode)?.shortLabel ?? 'Hán'}
              </button>
              <button
                type="button"
                data-cinema-cue="sip_tea"
                title="Uống trà ngắm trăng"
                onClick={() => onTriggerActionCue('sip_tea', 'bride')}
                className="px-1.5 py-0.5 rounded bg-[#1b2c2a] hover:bg-[#263f3c] text-[#bcebe0] border border-[#72c4b4]/35 text-[9px] font-medium flex items-center gap-0.5 cursor-pointer"
              >
                <Coffee className="w-2.5 h-2.5" />
                <span>Trà</span>
              </button>
              <button
                type="button"
                data-cinema-cue="tease"
                title="Chọc ghẹo đối phương"
                onClick={() => onTriggerActionCue('tease', 'bride')}
                className="px-1.5 py-0.5 rounded bg-[#3e1724] hover:bg-[#542031] text-[#ffd4d8] border border-[#e88a96]/40 text-[9px] font-medium flex items-center gap-0.5 cursor-pointer"
              >
                <Sparkles className="w-2.5 h-2.5" />
                <span>Ghẹo</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  onSelectCinemaAngle(
                    cinemaAngle === 'closeup_cgi' ? 'auto' : 'closeup_cgi',
                  )
                }
                title="Chuyển nhanh Chòi Hồ Sen CGI / Cận Mặt Live2D"
                className="px-1.5 py-0.5 rounded border border-[#d4a44e]/45 bg-[#231926] hover:bg-[#8f261f] text-[#f5dfb2] text-[9px] font-medium flex items-center gap-0.5 cursor-pointer"
              >
                <Camera className="w-2.5 h-2.5" />
                <span>{cinemaAngle === 'closeup_cgi' ? 'Hồ Sen' : 'Cận Mặt'}</span>
              </button>
            </div>
          )}
        </div>

        {/* 3. Lower TikTok Broadcast Zone: Optional Crowd Vote Bar + 2 Compact Chat Lines + Commentary */}
        <div className="absolute bottom-2.5 left-2.5 right-14 z-20 flex flex-col gap-1 pointer-events-none">
          {liveMode === 'crowd_vote' && crowdTopVotes.length > 0 && (
            <div
              className="px-2 py-1 rounded border border-[#78d9ca]/45 text-[10px] flex items-center gap-2 overflow-hidden"
              style={{ backgroundColor: 'rgba(13, 30, 29, 0.88)' }}
            >
              <span className="text-[#8be8d9] font-semibold shrink-0">Vote ({crowdTotalVotes}):</span>
              <div className="flex items-center gap-2 truncate font-mono-num">
                {crowdTopVotes.slice(0, 3).map((v, i) => (
                  <span
                    key={v.notation}
                    className={i === 0 ? 'text-[#fde4a8] font-bold' : 'text-[#cce6e1]'}
                  >
                    {v.notation} {v.percent}%
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-0.5">
            {messages.slice(-2).map((m) => (
              <div
                key={m.id}
                className="self-start max-w-full px-2 py-0.5 rounded text-[10px] leading-snug truncate"
                style={{ backgroundColor: 'rgba(12, 9, 15, 0.74)' }}
              >
                <span
                  className={`font-semibold mr-1 ${
                    m.kind === 'bot'
                      ? 'text-[#e5b864]'
                      : m.kind === 'move' || m.kind === 'challenger'
                        ? 'text-[#f38072]'
                        : 'text-[#8ad9cc]'
                  }`}
                >
                  {m.username}:
                </span>
                <span className="text-[#f2e8d7]">{m.text}</span>
              </div>
            ))}
          </div>

          {/* Compact Wuxia Commentary Subtitle Box */}
          {commentary && (
            <div
              className="pointer-events-auto px-2.5 py-1.5 rounded border shadow-lg"
              style={{
                backgroundColor:
                  commentary.mood === 'check'
                    ? 'rgba(58, 14, 16, 0.92)'
                    : 'rgba(13, 10, 16, 0.90)',
                borderColor:
                  commentary.mood === 'check'
                    ? 'rgba(242, 92, 74, 0.65)'
                    : 'rgba(212, 164, 78, 0.35)',
              }}
            >
              <div className="flex items-center justify-between gap-2 text-[10px] text-[#d6b779] mb-0.5">
                <span className="truncate font-semibold">
                  {[
                    commentary.phaseLabel,
                    commentary.emotionLabel,
                    commentary.motif,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
                <button
                  type="button"
                  onClick={onReplayVoice}
                  className={`px-1.5 py-0.5 rounded text-[9px] font-medium flex items-center gap-1 shrink-0 cursor-pointer border ${
                    isSpeaking
                      ? 'bg-[#8f261f] text-[#fff0d0] border-[#e5b864]/70'
                      : 'bg-[#211a24] text-[#ecd299] border-[#d4a44e]/35'
                  }`}
                >
                  {muted || !voiceEnabled ? (
                    <VolumeX className="w-2.5 h-2.5" />
                  ) : (
                    <Volume2 className="w-2.5 h-2.5" />
                  )}
                  <span>{isSpeaking ? 'Đang đọc AI' : 'Nghe AI'}</span>
                </button>
              </div>
              <p className="text-[11px] text-[#f5ebda] leading-snug line-clamp-2">
                {commentary.line}
              </p>
            </div>
          )}
        </div>

        {/* 4. Optional TikTok Native Safe-Zone Guide (Right Action Rail Silhouette) */}
        {showSafeZones && !obsCleanMode && (
          <div
            aria-hidden="true"
            className="absolute right-1.5 bottom-6 z-10 flex flex-col items-center gap-3 px-1.5 py-2 rounded border border-dashed border-[#e5b864]/35 text-[#cbb99b]/60"
            style={{ backgroundColor: 'rgba(10, 8, 13, 0.35)' }}
          >
            <div className="flex flex-col items-center gap-0.5">
              <Heart className="w-4 h-4" />
              <span className="text-[8px] font-mono-num">12.4K</span>
            </div>
            <div className="flex flex-col items-center gap-0.5">
              <MessageCircle className="w-4 h-4" />
              <span className="text-[8px] font-mono-num">Chat</span>
            </div>
            <div className="flex flex-col items-center gap-0.5">
              <Share2 className="w-4 h-4" />
              <span className="text-[8px] font-mono-num">Chia sẻ</span>
            </div>
            <span className="text-[8px] uppercase tracking-wider text-[#d4a44e]/75 mt-1 [writing-mode:vertical-rl]">
              Vùng nút TikTok
            </span>
          </div>
        )}
      </div>

      {/* ================================================================
          LEFT DESKTOP STUDIO WING (Outside 9:16 Capture Area!)
          Chat Input, Quick Moves & Fast Guest Character Matcher
      ================================================================ */}
      {!obsCleanMode && (
        <aside
          aria-label="Bảng chat và khách mời Studio"
          className="hidden lg:flex fixed top-3 bottom-3 left-3 z-20 flex-col gap-3 pointer-events-auto"
          style={{ width: 'max(250px, calc((100vw - (100vh * 9 / 16)) / 2 - 26px))' }}
        >
          {/* Card 1: TikTok Live Chat & Move Dispatch */}
          <div
            className="flex-1 min-h-0 flex flex-col rounded border border-[#d4a44e]/30 p-3 shadow-xl"
            style={{ backgroundColor: 'rgba(14, 11, 16, 0.92)' }}
          >
            <div className="flex items-center justify-between gap-1.5 pb-2 border-b border-[#d4a44e]/20">
              <h2 className="text-xs font-semibold text-[#f2d699] truncate">
                Khung Chat TikTok Live
              </h2>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={onToggleAutoCommentReply}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-medium cursor-pointer ${
                    autoCommentReply
                      ? 'bg-[#3b2514] text-[#fde4b4]'
                      : 'bg-[#231d26] text-[#9b8d7a]'
                  }`}
                >
                  Đọc Cmt
                </button>
                <button
                  type="button"
                  onClick={onToggleAudienceWave}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-medium cursor-pointer transition-colors ${
                    audienceWaveOn
                      ? 'bg-[#2a5450] text-[#d9f7f2]'
                      : 'bg-[#231d26] text-[#b8aa95]'
                  }`}
                >
                  {audienceWaveOn ? 'Fan: Bật' : 'Fan: Tắt'}
                </button>
              </div>
            </div>

            {/* Live Mode Switcher (1v1 Challenger vs Crowd Vote) + Voice Pending Confirm */}
            <div className="pt-1.5 flex items-center justify-between gap-1">
              <button
                type="button"
                onClick={() =>
                  onSelectLiveMode(liveMode === 'duel_1v1' ? 'crowd_vote' : 'duel_1v1')
                }
                className={`flex-1 py-1 px-2 rounded text-[10px] font-semibold border cursor-pointer flex items-center justify-center gap-1 ${
                  liveMode === 'crowd_vote'
                    ? 'bg-[#2a5450] text-[#e7fbf7] border-[#78d9ca]/60'
                    : 'bg-[#211a24] text-[#f3dfb6] border-[#d4a44e]/30'
                }`}
              >
                <Vote className="w-3 h-3" />
                {liveMode === 'crowd_vote' ? 'Cả Phòng Vote' : '1v1 Người Chọn'}
              </button>
              <button
                type="button"
                onClick={onToggleVoiceListening}
                className={`py-1 px-2 rounded text-[10px] font-semibold border cursor-pointer flex items-center gap-1 ${
                  voiceListening
                    ? 'bg-[#2a5450] text-[#e7fbf7] border-[#78d9ca]/70'
                    : 'bg-[#211a24] text-[#e6cfa3] border-[#d4a44e]/30'
                }`}
              >
                {voiceListening ? <Mic className="w-3 h-3 text-[#7ef2df]" /> : <MicOff className="w-3 h-3" />}
                {voiceListening ? 'Đang Nghe' : 'Mic Cờ'}
              </button>
              {liveMode === 'crowd_vote' && (
                <button
                  type="button"
                  onClick={onCommitCrowdVote}
                  className="py-1 px-2 rounded bg-[#8f261f] text-[#fdf4e3] text-[10px] font-semibold cursor-pointer"
                >
                  Chốt
                </button>
              )}
            </div>

            {pendingVoiceMove && (
              <div className="mt-1.5 px-2 py-1 rounded bg-[#2d1a1e] border border-[#e5b864]/65 text-[10px] flex items-center justify-between gap-1">
                <span className="text-[#fce8be] truncate font-mono-num">
                  Mic: {pendingVoiceMove.notation}
                </span>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={onConfirmPendingVoiceMove}
                    className="px-1.5 py-0.5 rounded bg-[#2a5450] text-[#e7fbf7] cursor-pointer"
                  >
                    <Check className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={onCancelPendingVoiceMove}
                    className="px-1.5 py-0.5 rounded bg-[#4a1e24] text-[#ffd4cc] cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </div>
            )}

            <div
              ref={chatScrollRef}
              className="flex-1 min-h-0 overflow-y-auto wuxia-scroll py-2 space-y-1.5 text-xs pr-1"
            >
              {messages.slice(-28).map((m) => (
                <div key={m.id} className="leading-snug">
                  <span
                    className={`font-semibold mr-1.5 ${
                      m.kind === 'bot'
                        ? 'text-[#e5b864]'
                        : m.kind === 'move' || m.kind === 'challenger'
                          ? 'text-[#f38072]'
                          : m.kind === 'system'
                            ? 'text-[#7ad6c6]'
                            : 'text-[#b5a793]'
                    }`}
                  >
                    {m.username}:
                  </span>
                  <span
                    className={
                      m.kind === 'move'
                        ? 'font-mono-num font-semibold text-[#fce5b1]'
                        : 'text-[#e8decb]'
                    }
                  >
                    {m.text}
                  </span>
                </div>
              ))}
            </div>

            {/* Quick Moves Grid */}
            <div className="pt-2 border-t border-[#d4a44e]/15">
              <div className="text-[10px] text-[#a79882] mb-1.5">
                Lệnh đi cờ nhanh (Hồng phương)
              </div>
              <div className="grid grid-cols-3 gap-1 mb-2">
                {QUICK_MOVES.map((cmd) => (
                  <button
                    key={cmd}
                    type="button"
                    onClick={() => onSubmitChat(activeChallenger.username, cmd)}
                    className="px-2 py-1 rounded bg-[#211b24] hover:bg-[#332838] text-[#efd8a8] font-mono-num text-[11px] text-center border border-[#d4a44e]/20 cursor-pointer transition-colors"
                  >
                    {cmd}
                  </button>
                ))}
              </div>

              <form onSubmit={handleChatSubmit} className="flex flex-col gap-1.5">
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    aria-label="Tên người chat Studio"
                    value={chatUser}
                    onChange={(e) => setChatUser(e.target.value)}
                    placeholder="@NguoiChoi"
                    className="w-24 px-2 py-1.5 rounded bg-[#1d1720] border border-[#d4a44e]/25 text-xs text-[#f2cb7e] focus:outline-none focus:border-[#e5b864]"
                  />
                  <input
                    type="text"
                    aria-label="Nhập nước đi qua chat Studio"
                    value={chatText}
                    onChange={(e) => setChatText(e.target.value)}
                    placeholder={
                      voiceListening && voiceInterimText
                        ? `Nghe: "${voiceInterimText}"`
                        : 'vd: p25, m87, pháo 2 vô 5...'
                    }
                    className="flex-1 min-w-0 px-2 py-1.5 rounded bg-[#1d1720] border border-[#d4a44e]/30 text-xs text-[#f6ebd7] focus:outline-none focus:border-[#e5b864]"
                  />
                  <button
                    type="submit"
                    aria-label="Gửi lệnh chat"
                    className="px-2.5 py-1.5 rounded bg-[#a92620] hover:bg-[#c23029] text-[#fdf4e3] text-xs font-semibold cursor-pointer shrink-0"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </div>
                {moveHintError && (
                  <div className="text-[11px] text-[#ff8778] truncate">{moveHintError}</div>
                )}
              </form>
            </div>
          </div>

          {/* Card 2: Fast Guest Character Matcher (Nam / Nữ + Tuổi) */}
          <div
            className="rounded border border-[#d4a44e]/30 p-3 shadow-xl flex flex-col gap-2"
            style={{ backgroundColor: 'rgba(14, 11, 16, 0.92)' }}
          >
            <div className="flex items-center justify-between gap-1">
              <h2 className="text-xs font-semibold text-[#f2d699] truncate">
                Khách Mời Nhanh ({queue.length})
              </h2>
              {queue.length > 0 && (
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => onPickFromQueue('fifo')}
                    className="px-2 py-0.5 rounded bg-[#254542] hover:bg-[#305955] text-[#d6f5f0] text-[10px] font-medium cursor-pointer flex items-center gap-0.5"
                  >
                    {queue[0]?.isVip && <Crown className="w-2.5 h-2.5 text-[#f4c668]" />}
                    Mời Kế
                  </button>
                  <button
                    type="button"
                    onClick={() => onPickFromQueue('random')}
                    className="px-1.5 py-0.5 rounded bg-[#2b2130] text-[#f3dfb6] text-[10px] font-medium cursor-pointer"
                  >
                    Quay
                  </button>
                </div>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              <div className="flex rounded bg-[#1d1720] border border-[#d4a44e]/25 p-0.5 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setGuestGender('nam');
                    onApplyGuestQuickMatch(
                      guestName,
                      'nam',
                      guestAge,
                      matchGuestCharacter('nam', guestAge),
                    );
                  }}
                  className={`px-2.5 py-1 rounded text-[11px] font-medium cursor-pointer ${
                    guestGender === 'nam'
                      ? 'bg-[#8f261f] text-[#fdf4e3]'
                      : 'text-[#b7a994]'
                  }`}
                >
                  Nam
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setGuestGender('nu');
                    onApplyGuestQuickMatch(
                      guestName,
                      'nu',
                      guestAge,
                      matchGuestCharacter('nu', guestAge),
                    );
                  }}
                  className={`px-2.5 py-1 rounded text-[11px] font-medium cursor-pointer ${
                    guestGender === 'nu'
                      ? 'bg-[#8f261f] text-[#fdf4e3]'
                      : 'text-[#b7a994]'
                  }`}
                >
                  Nữ
                </button>
              </div>

              <input
                type="number"
                aria-label="Tuổi khách mời Studio"
                min={12}
                max={90}
                value={guestAge}
                onChange={(e) => {
                  const val = Math.max(12, Math.min(90, Number(e.target.value) || 20));
                  setGuestAge(val);
                  onApplyGuestQuickMatch(
                    guestName,
                    guestGender,
                    val,
                    matchGuestCharacter(guestGender, val),
                  );
                }}
                className="w-14 px-2 py-1 rounded bg-[#1d1720] border border-[#d4a44e]/30 font-mono-num text-xs text-[#f6ebd7]"
              />

              <input
                type="text"
                aria-label="Tên khách mời Studio"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                className="flex-1 min-w-0 px-2 py-1 rounded bg-[#1d1720] border border-[#d4a44e]/25 text-xs text-[#f6ebd7]"
              />
            </div>

            <div className="flex items-center justify-between gap-2 pt-0.5 text-[11px]">
              <div className="min-w-0">
                <div className="font-semibold text-[#f5e7cb] truncate">
                  {matchedChar.name} · {matchedChar.title}
                </div>
                <div className="text-[10px] text-[#a59782] truncate">
                  {matchedChar.sect} · {matchedChar.ageLabel}
                </div>
              </div>
              <button
                type="button"
                onClick={() =>
                  onApplyGuestQuickMatch(guestName, guestGender, guestAge, matchedChar)
                }
                className="px-2.5 py-1 rounded bg-[#a92620] hover:bg-[#c23029] text-[#fdf4e3] text-[11px] font-semibold flex items-center gap-1 shrink-0 cursor-pointer"
              >
                <UserCheck className="w-3 h-3" />
                Lên Đài
              </button>
            </div>
          </div>
        </aside>
      )}

      {/* ================================================================
          RIGHT DESKTOP STUDIO WING (Outside 9:16 Capture Area!)
          Broadcast Controls, AI Voice, Analysis & Webhook
      ================================================================ */}
      {!obsCleanMode ? (
        <aside
          aria-label="Bảng điều khiển phát sóng TikTok Studio"
          className="hidden lg:flex fixed top-3 bottom-3 right-3 z-20 flex-col gap-3 pointer-events-auto overflow-y-auto wuxia-scroll"
          style={{ width: 'max(250px, calc((100vw - (100vh * 9 / 16)) / 2 - 26px))' }}
        >
          {/* Card 1: TikTok Studio Frame & OBS Controls */}
          <div
            className="rounded border border-[#d4a44e]/35 p-3 shadow-xl flex flex-col gap-2"
            style={{ backgroundColor: 'rgba(14, 11, 16, 0.92)' }}
          >
            <div className="flex items-center justify-between gap-2 pb-2 border-b border-[#d4a44e]/20">
              <div>
                <h2 className="text-xs font-semibold text-[#f2d699]">
                  Phòng Phát Live TikTok 9:16
                </h2>
                <p className="text-[10px] text-[#a59782]">
                  Khung dọc chuẩn OBS / TikTok Live Studio
                </p>
              </div>
              <button
                type="button"
                onClick={onPause}
                aria-label="Tạm dừng"
                className="w-7 h-7 rounded bg-[#211a24] border border-[#d4a44e]/25 flex items-center justify-center text-[#d8c7ab] hover:text-[#fff] cursor-pointer"
              >
                <Pause className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={onExitTikTokMode}
                className="py-1.5 px-2.5 rounded bg-[#2a5450] hover:bg-[#346964] text-[#e7fbf7] text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Monitor className="w-3.5 h-3.5" />
                Về 16:9 Ngang
              </button>
              <button
                type="button"
                onClick={() => setObsCleanMode(true)}
                className="py-1.5 px-2.5 rounded bg-[#8f261f] hover:bg-[#a92e26] text-[#fdf4e3] text-xs font-semibold cursor-pointer"
              >
                Chế Độ Sạch OBS
              </button>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => setShowSafeZones((s) => !s)}
                aria-pressed={showSafeZones}
                className={`py-1.5 px-2 rounded text-[11px] font-medium border flex items-center justify-center gap-1 cursor-pointer ${
                  showSafeZones
                    ? 'bg-[#2e241b] text-[#f5d896] border-[#d4a44e]/55'
                    : 'bg-[#1a151e] text-[#b9ab96] border-[#d4a44e]/20'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                Vùng An Toàn
              </button>
              <button
                type="button"
                onClick={onToggleAnalysis}
                aria-pressed={showAnalysis}
                className={`py-1.5 px-2 rounded text-[11px] font-medium border flex items-center justify-center gap-1 cursor-pointer ${
                  showAnalysis
                    ? 'bg-[#2e241b] text-[#f5d896] border-[#d4a44e]/55'
                    : 'bg-[#1a151e] text-[#b9ab96] border-[#d4a44e]/20'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                Kiếm Ý 3D
              </button>
            </div>
          </div>

          {/* Card 1.5: Film Camera Director & Full-Body Gestures (Outside 9:16 Capture!) */}
          <div
            className="rounded border border-[#d4a44e]/35 p-3 shadow-xl flex flex-col gap-2"
            style={{ backgroundColor: 'rgba(14, 11, 16, 0.92)' }}
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xs font-semibold text-[#f2d699] flex items-center gap-1.5">
                <Camera className="w-3.5 h-3.5 text-[#e5b864]" />
                <span>Đạo Diễn Góc Máy & Cử Chỉ</span>
              </h2>
            </div>

            <div className="grid grid-cols-4 gap-1">
              {CINEMA_ANGLE_BUTTONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  data-cinema-angle={opt.id}
                  onClick={() => onSelectCinemaAngle(opt.id)}
                  className={`py-1 px-1 rounded text-[10px] font-medium border cursor-pointer transition-colors truncate ${
                    cinemaAngle === opt.id
                      ? 'bg-[#8f261f] text-[#fdf4e3] border-[#e5b864]/65'
                      : 'bg-[#1a151e] text-[#b9ab96] border-[#d4a44e]/20 hover:text-[#f5e7cb]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                data-cinema-cue="sip_tea"
                onClick={() => onTriggerActionCue('sip_tea', 'bride')}
                className="py-1.5 px-2 rounded bg-[#1c2d2b] hover:bg-[#26403d] text-[#c2f0e6] border border-[#72c4b4]/35 text-[10px] font-medium flex items-center justify-center gap-1 cursor-pointer"
              >
                <Coffee className="w-3 h-3" />
                <span>Uống Trà</span>
              </button>
              <button
                type="button"
                data-cinema-cue="tease"
                onClick={() => onTriggerActionCue('tease', 'bride')}
                className="py-1.5 px-2 rounded bg-[#421825] hover:bg-[#592032] text-[#ffd6da] border border-[#e88a96]/40 text-[10px] font-medium flex items-center justify-center gap-1 cursor-pointer"
              >
                <Sparkles className="w-3 h-3" />
                <span>Chọc Ghẹo</span>
              </button>
              <button
                type="button"
                data-cinema-cue="think_fan"
                onClick={() => onTriggerActionCue('think_fan', 'bride')}
                className="py-1.5 px-2 rounded bg-[#281e2c] hover:bg-[#38293e] text-[#f3dfb8] border border-[#d4a44e]/35 text-[10px] font-medium cursor-pointer"
              >
                Phẩy Quạt
              </button>
              <button
                type="button"
                data-cinema-cue="audience_call"
                onClick={() => onTriggerActionCue('audience_call', 'bride')}
                className="py-1.5 px-2 rounded bg-[#3b2514] hover:bg-[#52331b] text-[#fde4b4] border border-[#e5b864]/45 text-[10px] font-medium flex items-center justify-center gap-1 cursor-pointer"
              >
                <Megaphone className="w-3 h-3" />
                <span>Gọi Kèo</span>
              </button>
            </div>
          </div>

          {/* Card 2: AI Commentary Voice & Bot Strength */}
          <div
            className="rounded border border-[#d4a44e]/30 p-3 shadow-xl flex flex-col gap-2"
            style={{ backgroundColor: 'rgba(14, 11, 16, 0.92)' }}
          >
            <div className="flex items-center justify-between gap-1.5">
              <h2 className="text-xs font-semibold text-[#f2d699] truncate">
                Giọng Bình Luận AI
              </h2>
              <div className="flex items-center gap-1 shrink-0">
                {[0.9, 1.0, 1.15].map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => onSelectSpeechRate(r)}
                    className={`px-1.5 py-0.5 rounded font-mono-num text-[10px] border cursor-pointer ${
                      speechRate === r
                        ? 'bg-[#8f261f] text-[#fdf4e3] border-[#e5b864]/65'
                        : 'bg-[#1a151e] text-[#b9ab96] border-[#d4a44e]/20'
                    }`}
                  >
                    {r.toFixed(2).replace(/0$/, '')}x
                  </button>
                ))}
                <button
                  type="button"
                  onClick={onTestVoice}
                  className="px-2 py-0.5 rounded bg-[#2a5450] hover:bg-[#356a65] text-[#e7fbf7] text-[10px] font-medium cursor-pointer"
                >
                  Thử
                </button>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-1">
              {(
                [
                  { id: 'Kore', label: 'Mỹ Nhân' },
                  { id: 'Puck', label: 'Hoạt Bát' },
                  { id: 'Charon', label: 'Trầm' },
                  { id: 'Fenrir', label: 'Hào' },
                ] as const
              ).map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => onSelectVoiceName(v.id)}
                  className={`py-1 rounded text-[10px] font-medium border cursor-pointer ${
                    voiceName === v.id
                      ? 'bg-[#8f261f] text-[#fdf4e3] border-[#e5b864]/65'
                      : 'bg-[#1a151e] text-[#b9ab96] border-[#d4a44e]/20'
                  }`}
                >
                  {v.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-1">
              {(
                [
                  { id: 'nhap_mon', label: 'Nhập Môn' },
                  { id: 'cao_thu', label: 'Cao Thủ' },
                  { id: 'tong_su', label: 'Tông Sư' },
                ] as const
              ).map((lvl) => (
                <button
                  key={lvl.id}
                  type="button"
                  onClick={() => onSelectDifficulty(lvl.id)}
                  className={`py-1 rounded text-[10px] font-medium border cursor-pointer ${
                    difficulty === lvl.id
                      ? 'bg-[#2a5450] text-[#e7fbf7] border-[#78d9ca]/55'
                      : 'bg-[#1a151e] text-[#b9ab96] border-[#d4a44e]/20'
                  }`}
                >
                  {lvl.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={onToggleVoice}
                className={`flex-1 py-1.5 px-2 rounded text-[11px] font-medium border cursor-pointer ${
                  voiceEnabled && !muted
                    ? 'bg-[#2e241b] text-[#f5d896] border-[#d4a44e]/55'
                    : 'bg-[#1a151e] text-[#a99b87] border-[#d4a44e]/20'
                }`}
              >
                Giọng AI: {voiceEnabled && !muted ? 'Bật' : 'Tắt'}
              </button>
              <button
                type="button"
                onClick={onToggleMute}
                aria-label={muted ? 'Bật âm thanh' : 'Tắt âm thanh'}
                className="w-8 h-8 rounded bg-[#1a151e] border border-[#d4a44e]/25 flex items-center justify-center text-[#d8c7ab] cursor-pointer"
              >
                {muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
              </button>
              <button
                type="button"
                onClick={onResetMatch}
                className="py-1.5 px-2.5 rounded bg-[#231c26] hover:bg-[#342a38] text-[#efe0c4] text-[11px] font-medium border border-[#d4a44e]/25 flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
                Ván Mới
              </button>
            </div>
          </div>

          {/* Card 3: Deep Wuxia Variations + AI Commentator */}
          <div
            className="flex-1 min-h-0 rounded border border-[#d4a44e]/30 p-3 shadow-xl flex flex-col justify-between gap-2"
            style={{ backgroundColor: 'rgba(14, 11, 16, 0.92)' }}
          >
            <div className="flex flex-col gap-1.5 min-h-0">
              <h2 className="text-xs font-semibold text-[#f2d699]">
                Biến Hóa Kiếm Trận (Rê chuột xem tia 3D)
              </h2>
              <div className="space-y-1 overflow-y-auto wuxia-scroll">
                {analysis.variations.slice(0, 3).map((v, idx) => (
                  <button
                    key={`${v.notation}_${idx}`}
                    type="button"
                    onMouseEnter={() => onHoverVariation(idx)}
                    onMouseLeave={() => onHoverVariation(null)}
                    onClick={() =>
                      onHoverVariation(previewVariationIdx === idx ? null : idx)
                    }
                    className={`w-full px-2.5 py-1.5 rounded border text-left flex items-center justify-between text-[11px] cursor-pointer ${
                      previewVariationIdx === idx
                        ? 'bg-[#34211e] border-[#e5b864] text-[#fff0d0]'
                        : 'bg-[#1a151e] border-[#d4a44e]/20 text-[#e4d6be]'
                    }`}
                  >
                    <span className="font-mono-num font-semibold truncate">
                      {idx + 1}. {v.notation}
                      {v.replyNotation ? ` → ${v.replyNotation}` : ''}
                    </span>
                    <span className="font-mono-num text-[#d9b673] shrink-0 ml-2">
                      {v.score >= 0 ? '+' : ''}
                      {(v.score / 100).toFixed(1)}
                    </span>
                  </button>
                ))}
              </div>
              <button
                type="button"
                disabled={aiLoading}
                onClick={onRequestAiCommentary}
                className="w-full py-1.5 rounded bg-[#8f261f] hover:bg-[#ad3028] disabled:opacity-50 text-[#fdf4e3] text-xs font-semibold cursor-pointer mt-1"
              >
                {aiLoading ? 'Đang luận kiếm...' : 'Bình Luận Chuyên Sâu AI'}
              </button>
            </div>

            {/* Webhook Relay Strip */}
            <div className="pt-2 border-t border-[#d4a44e]/15 flex flex-col gap-1.5">
              <div className="text-[10px] font-semibold text-[#d9b673]">
                Webhook TikFinity / TikTok Live
              </div>
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  readOnly
                  aria-label="Webhook URL Studio"
                  value={webhookUrl}
                  className="flex-1 min-w-0 px-2 py-1 rounded bg-[#18131c] border border-[#d4a44e]/25 font-mono-num text-[10px] text-[#dfd1ba]"
                />
                <button
                  type="button"
                  onClick={handleCopyWebhook}
                  title="Chép URL Webhook"
                  className="px-2 py-1 rounded bg-[#251f29] text-[#f3dfb6] text-[10px] border border-[#d4a44e]/30 flex items-center gap-1 cursor-pointer shrink-0"
                >
                  <Copy className="w-3 h-3" />
                  {copiedWebhook ? 'Đã chép' : 'Chép'}
                </button>
                <button
                  type="button"
                  onClick={onTestWebhook}
                  className="px-2 py-1 rounded bg-[#8f261f] text-[#fdf4e3] text-[10px] font-medium cursor-pointer shrink-0"
                >
                  Thử
                </button>
              </div>
            </div>
          </div>
        </aside>
      ) : (
        /* Floating discrete restore button outside 9:16 when Clean OBS mode is active */
        <div className="hidden lg:flex fixed top-3 right-3 z-20 gap-1.5 pointer-events-auto">
          <button
            type="button"
            onClick={() => setObsCleanMode(false)}
            className="px-3 py-1.5 rounded border border-[#d4a44e]/45 text-xs font-medium text-[#f5e7cb] cursor-pointer"
            style={{ backgroundColor: 'rgba(14, 11, 16, 0.90)' }}
          >
            Hiện Bảng Đạo Diễn
          </button>
          <button
            type="button"
            onClick={() => {
              setObsCleanMode(false);
              onExitTikTokMode();
            }}
            className="px-3 py-1.5 rounded border border-[#d4a44e]/45 text-xs font-medium text-[#e7fbf7] cursor-pointer"
            style={{ backgroundColor: 'rgba(42, 84, 80, 0.92)' }}
          >
            Về 16:9
          </button>
        </div>
      )}
    </div>
  );
};
