import React from 'react';
import { PORTRAIT_ASSETS } from './LiveHostPortraitPane';

interface TitleOverlayProps {
  onStartLive: () => void;
  onStartFreePlay: () => void;
}

export const TitleOverlay: React.FC<TitleOverlayProps> = ({
  onStartLive,
  onStartFreePlay,
}) => {
  return (
    <div className="fixed inset-0 z-20 flex items-center overflow-hidden pointer-events-none">
      {/* Right-Side AAA CGI Hero Portrait of Kỳ Ma Điêu Nguyệt blended seamlessly over 3D board */}
      <div
        aria-hidden="true"
        className="hidden md:block fixed top-0 right-0 bottom-0 w-[44%] pointer-events-none overflow-hidden"
      >
        <div className="w-full h-full animate-host-breathe">
          <img
            src={PORTRAIT_ASSETS.botCalm}
            alt="Kỳ Ma Điêu Nguyệt — Tân Nương Áo Đỏ Đêm Hoa Chúc"
            className="w-full h-full object-cover object-[50%_14%] scale-[1.04]"
            draggable={false}
          />
        </div>
        {/* Soft obsidian gradient melt on left & bottom edges so portrait merges into the 3D scene */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(90deg, rgba(11, 9, 13, 0.96) 0%, rgba(11, 9, 13, 0.35) 26%, rgba(11, 9, 13, 0) 56%), linear-gradient(180deg, rgba(11, 9, 13, 0.25) 0%, rgba(11, 9, 13, 0) 20%, rgba(11, 9, 13, 0) 76%, rgba(11, 9, 13, 0.85) 100%)',
          }}
        />
        <div className="absolute bottom-6 right-8 text-right">
          <div className="font-display text-lg font-bold text-[#f6deaa] hud-text-shadow">
            Điêu Nguyệt Tân Nương
          </div>
          <div className="text-xs tracking-[0.14em] uppercase text-[#d8be92] hud-text-shadow">
            Đêm Hoa Chúc · Kỳ Cục Thử Tài Chàng
          </div>
        </div>
      </div>

      {/* Left Scrim & Clean Editorial Title Block */}
      <div
        className="relative z-10 w-full h-full flex items-center"
        style={{
          background:
            'linear-gradient(90deg, rgba(11, 9, 13, 0.86) 0%, rgba(11, 9, 13, 0.56) 36%, rgba(11, 9, 13, 0.08) 58%, rgba(11, 9, 13, 0) 100%)',
        }}
      >
        <div className="w-full max-w-xl px-8 sm:px-14 py-10 pointer-events-auto flex flex-col items-start">
          {/* Bespoke inline SVG Wuxia Vermilion Seal & Crest Lockup */}
          <div className="flex items-center gap-4 mb-5">
            <svg
              viewBox="0 0 64 64"
              className="w-12 h-12 shrink-0"
              aria-hidden="true"
            >
              <rect
                x="4"
                y="4"
                width="56"
                height="56"
                rx="6"
                fill="#8f1e1a"
                stroke="#e5b864"
                strokeWidth="2.5"
              />
              <rect
                x="10"
                y="10"
                width="44"
                height="44"
                rx="3"
                fill="none"
                stroke="#e5b864"
                strokeWidth="1.2"
                strokeOpacity="0.65"
              />
              <text
                x="32"
                y="41"
                textAnchor="middle"
                fill="#f8ead0"
                fontSize="28"
                fontWeight="700"
                fontFamily="Georgia, serif"
              >
                棋
              </text>
            </svg>
            <div className="text-xs tracking-[0.2em] text-[#d9b26a] uppercase font-medium">
              Đêm Tân Hôn · Kỳ Cục Hoa Chúc 3D
            </div>
          </div>

          <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight text-[#f7ecd6] leading-[1.12] mb-4 hud-text-shadow [text-wrap:balance]">
            Kỳ Đài Giang Hồ 3D
          </h1>

          <p className="text-sm sm:text-base text-[#d2c5b0] leading-relaxed max-w-md mb-8">
            Đêm tân hôn nến đỏ lung linh, Tân Nương Áo Đỏ Điêu Nguyệt bày sẵn bàn cờ thử tài chàng
            trước giờ động phòng: thắng thiếp thì thiếp giao lại một lớp hồi môn, thua thì ôm gối ngắm trăng!
            Chat thẳng lệnh cờ như{' '}
            <span className="font-mono-num text-[#f2cb7e]">p2 bình 5</span>,{' '}
            <span className="font-mono-num text-[#f2cb7e]">x7 bình 3</span>,{' '}
            <span className="font-mono-num text-[#f2cb7e]">tiến 5</span> hoặc bấm trực tiếp quân cờ.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              data-start="true"
              onClick={onStartLive}
              className="px-6 py-3 bg-[#a92620] hover:bg-[#c23029] active:bg-[#8f1f1a] text-[#fdf5e6] font-semibold text-sm rounded border border-[#e5b864]/55 shadow-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e5b864]"
            >
              Bắt Đầu Phát Live
            </button>

            <button
              type="button"
              onClick={onStartFreePlay}
              className="px-5 py-3 bg-[#1a151c]/90 hover:bg-[#27202b] text-[#e8dcc7] font-medium text-sm rounded border border-[#d4a44e]/35 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e5b864]"
            >
              Chơi Tự Do
            </button>
          </div>
        </div>
      </div>

      {/* Single flat borderless control hint in bottom safe margin */}
      <div className="fixed bottom-5 left-8 sm:left-14 z-10 text-xs text-[#b8aa95] tracking-wide pointer-events-none">
        Enter Bắt đầu · Chat lệnh cờ (P2 bình 5, M8 tiến 7) · H Ẩn/Hiện bảng điều khiển · P Tạm dừng
      </div>
    </div>
  );
};
