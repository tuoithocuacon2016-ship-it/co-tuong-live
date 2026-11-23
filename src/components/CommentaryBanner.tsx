import React from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { CommentaryItem } from '../engine/matchmaker';

interface CommentaryBannerProps {
  commentary: CommentaryItem | null;
  dockCollapsed: boolean;
  splitScreen: boolean;
  speakingEngine: 'gemini' | 'browser' | null;
  voiceEnabled: boolean;
  muted: boolean;
  onReplayVoice: () => void;
}

export const CommentaryBanner: React.FC<CommentaryBannerProps> = ({
  commentary,
  dockCollapsed,
  splitScreen,
  speakingEngine,
  voiceEnabled,
  muted,
  onReplayVoice,
}) => {
  if (!commentary) return null;

  const isCheck = commentary.mood === 'check';
  const isVictory = commentary.mood === 'victory';
  const isSpeaking = speakingEngine !== null;

  return (
    <div
      className={`fixed z-20 pointer-events-none transition-all duration-300 ${
        splitScreen
          ? `left-1/2 -translate-x-1/2 w-[min(780px,92vw)] ${
              dockCollapsed ? 'bottom-14' : 'bottom-[262px]'
            } md:left-[calc(60%+14px)] md:right-3.5 md:bottom-4 md:translate-x-0 md:w-auto`
          : `left-1/2 -translate-x-1/2 w-[min(780px,92vw)] ${
              dockCollapsed ? 'bottom-14' : 'bottom-[262px]'
            }`
      }`}
    >
      <div
        className="pointer-events-auto px-4 py-2.5 rounded border shadow-lg"
        style={{
          backgroundColor: isCheck
            ? 'rgba(54, 14, 16, 0.92)'
            : 'rgba(13, 10, 15, 0.88)',
          borderColor: isCheck
            ? 'rgba(242, 92, 74, 0.65)'
            : isVictory
              ? 'rgba(232, 186, 98, 0.72)'
              : 'rgba(212, 164, 78, 0.3)',
        }}
      >
        <div className="flex items-center justify-between gap-3 text-[11px] text-[#d6b779] mb-0.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="font-semibold text-[#f8e4b6] whitespace-nowrap">
              Kỳ Ma Điêu Nguyệt
            </span>
            {commentary.phaseLabel && (
              <>
                <span aria-hidden="true" className="text-[#8a7657]">
                  ·
                </span>
                <span className="text-[#c5e5dc] font-medium whitespace-nowrap">
                  {commentary.phaseLabel}
                </span>
              </>
            )}
            {commentary.emotionLabel && (
              <>
                <span aria-hidden="true" className="text-[#8a7657]">
                  ·
                </span>
                <span className="text-[#f2cb7e] font-medium whitespace-nowrap">
                  {commentary.emotionLabel}
                </span>
              </>
            )}
            <span aria-hidden="true" className="text-[#8a7657] hidden sm:inline">
              ·
            </span>
            <span className="truncate text-[#e6d5b8] hidden sm:inline">
              {commentary.motif}
            </span>
          </div>

          <button
            type="button"
            onClick={onReplayVoice}
            title="Phát lại giọng bình luận AI"
            className={`px-2 py-0.5 rounded border text-[10px] font-medium flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
              isSpeaking
                ? 'bg-[#8f261f] text-[#fff1d4] border-[#e5b864]/70'
                : muted || !voiceEnabled
                  ? 'bg-[#1c161f] text-[#9b8d79] border-[#d4a44e]/20 hover:text-[#f5e7cb]'
                  : 'bg-[#211a24] text-[#ecd299] border-[#d4a44e]/35 hover:bg-[#312536]'
            }`}
          >
            {muted || !voiceEnabled ? (
              <VolumeX className="w-3 h-3" />
            ) : (
              <Volume2 className="w-3 h-3" />
            )}
            <span>
              {isSpeaking
                ? speakingEngine === 'gemini'
                  ? 'Đang đọc giọng AI'
                  : 'Đang bình luận'
                : muted || !voiceEnabled
                  ? 'Đang tắt giọng'
                  : 'Nghe Giọng AI'}
            </span>
          </button>
        </div>

        <p className="text-xs sm:text-[13px] text-[#f4ead8] leading-snug line-clamp-2">
          {commentary.line}
        </p>
      </div>
    </div>
  );
};
