import React, { useEffect, useRef, useState } from 'react';
import {
  Camera,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  RefreshCw,
  Send,
  Sparkles,
  UserCheck,
  Users,
} from 'lucide-react';
import {
  GUEST_CHARACTER_ROSTER,
  GuestGender,
  WuxiaCharacterProfile,
  matchGuestCharacter,
} from '../data/characters';
import { BotDifficulty, DeepAnalysisResult } from '../engine/ai';
import { ChallengerEntry, LiveChatMessage } from '../engine/matchmaker';
import { CameraPreset, ZoomFocus } from '../scene/XiangqiStage';
import { CommentaryVoiceName } from '../utils/wuxiaAudio';

export type DockTab = 'chat' | 'guest' | 'analysis' | 'live';

interface BottomControlDockProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  activeTab: DockTab;
  onSelectTab: (tab: DockTab) => void;

  // Chat & Move interaction
  messages: LiveChatMessage[];
  activeChallenger: ChallengerEntry;
  audienceWaveOn: boolean;
  onToggleAudienceWave: () => void;
  onSubmitChat: (username: string, text: string) => void;
  moveHintError: string | null;

  // Guest Quick Selector & Queue
  queue: ChallengerEntry[];
  onApplyGuestQuickMatch: (
    username: string,
    gender: GuestGender,
    age: number,
    explicitChar?: WuxiaCharacterProfile,
  ) => void;
  onPickFromQueue: (mode: 'fifo' | 'random' | string) => void;

  // Deep Analysis
  analysis: DeepAnalysisResult | null;
  moveHistory: string[];
  previewVariationIdx: number | null;
  onHoverVariation: (idx: number | null) => void;
  onRequestAiCommentary: () => void;
  aiLoading: boolean;
  aiError: string | null;

  // Camera & Live Studio
  cameraPreset: CameraPreset;
  onSelectCamera: (preset: CameraPreset) => void;
  splitScreen: boolean;
  onToggleSplitScreen: () => void;
  tiktokFrame: boolean;
  onToggleTikTokFrame: () => void;
  zoomFocus: ZoomFocus;
  onSelectZoomFocus: (focus: ZoomFocus) => void;
  difficulty: BotDifficulty;
  onSelectDifficulty: (diff: BotDifficulty) => void;
  voiceEnabled: boolean;
  onToggleVoice: () => void;
  voiceName: CommentaryVoiceName;
  onSelectVoiceName: (voice: CommentaryVoiceName) => void;
  speechRate: number;
  onSelectSpeechRate: (rate: number) => void;
  onTestVoice: () => void;
  onResetMatch: () => void;
  onTestWebhook: () => void;
}

const SAMPLE_CHAT_MOVES = [
  'p2 bình 5',
  'm8 tiến 7',
  'x9 bình 8',
  'b7 tiến 1',
  'tiến 4',
  'thoái 1',
];

