import React from 'react';
import { BoardState } from '../engine/xiangqi';
import type { StatusReason } from '../engine/repetitionReferee';
import { ChallengerEntry } from '../engine/matchmaker';
import { BOT_MASTER_PROFILE } from '../data/characters';
import { resolvePronounProfile } from '../engine/livePerformance';

const REFEREE_SUBTITLES: Partial<Record<StatusReason, string>> = {
  perpetual_check: 'Phạm luật Trường Chiếu — Đổi nước khác kẻo bị xử thua!',
  repetition_draw:
    'Hòa do lặp thế 3 lần — đúng thế cũ lặp lại, {audience} làm chứng, kỳ đài xử hòa.',
  sixty_move_draw: 'Hòa theo luật 60 hiệp không ăn quân — 120 nửa nước trôi qua chẳng mất quân nào.',
};

export interface StatusModalCopy {
  headline: string;
  subtitle: string;
}

export function buildStatusModalCopy(params: {
  mode: 'paused' | 'gameover';
  status: BoardState['status'];
  statusReason?: StatusReason;
  challenger: Pick<ChallengerEntry, 'username' | 'gender' | 'age'>;
}): StatusModalCopy {
  if (params.mode === 'paused') {
    return {
      headline: 'Tạm Dừng Kỳ Đài',
      subtitle: 'Phiên phát sóng đang tạm nghỉ. Khôi phục ngay để tiếp tục ván cờ đêm hoa chúc.',
    };
  }

  const p = resolvePronounProfile(params.challenger.gender, params.challenger.age);
  const isBridal = p.storyMode === 'bridal_duel';
  const headline =
    params.status === 'red_win'
      ? `${p.guestCap} ${params.challenger.username} Toàn Thắng!`
      : params.status === 'black_win'
        ? 'Tân Nương Áo Đỏ Đắc Thắng!'
        : isBridal
          ? 'Phu Thê Bất Phân Thắng Bại'
          : 'Kỳ Phùng Địch Thủ';

  const refereeSubtitle = params.statusReason
    ? REFEREE_SUBTITLES[params.statusReason]?.replace('{audience}', p.audience)
    : undefined;
  const defaultSubtitle =
    params.status === 'red_win'
      ? isBridal
        ? `Tuyệt kỹ xuất thần! ${p.guestCap} thắng trọn ván cờ hoa chúc — ${p.audience} làm chứng, ${p.self} giao lại một lớp hồi môn đúng như đã hẹn!`
        : `Tuyệt kỹ xuất thần! ${p.guestCap} thắng trọn ván cờ — ${p.audience} làm chứng, ${p.self} xin kính ${p.guest} một chén trà thơm!`
      : params.status === 'black_win'
        ? isBridal
          ? `Hì hì, ${p.audience} làm chứng nhé! Tân Nương Áo Đỏ giữ vững kỳ đài, đêm nay ${p.guest} tự giác ôm gối ra hành lang ngắm trăng nha!`
          : `Hì hì, ${p.audience} làm chứng nhé! Tân Nương Áo Đỏ giữ vững kỳ đài, ${p.guest} nhận phạt uống liền ba chén trà sen nha!`
        : isBridal
          ? 'Nội lực tương đồng, phu thê hòa khí thu cờ dưới ánh nến hồng.'
          : 'Nội lực tương đồng, hai kỳ thủ hòa khí thu cờ dưới ánh nến hồng.';

  return { headline, subtitle: refereeSubtitle ?? defaultSubtitle };
}

interface StatusModalProps {
  mode: 'paused' | 'gameover';
  status: BoardState['status'];
  /** Why the game ended; absent for states saved before the referee existed. */
  statusReason?: StatusReason;
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
  statusReason,
  moveCount,
  winProbRed,
  challenger,
  onResume,
  onRestart,
  onReturnTitle,
}) => {
  const isPaused = mode === 'paused';
  const { headline, subtitle } = buildStatusModalCopy({
    mode,
    status,
    statusReason,
    challenger,
  });

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
