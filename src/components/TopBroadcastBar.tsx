import React from 'react';
import {
  Columns2,
  Pause,
  Smartphone,
  Sparkles,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { Side } from '../engine/xiangqi';
import { BOT_MASTER_PROFILE } from '../data/characters';
import { ChallengerEntry } from '../engine/matchmaker';

interface TopBroadcastBarProps {
  activeChallenger: ChallengerEntry;
  turn: Side;
  moveCount: number;
  turnSecondsLeft: number;
  winProbRed: number;
  score: number;
  inCheck: Side | null;
  botThinking: boolean;
  showAnalysis: boolean;
  splitScreen: boolean;
  muted: boolean;
  tiktokFrame: boolean;
  viewerCount: number;
  onToggleAnalysis: () => void;
  onToggleSplitScreen: () => void;
  onToggleMute: () => void;
  onToggleTikTokFrame: () => void;
  onPause: () => void;
}

export const TopBroadcastBar: React.FC<TopBroadcastBarProps> = ({
  activeChallenger,
  turn,
  moveCount,
  turnSecondsLeft,
  winProbRed,
  score,
  inCheck,
  botThinking,
  showAnalysis,
  splitScreen,
  muted,
  tiktokFrame,
  viewerCount,
  onToggleAnalysis,
  onToggleSplitScreen,
  onToggleMute,
  onToggleTikTokFrame,
  onPause,
}) => {
  const scoreFormatted =
    score === 0 ? '0.0' : `${score > 0 ? '+' : ''}${(score / 100).toFixed(1)}`;

  return (
    <div
      className={`fixed top-3 left-3 z-20 flex items-center justify-between gap-2.5 pointer-events-none transition-all duration-300 ${
        splitScreen ? 'right-3 md:right-[calc(40%+12px)]' : 'right-3'
      }`}
    >
      {/* Left: Compact Wuxia Duel & Inner-Energy Gauge */}
      <div
        className="pointer-events-auto flex items-center gap-3 px-3.5 py-2 rounded border border-[#d4a44e]/30 shadow-lg min-w-0 overflow-hidden"
        style={{ backgroundColor: 'rgba(14, 11, 16, 0.88)' }}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-xs text-[#cbb99b] whitespace-nowrap">
            <span className="font-semibold text-[#f38072] truncate max-w-[120px]">
              {activeChallenger.username}
            </span>
            <span aria-hidden="true" className="text-[#d4a44e] font-semibold px-0.5">
              VS
            </span>
            <span className="font-semibold text-[#e6c278] truncate">
              {BOT_MASTER_PROFILE.name}
            </span>
          </div>

          {/* Inner-Energy (Nội Lực) Evaluation Bar */}
          <div className="mt-1.5 flex items-center gap-2">
            <div className="w-28 sm:w-36 h-1.5 bg-[#29222c] rounded-sm overflow-hidden flex">
              <div
                className="h-full bg-[#c93b2f] transition-all duration-300"
                style={{ width: `${winProbRed}%` }}
              />
              <div
                className="h-full bg-[#4ca69a] transition-all duration-300"
                style={{ width: `${100 - winProbRed}%` }}
              />
            </div>
            <span className="font-mono-num text-[11px] text-[#e5cfa4] whitespace-nowrap">
              Nội lực {scoreFormatted}
            </span>
          </div>
        </div>

        <div className="h-7 w-px bg-[#d4a44e]/20 shrink-0 hidden xl:block" />

        {/* Turn, Timer & Live Metadata (unboxed typography, no pill badges) */}
        <div className="hidden xl:flex items-center gap-2.5 text-xs whitespace-nowrap shrink-0">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-[#9c8c75]">
              Lượt đi
            </div>
            <div
              className={`font-semibold ${
                inCheck
                  ? 'text-[#ff6a57]'
                  : turn === 'red'
                    ? 'text-[#f29184]'
                    : 'text-[#7cd9cc]'
              }`}
            >
              {inCheck
                ? 'CHIẾU TƯỚNG!'
                : botThinking
                  ? 'Kỳ Ma suy tính'
                  : turn === 'red'
                    ? 'Đợi khách đi cờ'
                    : 'Kỳ Ma xuất chiêu'}
            </div>
          </div>

          <span aria-hidden="true" className="text-[#695c4d]">
            ·
          </span>

          <div className="font-mono-num text-[#f5e7cb]">
            <span className="text-[#9c8c75] mr-1">Hiệp</span>
            {Math.floor(moveCount / 2) + 1}
          </div>

          <span aria-hidden="true" className="text-[#695c4d]">
            ·
          </span>

          <div
            className={`font-mono-num font-semibold ${
              turnSecondsLeft <= 10 && turn === 'red'
                ? 'text-[#ff6a57]'
                : 'text-[#e8c67e]'
            }`}
          >
            {turnSecondsLeft}s
          </div>

          <span aria-hidden="true" className="text-[#695c4d]">
            ·
          </span>

          <div className="font-mono-num text-[#cbb99b]">
            {viewerCount.toLocaleString('vi-VN')} xem
          </div>
        </div>
      </div>

      {/* Right: Compact Square Utility Controls */}
      <div className="pointer-events-auto flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          tabIndex={-1}
          onClick={(e) => {
            e.currentTarget.blur();
            onToggleSplitScreen();
          }}
          aria-label={splitScreen ? 'Chuyển sang 1 màn hình toàn cảnh' : 'Chia 2 màn hình bàn cờ và zoom nhân vật'}
          aria-pressed={splitScreen}
          title={splitScreen ? 'Đang chia 2 màn hình (Bàn cờ + Zoom nhân vật)' : 'Bật chia 2 màn hình'}
          className={`w-9 h-9 rounded flex items-center justify-center border transition-colors cursor-pointer ${
            splitScreen
              ? 'bg-[#8f261f] text-[#fce7bc] border-[#e5b864]/65'
              : 'bg-[#141016]/90 text-[#bcae98] border-[#d4a44e]/25 hover:text-[#f7ecd6]'
          }`}
        >
          <Columns2 className="w-4 h-4" />
        </button>

        <button
          type="button"
          tabIndex={-1}
          onClick={(e) => {
            e.currentTarget.blur();
            onToggleAnalysis();
          }}
          aria-label={showAnalysis ? 'Tắt hiệu ứng phân tích kiếm ý' : 'Bật hiệu ứng phân tích kiếm ý'}
          aria-pressed={showAnalysis}
          title="Phân tích kiếm ý 3D"
          className={`w-9 h-9 rounded flex items-center justify-center border transition-colors cursor-pointer ${
            showAnalysis
              ? 'bg-[#8f261f] text-[#fce7bc] border-[#e5b864]/65'
              : 'bg-[#141016]/90 text-[#bcae98] border-[#d4a44e]/25 hover:text-[#f7ecd6]'
          }`}
        >
          <Sparkles className="w-4 h-4" />
        </button>

        <button
          type="button"
          tabIndex={-1}
          onClick={(e) => {
            e.currentTarget.blur();
            onToggleTikTokFrame();
          }}
          aria-label={tiktokFrame ? 'Thoát khung phát Live TikTok 9:16' : 'Bật khung phát Live TikTok 9:16'}
          aria-pressed={tiktokFrame}
          title="Chế độ khung dọc TikTok Live 9:16 (Chuẩn OBS & TikTok Live Studio)"
          className={`px-2.5 h-9 rounded flex items-center gap-1.5 border text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
            tiktokFrame
              ? 'bg-[#2a5450] text-[#e7fbf7] border-[#78d9ca]/70'
              : 'bg-[#1a151d]/92 text-[#f0d59a] border-[#d4a44e]/45 hover:bg-[#2a2130] hover:text-[#fff3d6]'
          }`}
        >
          <Smartphone className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Live 9:16</span>
        </button>

        <button
          type="button"
          tabIndex={-1}
          onClick={(e) => {
            e.currentTarget.blur();
            onToggleMute();
          }}
          aria-label={muted ? 'Bật âm thanh và giọng bình luận' : 'Tắt âm thanh'}
          title={muted ? 'Bật âm thanh (M)' : 'Tắt âm thanh (M)'}
          className="w-9 h-9 rounded flex items-center justify-center bg-[#141016]/90 text-[#d8c7ab] hover:text-[#f7ecd6] border border-[#d4a44e]/25 transition-colors cursor-pointer"
        >
          {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        </button>

        <button
          type="button"
          tabIndex={-1}
          onClick={(e) => {
            e.currentTarget.blur();
            onPause();
          }}
          aria-label="Tạm dừng trận đấu"
          title="Tạm dừng (P)"
          className="w-9 h-9 rounded flex items-center justify-center bg-[#141016]/90 text-[#d8c7ab] hover:text-[#f7ecd6] border border-[#d4a44e]/25 transition-colors cursor-pointer"
        >
          <Pause className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
