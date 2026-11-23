import React from 'react';
import { BoardState } from '../engine/xiangqi';
import { ChallengerEntry } from '../engine/matchmaker';
import { BOT_MASTER_PROFILE } from '../data/characters';

interface StatusModalProps {
  mode: 'paused' | 'gameover';
  status: BoardState['status'];
  moveCount: number;
  winProbRed: number;
  challenger: ChallengerEntry;
  onResume: () => void;
  onRestart: () => void;
  onReturnTitle: () => void;
}

export const StatusModal: React.FC<StatusModalProps> = ({
  mode,
  status,
  moveCount,
  winProbRed,
  challenger,
  onResume,
  onRestart,
  onReturnTitle,
}) => {
  const isPaused = mode === 'paused';
  const headline = isPaused
    ? 'Tạm Dừng Kỳ Đài'
    : status === 'red_win'
      ? `Chàng ${challenger.username} Toàn Thắng!`
      : status === 'black_win'
        ? 'Tân Nương Áo Đỏ Đắc Thắng!'
        : 'Phu Thê Bất Phân Thắng Bại';

  const subtitle = isPaused
    ? 'Phiên phát sóng đang tạm nghỉ. Khôi phục ngay để tiếp tục ván cờ đêm hoa chúc.'
    : status === 'red_win'
      ? 'Tuyệt kỹ xuất thần! Chàng thắng trọn ván cờ hoa chúc — hai họ làm chứng, thiếp giao lại một lớp hồi môn đúng như đã hẹn!'
      : status === 'black_win'
        ? 'Hì hì, hai họ làm chứng nhé! Tân Nương Áo Đỏ giữ vững kỳ đài, đêm nay chàng tự giác ôm gối ra hành lang ngắm trăng nha!'
        : 'Nội lực tương đồng, phu thê hòa khí thu cờ dưới ánh nến hồng.';

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(8, 6, 10, 0.72)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="status-modal-title"
    >
      <div
        className="w-full max-w-md rounded border border-[#d4a44e]/45 p-6 shadow-2xl"
        style={{ backgroundColor: 'rgba(18, 14, 20, 0.96)' }}
      >
        <div className="text-xs uppercase tracking-[0.18em] text-[#d4a44e] mb-1">
          {isPaused ? 'Trạng Thái Trực Tuyến' : 'Kết Cục Thư Hùng'}
        </div>
        <h2
          id="status-modal-title"
          className="font-display text-2xl font-bold text-[#f7ecd6] mb-2"
        >
          {headline}
        </h2>
        <p className="text-sm text-[#c8baa3] mb-5 leading-relaxed">{subtitle}</p>

        {/* 3 Tabular Metrics */}
        <div className="grid grid-cols-3 gap-2 mb-6 py-3 border-y border-[#d4a44e]/20">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-[#9c8c75]">
              Tổng nước đi
            </div>
            <div className="font-mono-num text-lg font-semibold text-[#f6e8cc]">
              {moveCount}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-[#9c8c75]">
              Nội lực Đỏ
            </div>
            <div className="font-mono-num text-lg font-semibold text-[#f28f82]">
              {winProbRed}%
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-[#9c8c75]">
              Nhân vật
            </div>
            <div className="text-xs font-semibold text-[#e6c47d] mt-1 truncate">
              {challenger.character.name}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {isPaused ? (
            <button
              type="button"
              onClick={onResume}
              className="flex-1 py-2.5 px-4 rounded bg-[#a92620] hover:bg-[#c23029] text-[#fdf4e3] text-sm font-semibold cursor-pointer transition-colors"
            >
              Tiếp Tục
            </button>
          ) : (
            <button
              type="button"
              data-start="true"
              onClick={onRestart}
              className="flex-1 py-2.5 px-4 rounded bg-[#a92620] hover:bg-[#c23029] text-[#fdf4e3] text-sm font-semibold cursor-pointer transition-colors"
            >
              Đấu Ván Mới
            </button>
          )}

          {isPaused && (
            <button
              type="button"
              onClick={onRestart}
              className="py-2.5 px-4 rounded bg-[#241d28] hover:bg-[#322838] text-[#efe0c4] text-sm font-medium border border-[#d4a44e]/30 cursor-pointer transition-colors"
            >
              Chơi Lại
            </button>
          )}

          <button
            type="button"
            onClick={onReturnTitle}
            className="py-2.5 px-4 rounded bg-transparent hover:bg-white/5 text-[#bfb099] hover:text-[#f5e7cb] text-sm font-medium border border-[#d4a44e]/25 cursor-pointer transition-colors"
          >
            Màn Hình Chính
          </button>
        </div>
      </div>
    </div>
  );
};