export const BottomControlDock: React.FC<BottomControlDockProps> = ({
  collapsed,
  onToggleCollapse,
  activeTab,
  onSelectTab,
  messages,
  activeChallenger,
  audienceWaveOn,
  onToggleAudienceWave,
  onSubmitChat,
  moveHintError,
  queue,
  onApplyGuestQuickMatch,
  onPickFromQueue,
  analysis,
  moveHistory,
  previewVariationIdx,
  onHoverVariation,
  onRequestAiCommentary,
  aiLoading,
  aiError,
  cameraPreset,
  onSelectCamera,
  splitScreen,
  onToggleSplitScreen,
  tiktokFrame,
  onToggleTikTokFrame,
  zoomFocus,
  onSelectZoomFocus,
  difficulty,
  onSelectDifficulty,
  voiceEnabled,
  onToggleVoice,
  voiceName,
  onSelectVoiceName,
  speechRate,
  onSelectSpeechRate,
  onTestVoice,
  onResetMatch,
  onTestWebhook,
}) => {
  const [chatText, setChatText] = useState('');
  const [chatUser, setChatUser] = useState(activeChallenger.username);

  // Quick Guest Character Input state (Nam / Nữ + Tuổi)
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
  }, [messages.length, activeTab]);

  const matchedChar = matchGuestCharacter(guestGender, guestAge);
  const filteredRoster = GUEST_CHARACTER_ROSTER.filter((c) => c.gender === guestGender);

  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = chatText.trim();
    if (!trimmed) return;
    onSubmitChat(chatUser.trim() || activeChallenger.username, trimmed);
    setChatText('');
  };

  const webhookUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/api/live/webhook`
      : '/api/live/webhook';

  const handleCopyWebhook = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(webhookUrl).catch(() => {});
      setCopiedWebhook(true);
      setTimeout(() => setCopiedWebhook(false), 1800);
    }
  };

  return (
    <div
      className={`fixed bottom-3 z-20 flex flex-col items-center pointer-events-none transition-all duration-300 ${
        splitScreen
          ? 'left-1/2 -translate-x-1/2 w-[95vw] md:left-[30%] md:w-[min(820px,57.5vw)]'
          : 'left-1/2 -translate-x-1/2 w-[min(960px,95vw)]'
      }`}
    >
      {/* Collapse / Expand Handle attached cleanly to top edge of dock */}
      <button
        type="button"
        onClick={onToggleCollapse}
        aria-expanded={!collapsed}
        className="pointer-events-auto mb-1 px-3.5 py-1 rounded-t border border-b-0 border-[#d4a44e]/35 text-[11px] font-medium text-[#e5cfa4] hover:text-[#fff3d6] flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
        style={{ backgroundColor: 'rgba(16, 12, 18, 0.92)' }}
      >
        {collapsed ? (
          <>
            <ChevronUp className="w-3.5 h-3.5" />
            Mở Bảng Điều Khiển (H)
          </>
        ) : (
          <>
            <ChevronDown className="w-3.5 h-3.5" />
            Ẩn Điều Khiển (H)
          </>
        )}
      </button>

      {/* Collapsible Unified Dock Body */}
      {!collapsed && (
        <div
          className="pointer-events-auto w-full rounded border border-[#d4a44e]/30 shadow-2xl overflow-hidden"
          style={{ backgroundColor: 'rgba(14, 11, 16, 0.92)' }}
        >
          {/* Tab Strip + Quick Camera Switcher */}
          <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-b border-[#d4a44e]/20 overflow-x-auto">
            <div className="flex items-center gap-1" role="tablist" aria-label="Bảng điều khiển kỳ đài">
              {(
                [
                  { id: 'chat', label: 'Chat TikTok', icon: MessageSquare },
                  { id: 'guest', label: `Khách Mời (${queue.length})`, icon: Users },
                  { id: 'analysis', label: 'Phân Tích Kiếm Ý', icon: Sparkles },
                  { id: 'live', label: 'Góc Máy & Live', icon: Camera },
                ] as const
              ).map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === id}
                  onClick={() => onSelectTab(id)}
                  className={`px-3 py-1.5 rounded text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    activeTab === id
                      ? 'bg-[#8f261f] text-[#fdf4e3]'
                      : 'text-[#bfb099] hover:text-[#f5e7cb] hover:bg-white/5'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                </button>
              ))}
            </div>

            {/* Compact Split-Screen, TikTok 9:16 & Quick Camera Switcher right on the dock bar */}
            <div className="hidden sm:flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={onToggleTikTokFrame}
                className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  tiktokFrame
                    ? 'bg-[#2a5450] text-[#e7fbf7] border border-[#78d9ca]/65'
                    : 'bg-[#1d1822] text-[#efd59a] hover:bg-[#2a2231] border border-[#d4a44e]/35'
                }`}
              >
                Khung 9:16
              </button>
              <button
                type="button"
                onClick={onToggleSplitScreen}
                className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  splitScreen
                    ? 'bg-[#8f261f] text-[#fdf4e3] border border-[#e5b864]/55'
                    : 'text-[#a69884] hover:text-[#efe0c4] border border-[#d4a44e]/20'
                }`}
              >
                {splitScreen ? '2 Màn Hình' : '1 Màn Hình'}
              </button>
              {!splitScreen &&
                (
                  [
                    { id: 'liveBot', label: 'Live Bot' },
                    { id: 'duel', label: 'Thư Hùng' },
                    { id: 'board', label: 'Toàn Bàn' },
                    { id: 'guest', label: 'Khách' },
                  ] as const
                ).map((cam) => (
                  <button
                    key={cam.id}
                    type="button"
                    onClick={() => onSelectCamera(cam.id)}
                    className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      cameraPreset === cam.id
                        ? 'bg-[#d4a44e]/25 text-[#f6dc9e] border border-[#d4a44e]/45'
                        : 'text-[#a69884] hover:text-[#efe0c4] border border-transparent'
                    }`}
                  >
                    {cam.label}
                  </button>
                ))}
            </div>
          </div>

          {/* Dock Tab Content (fixed compact height ~168px so 3D Bot Face remains unobstructed) */}
          <div className="h-[172px] p-3 flex flex-col justify-between overflow-hidden">
            {/* TAB 1: TIKTOK LIVE CHAT & MOVE COMMANDS */}
            {activeTab === 'chat' && (
              <div className="flex flex-col h-full gap-2">
                <div className="flex items-start gap-3 flex-1 min-h-0">
                  {/* Live Chat Feed */}
                  <div
                    ref={chatScrollRef}
                    className="flex-1 h-full overflow-y-auto wuxia-scroll pr-1 space-y-1 text-xs"
                  >
                    {messages.slice(-24).map((m) => (
                      <div key={m.id} className="leading-snug flex items-baseline gap-1.5">
                        <span
                          className={`font-semibold whitespace-nowrap shrink-0 ${
                            m.kind === 'bot'
                              ? 'text-[#e5b864]'
                              : m.kind === 'challenger' || m.kind === 'move'
                                ? 'text-[#f27c6e]'
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

                  {/* Right Compact Sample Commands & Audience Toggle */}
                  <div className="w-[215px] shrink-0 hidden md:flex flex-col gap-1.5 border-l border-[#d4a44e]/15 pl-3">
                    <div className="flex items-center justify-between text-[11px] text-[#b4a48b]">
                      <span>Lệnh đi nhanh</span>
                      <button
                        type="button"
                        onClick={onToggleAudienceWave}
                        className={`px-2 py-0.5 rounded text-[10px] font-medium cursor-pointer transition-colors ${
                          audienceWaveOn
                            ? 'bg-[#2a5450] text-[#d9f7f2]'
                            : 'bg-[#231d26] text-[#b8aa95] hover:text-[#f5e7cb]'
                        }`}
                      >
                        {audienceWaveOn ? 'Khán giả: Bật' : 'Khán giả: Tắt'}
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-1">
                      {SAMPLE_CHAT_MOVES.map((cmd) => (
                        <button
                          key={cmd}
                          type="button"
                          onClick={() => onSubmitChat(activeChallenger.username, cmd)}
                          className="px-2 py-1 rounded bg-[#211b24] hover:bg-[#322736] text-[#efd8a8] font-mono-num text-[11px] text-left truncate border border-[#d4a44e]/20 cursor-pointer transition-colors"
                        >
                          {cmd}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Chat Input Bar */}
                <form onSubmit={handleChatSubmit} className="flex items-center gap-2 shrink-0">
                  <label htmlFor="chat-sender-input" className="sr-only">
                    Tên người chat
                  </label>
                  <input
                    id="chat-sender-input"
                    type="text"
                    value={chatUser}
                    onChange={(e) => setChatUser(e.target.value)}
                    placeholder="@NguoiChoi"
                    className="w-28 sm:w-36 px-2.5 py-1.5 rounded bg-[#1d1720] border border-[#d4a44e]/25 text-xs text-[#f2cb7e] placeholder:text-[#7c6f5e] focus:outline-none focus:border-[#e5b864]"
                  />
                  <label htmlFor="chat-move-input" className="sr-only">
                    Nhập lệnh nước đi cờ tướng hoặc bình luận TikTok
                  </label>
                  <input
                    id="chat-move-input"
                    type="text"
                    value={chatText}
                    onChange={(e) => setChatText(e.target.value)}
                    placeholder="Nhập nước đi qua chat: x7 bình 3, p2 bình 5, tiến 5, thoái 1, hoặc !choi..."
                    className="flex-1 px-3 py-1.5 rounded bg-[#1d1720] border border-[#d4a44e]/30 text-xs text-[#f6ebd7] placeholder:text-[#867968] focus:outline-none focus:border-[#e5b864]"
                  />
                  <button
                    type="submit"
                    className="px-3.5 py-1.5 rounded bg-[#a92620] hover:bg-[#c23029] text-[#fdf4e3] text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                  >
                    <Send className="w-3.5 h-3.5" />
                    Gửi
                  </button>
                </form>

                {moveHintError && (
                  <div className="text-[11px] text-[#ff8778] truncate -mt-1">
                    {moveHintError}
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: QUICK GUEST CHARACTER MATCHER (NAM / NỮ / TUỔI) & QUEUE */}
            {activeTab === 'guest' && (
              <div className="flex flex-col h-full gap-2">
                {/* Fast Input Row: Gender + Age + Name + Instant Apply */}
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <div className="flex items-center rounded bg-[#1d1720] border border-[#d4a44e]/25 p-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        setGuestGender('nam');
                        const auto = matchGuestCharacter('nam', guestAge);
                        onApplyGuestQuickMatch(guestName, 'nam', guestAge, auto);
                      }}
                      className={`px-3 py-1 rounded text-xs font-medium cursor-pointer transition-colors ${
                        guestGender === 'nam'
                          ? 'bg-[#8f261f] text-[#fdf4e3]'
                          : 'text-[#b7a994] hover:text-[#f5e7cb]'
                      }`}
                    >
                      Nam
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setGuestGender('nu');
                        const auto = matchGuestCharacter('nu', guestAge);
                        onApplyGuestQuickMatch(guestName, 'nu', guestAge, auto);
                      }}
                      className={`px-3 py-1 rounded text-xs font-medium cursor-pointer transition-colors ${
                        guestGender === 'nu'
                          ? 'bg-[#8f261f] text-[#fdf4e3]'
                          : 'text-[#b7a994] hover:text-[#f5e7cb]'
                      }`}
                    >
                      Nữ
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <label htmlFor="guest-age-input" className="text-xs text-[#b8aa95]">
                      Tuổi:
                    </label>
                    <input
                      id="guest-age-input"
                      type="number"
                      min={12}
                      max={90}
                      value={guestAge}
                      onChange={(e) => {
                        const val = Math.max(12, Math.min(90, Number(e.target.value) || 18));
                        setGuestAge(val);
                        const auto = matchGuestCharacter(guestGender, val);
                        onApplyGuestQuickMatch(guestName, guestGender, val, auto);
                      }}
                      className="w-16 px-2 py-1 rounded bg-[#1d1720] border border-[#d4a44e]/30 font-mono-num text-xs text-[#f6ebd7] focus:outline-none focus:border-[#e5b864]"
                    />
                  </div>

                  <label htmlFor="guest-name-input" className="sr-only">
                    Tên khách mời TikTok
                  </label>
                  <input
                    id="guest-name-input"
                    type="text"
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    placeholder="Tên TikTok khách mời"
                    className="w-36 sm:w-44 px-2.5 py-1 rounded bg-[#1d1720] border border-[#d4a44e]/25 text-xs text-[#f6ebd7] focus:outline-none focus:border-[#e5b864]"
                  />

                  <button
                    type="button"
                    onClick={() =>
                      onApplyGuestQuickMatch(guestName, guestGender, guestAge, matchedChar)
                    }
                    className="px-3 py-1 rounded bg-[#a92620] hover:bg-[#c23029] text-[#fdf4e3] text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                  >
                    <UserCheck className="w-3.5 h-3.5" />
                    Chọn Vào Đài
                  </button>

                  {queue.length > 0 && (
                    <button
                      type="button"
                      onClick={() => onPickFromQueue('random')}
                      className="px-2.5 py-1 rounded bg-[#254542] hover:bg-[#2f5854] text-[#d6f5f0] text-xs font-medium whitespace-nowrap cursor-pointer ml-auto"
                    >
                      Bốc Thăm Hàng Đợi ({queue.length})
                    </button>
                  )}
                </div>

                {/* Roster Cards filtered by Gender, auto-highlighting Age Match */}
                <div className="flex-1 min-h-0 flex gap-2 overflow-x-auto wuxia-scroll pb-1">
                  {filteredRoster.map((char) => {
                    const isSelected = activeChallenger.character.id === char.id;
                    const isAutoMatch = matchedChar.id === char.id;
                    return (
                      <button
                        key={char.id}
                        type="button"
                        onClick={() => {
                          const midAge = Math.round((char.ageMin + Math.min(char.ageMax, 75)) / 2);
                          setGuestAge(midAge);
                          onApplyGuestQuickMatch(guestName, char.gender, midAge, char);
                        }}
                        className={`w-44 shrink-0 p-2 rounded border text-left transition-colors cursor-pointer flex flex-col justify-between ${
                          isSelected
                            ? 'bg-[#2a191d] border-[#e5b864]'
                            : isAutoMatch
                              ? 'bg-[#1e1a24] border-[#d4a44e]/55'
                              : 'bg-[#17131a] border-[#d4a44e]/20 hover:border-[#d4a44e]/45'
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-xs font-semibold text-[#f5e7cb] truncate">
                              {char.name}
                            </span>
                            <span
                              className="w-2.5 h-2.5 rounded-sm shrink-0"
                              style={{ backgroundColor: char.auraHex }}
                            />
                          </div>
                          <div className="text-[11px] text-[#d8b46d] truncate">
                            {char.title}
                          </div>
                        </div>
                        <div className="text-[10px] text-[#a59782] flex items-center gap-1.5 mt-1 min-w-0">
                          <span className="whitespace-nowrap shrink-0">{char.ageLabel}</span>
                          <span aria-hidden="true">·</span>
                          <span className="truncate">{char.sect}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* TAB 3: DEEP WUXIA TACTICAL ANALYSIS */}
            {activeTab === 'analysis' && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 h-full overflow-hidden">
                {/* Column 1: Principal Variations (hover/click highlights 3D Sword-Qi Arc) */}
                <div className="flex flex-col gap-1.5 min-h-0">
                  <div className="text-[11px] font-semibold text-[#d9b673] flex items-center justify-between">
                    <span>Biến Hóa Kiếm Trận (Xem tia 3D)</span>
                  </div>
                  <div className="space-y-1 overflow-y-auto wuxia-scroll pr-1">
                    {(analysis?.variations ?? []).map((v, idx) => (
                      <button
                        key={`${v.notation}_${idx}`}
                        type="button"
                        onMouseEnter={() => onHoverVariation(idx)}
                        onMouseLeave={() => onHoverVariation(null)}
                        onClick={() =>
                          onHoverVariation(previewVariationIdx === idx ? null : idx)
                        }
                        className={`w-full px-2.5 py-1.5 rounded border text-left flex items-center justify-between text-xs cursor-pointer transition-colors ${
                          previewVariationIdx === idx
                            ? 'bg-[#34211e] border-[#e5b864] text-[#fff0d0]'
                            : 'bg-[#1a151e] border-[#d4a44e]/20 text-[#e4d6be] hover:border-[#d4a44e]/45'
                        }`}
                      >
                        <span className="font-mono-num font-semibold">
                          {idx + 1}. {v.notation}
                          {v.replyNotation ? ` → ${v.replyNotation}` : ''}
                        </span>
                        <span className="font-mono-num text-[11px] text-[#d9b673]">
                          {v.score >= 0 ? '+' : ''}
                          {(v.score / 100).toFixed(1)}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Column 2: Active Threats & Tactical Summary */}
                <div className="flex flex-col gap-1.5 min-h-0 border-l border-[#d4a44e]/15 pl-3">
                  <div className="text-[11px] font-semibold text-[#d9b673]">
                    Sát Khí & Mối Đe Dọa
                  </div>
                  <div className="text-xs text-[#e5d9c3] leading-snug">
                    {analysis?.tacticalSummary ?? 'Đang quét thế cờ trên kỳ đài...'}
                  </div>
                  <div className="flex-1 overflow-y-auto wuxia-scroll space-y-1 text-[11px] text-[#c5b59d]">
                    {analysis && analysis.threats.length > 0 ? (
                      analysis.threats.map((t, i) => (
                        <div key={i} className="truncate">
                          {i + 1}. {t.description}
                        </div>
                      ))
                    ) : (
                      <div className="text-[#8e806d]">
                        Chưa xuất hiện sát chiêu trực diện.
                      </div>
                    )}
                  </div>
                </div>

                {/* Column 3: Move History + Gemini Wuxia Commentator Action */}
                <div className="flex flex-col justify-between gap-2 min-h-0 border-l border-[#d4a44e]/15 pl-3">
                  <div className="min-h-0 flex-1 flex flex-col">
                    <div className="text-[11px] font-semibold text-[#d9b673] mb-1">
                      Biên Bản Kỳ Phổ ({moveHistory.length} nước)
                    </div>
                    <div className="flex-1 overflow-y-auto wuxia-scroll text-[11px] font-mono-num text-[#d5c6ad] leading-relaxed">
                      {moveHistory.length === 0
                        ? 'Kỳ đài vừa khai cuộc.'
                        : moveHistory.map((mv, i) => (
                            <span key={i} className="mr-2 inline-block">
                              {i % 2 === 0 ? `${Math.floor(i / 2) + 1}. ` : ''}
                              {mv}
                            </span>
                          ))}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <button
                      type="button"
                      disabled={aiLoading}
                      onClick={onRequestAiCommentary}
                      className="w-full py-1.5 px-3 rounded bg-[#8f261f] hover:bg-[#ad3028] disabled:opacity-50 text-[#fdf4e3] text-xs font-semibold cursor-pointer transition-colors"
                    >
                      {aiLoading ? 'Đang luận kiếm...' : 'Bình Luận Chuyên Sâu AI'}
                    </button>
                    {aiError && (
                      <div className="text-[10px] text-[#f28a7c] truncate">{aiError}</div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 4: CAMERA ANGLES & TIKTOK LIVE WEBHOOK BRIDGE */}
            {activeTab === 'live' && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 h-full">
                {/* Split-Screen & Camera Presets */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-[#d9b673]">
                    <span>Bố Cục & Góc Máy 3D</span>
                    <button
                      type="button"
                      onClick={onToggleSplitScreen}
                      className={`px-2 py-0.5 rounded text-[10px] font-medium border cursor-pointer transition-colors ${
                        splitScreen
                          ? 'bg-[#8f261f] text-[#fdf4e3] border-[#e5b864]/65'
                          : 'bg-[#1a151e] text-[#c7b9a4] border-[#d4a44e]/25'
                      }`}
                    >
                      {splitScreen ? '2 Màn Hình: Bật' : '1 Màn Hình'}
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(
                      [
                        { id: 'liveBot', label: 'Live Mặt Bot' },
                        { id: 'duel', label: 'Thư Hùng 2 Bên' },
                        { id: 'board', label: 'Toàn Bàn Cờ' },
                        { id: 'guest', label: 'Khách Mời 3D' },
                      ] as const
                    ).map((cam) => (
                      <button
                        key={cam.id}
                        type="button"
                        onClick={() => onSelectCamera(cam.id)}
                        className={`py-1.5 px-2.5 rounded text-xs font-medium border cursor-pointer transition-colors whitespace-nowrap ${
                          cameraPreset === cam.id
                            ? 'bg-[#8f261f] text-[#fdf4e3] border-[#e5b864]/65'
                            : 'bg-[#1a151e] text-[#c7b9a4] border-[#d4a44e]/20 hover:text-[#f7ecd6]'
                        }`}
                      >
                        {cam.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Bot Strength & Gemini TTS Commentary Voice */}
                <div className="flex flex-col justify-between gap-1.5 border-l border-[#d4a44e]/15 pl-3">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-[#d9b673]">
                    <span>Giọng AI & Tốc Độ</span>
                    <div className="flex items-center gap-1">
                      {[0.9, 1.0, 1.15].map((r) => (
                        <button
                          key={r}
                          type="button"
                          onClick={() => onSelectSpeechRate(r)}
                          className={`px-1.5 py-0.5 rounded font-mono-num text-[10px] border cursor-pointer transition-colors ${
                            speechRate === r
                              ? 'bg-[#8f261f] text-[#fdf4e3] border-[#e5b864]/65'
                              : 'bg-[#1a151e] text-[#b9ab96] border-[#d4a44e]/20 hover:text-[#f5e7cb]'
                          }`}
                        >
                          {r.toFixed(2).replace(/0$/, '')}x
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={onTestVoice}
                        className="px-2 py-0.5 rounded bg-[#2a5450] hover:bg-[#356a65] text-[#e7fbf7] text-[10px] font-medium cursor-pointer transition-colors"
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
                        className={`py-1 rounded text-[10px] font-medium border cursor-pointer transition-colors ${
                          voiceName === v.id
                            ? 'bg-[#8f261f] text-[#fdf4e3] border-[#e5b864]/60'
                            : 'bg-[#1a151e] text-[#b9ab96] border-[#d4a44e]/20 hover:text-[#f5e7cb]'
                        }`}
                      >
                        {v.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-1">
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
                        className={`flex-1 py-1 rounded text-[10px] font-medium border cursor-pointer transition-colors ${
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
                      className={`flex-1 py-1 px-2 rounded text-[11px] font-medium border cursor-pointer transition-colors ${
                        voiceEnabled
                          ? 'bg-[#2e241b] text-[#f5d896] border-[#d4a44e]/55'
                          : 'bg-[#1a151e] text-[#a99b87] border-[#d4a44e]/20'
                      }`}
                    >
                      Giọng AI: {voiceEnabled ? 'Bật' : 'Tắt'}
                    </button>
                    <button
                      type="button"
                      onClick={onResetMatch}
                      className="py-1 px-2.5 rounded bg-[#231c26] hover:bg-[#342a38] text-[#efe0c4] text-[11px] font-medium border border-[#d4a44e]/25 flex items-center gap-1 cursor-pointer whitespace-nowrap"
                    >
                      <RefreshCw className="w-3 h-3" />
                      Ván Mới
                    </button>
                  </div>
                </div>

                {/* TikTok Live Real Webhook Bridge */}
                <div className="flex flex-col justify-between gap-1.5 border-l border-[#d4a44e]/15 pl-3">
                  <div>
                    <div className="text-[11px] font-semibold text-[#d9b673] mb-1">
                      Cầu Nối TikTok Live (Webhook SSE)
                    </div>
                    <p className="text-[11px] text-[#b7a994] leading-snug">
                      Kết nối TikFinity / OBS Relay gửi POST JSON tới endpoint bên dưới để đọc bình luận TikTok thật theo thời gian thực.
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      readOnly
                      aria-label="URL Webhook TikTok Live"
                      value={webhookUrl}
                      className="flex-1 min-w-0 px-2 py-1 rounded bg-[#18131c] border border-[#d4a44e]/25 font-mono-num text-[10px] text-[#dfd1ba]"
                    />
                    <button
                      type="button"
                      onClick={handleCopyWebhook}
                      className="px-2.5 py-1 rounded bg-[#251f29] hover:bg-[#352c3b] text-[#f3dfb6] text-[11px] border border-[#d4a44e]/30 whitespace-nowrap cursor-pointer"
                    >
                      {copiedWebhook ? 'Đã chép' : 'Chép'}
                    </button>
                    <button
                      type="button"
                      onClick={onTestWebhook}
                      className="px-2.5 py-1 rounded bg-[#8f261f] hover:bg-[#a92d25] text-[#fdf4e3] text-[11px] font-medium whitespace-nowrap cursor-pointer"
                    >
                      Thử Live
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
