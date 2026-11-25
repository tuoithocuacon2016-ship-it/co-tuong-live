import { GuestGender } from '../data/characters';
import { HostEmotion } from '../scene/portraitKinematics';
import {
  PerformanceGesture,
  PerformanceScript,
  renderSpeechTokens,
  resolvePronounProfile,
} from './livePerformance';
import { CONCESSION_LINE_VI, ShieldKind } from './handicap';
import { ChallengerEntry } from './matchmaker';
import { formatMoveVietnamese, normalizeVietnamese, parseVietnameseChatMove } from './notation';
import { BoardState, Move } from './xiangqi';

export type LiveControlMode = 'duel_1v1' | 'crowd_vote';

export interface QueuedChallenger extends ChallengerEntry {
  isVip?: boolean;
  giftCount?: number;
}

export interface CommentTriageDecision {
  /** 0 = active challenger / gift, 1 = backseat coach / high priority, 2 = notable viewer chat, 3 = ignore/display only */
  tier: 0 | 1 | 2 | 3;
  category:
    | 'gift'
    | 'challenger_chat'
    | 'backseat_coach'
    | 'viewer_question'
    | 'viewer_cheer'
    | 'spam_or_low';
  score: number;
  suggestedNotation?: string;
}

const SPAM_OR_PROFANITY_RE =
  /\b(dm|dcm|dit|vcl|vl|cc|clm|ngu vcl|rac|lua dao|scam|http|www\.|\.com|\.vn)\b/;

/**
 * Triage an incoming TikTok Live comment into priority tiers so Kỳ Ma NEVER drops
 * the active challenger's messages, catches viewers whispering moves ("mách nước"),
 * filters spam/gibberish, and surfaces only the sharpest viewer comment during idle beats.
 */
export function triageLiveComment(params: {
  username: string;
  text: string;
  isChallenger: boolean;
  board: BoardState;
  hasGift?: boolean;
}): CommentTriageDecision {
  const { text, isChallenger, board, hasGift } = params;
  const trimmed = text.trim();

  if (hasGift) {
    return { tier: 0, category: 'gift', score: 100 };
  }

  const norm = normalizeVietnamese(trimmed);
  if (!norm || norm.length < 2 || SPAM_OR_PROFANITY_RE.test(norm)) {
    return { tier: 3, category: 'spam_or_low', score: 0 };
  }

  // Reject pure single-character spam like "aaaaaa", "11111", "kkkk"
  if (/^(.)\1{3,}$/.test(norm.replace(/\s+/g, ''))) {
    return { tier: 3, category: 'spam_or_low', score: 0 };
  }

  if (isChallenger) {
    return { tier: 0, category: 'challenger_chat', score: 95 };
  }

  // Tier 1: Backseat coaching detection! Non-challenger viewer whispers a legal Red move!
  if (board.status === 'playing' && board.turn === 'red') {
    const parsed = parseVietnameseChatMove(board, trimmed);
    if (parsed.move && parsed.notation) {
      return {
        tier: 1,
        category: 'backseat_coach',
        score: 88,
        suggestedNotation: parsed.notation,
      };
    }
  }

  // Tier 2: Score engaging viewer questions & compliments/cheers for idle-window spotlight
  let score = 20;
  const isQuestion =
    trimmed.includes('?') ||
    /\b(lam sao|cach choi|luat|choi the nao|len dai|sao khong|ai thang|bao nhieu|may tuoi|o dau|ten gi)\b/.test(
      norm,
    );
  const mentionsStoryOrHost =
    /\b(co dau|tan nuong|tan lang|chu re|dieu nguyet|ao do|dong phong|ho sen|trang|dep|xinh|duyen|giong|nha trai|nha gai|thua|thang|cheu|ghẹo|gheo|co len)\b/.test(
      norm,
    );

  if (isQuestion) score += 42;
  if (mentionsStoryOrHost) score += 32;
  if (trimmed.length >= 14 && trimmed.length <= 120) score += 16;

  if (score >= 58) {
    return {
      tier: 2,
      category: isQuestion ? 'viewer_question' : 'viewer_cheer',
      score: Math.min(92, score),
    };
  }

  return { tier: 3, category: 'spam_or_low', score };
}

/**
 * Enqueue or upgrade a challenger while respecting VIP Fast-Track (gift senders jump ahead
 * of regular queue entries, preserving FIFO within VIP and within regular tiers).
 */
export function enqueueChallengerWithPriority(
  queue: QueuedChallenger[],
  entry: QueuedChallenger,
): QueuedChallenger[] {
  const existing = queue.find((q) => q.actorId === entry.actorId);
  const merged: QueuedChallenger = existing
    ? {
        ...existing,
        ...entry,
        isVip: Boolean(existing.isVip || entry.isVip),
        giftCount: (existing.giftCount ?? 0) + (entry.giftCount ?? 0),
        joinedAt: existing.joinedAt,
      }
    : entry;

  const without = queue.filter((q) => q.actorId !== entry.actorId);
  const next = [...without, merged];

  next.sort((a, b) => {
    const vipDiff = Number(Boolean(b.isVip)) - Number(Boolean(a.isVip));
    if (vipDiff !== 0) return vipDiff;
    const giftDiff = (b.giftCount ?? 0) - (a.giftCount ?? 0);
    if (giftDiff !== 0) return giftDiff;
    return a.joinedAt - b.joinedAt;
  });

  return next;
}

/**
 * Seat-locked profile update:
 * - Only updates activeChallenger if the sender's unforgeable actorId matches the active seat.
 * - Otherwise updates the sender's entry in the queue (NEVER lets a lookalike hijack the live seat!).
 */
export function applySeatLockedProfileUpdate(params: {
  senderActorId: string;
  activeChallenger: QueuedChallenger;
  queue: QueuedChallenger[];
  updatedEntry: QueuedChallenger;
}): {
  updatedActive: QueuedChallenger | null;
  updatedQueue: QueuedChallenger[];
  wasSeatLocked: boolean;
} {
  const { senderActorId, activeChallenger, queue, updatedEntry } = params;
  const isSameActive = senderActorId === activeChallenger.actorId;

  if (isSameActive) {
    return {
      updatedActive: {
        ...activeChallenger,
        gender: updatedEntry.gender,
        age: updatedEntry.age,
        character: updatedEntry.character,
      },
      updatedQueue: queue,
      wasSeatLocked: false,
    };
  }

  return {
    updatedActive: null,
    updatedQueue: enqueueChallengerWithPriority(queue, updatedEntry),
    wasSeatLocked: true,
  };
}

// ============================================================================
// TURN CLOCK & AFK / READY-CHECK STATE MACHINE
// ============================================================================

export interface TurnClockInput {
  secondsLeft: number;
  awaitingReadyCheck: boolean;
  afkStrikes: number;
  queueLength: number;
  mode: LiveControlMode;
}

export type TurnClockAction =
  | { type: 'none' }
  | { type: 'warn_10s' }
  | { type: 'ready_timeout_rotate' }
  | { type: 'ready_timeout_extend' }
  | { type: 'afk_auto_move_warn'; nextStrikes: number }
  | { type: 'afk_rotate_challenger' }
  | { type: 'crowd_vote_commit' };

export function evaluateTurnClockTransition(input: TurnClockInput): TurnClockAction {
  const { secondsLeft, awaitingReadyCheck, afkStrikes, queueLength, mode } = input;

  if (mode === 'crowd_vote') {
    if (secondsLeft <= 0) return { type: 'crowd_vote_commit' };
    return { type: 'none' };
  }

  if (secondsLeft === 10 && !awaitingReadyCheck) {
    return { type: 'warn_10s' };
  }

  if (secondsLeft > 0) {
    return { type: 'none' };
  }

  if (awaitingReadyCheck) {
    return queueLength > 0
      ? { type: 'ready_timeout_rotate' }
      : { type: 'ready_timeout_extend' };
  }

  const nextStrikes = afkStrikes + 1;
  if (nextStrikes >= 2 && queueLength > 0) {
    return { type: 'afk_rotate_challenger' };
  }
  return { type: 'afk_auto_move_warn', nextStrikes };
}

// ============================================================================
// CROWD VOTE TRACKER ("Cả phòng live hợp sức đấu Kỳ Ma")
// ============================================================================

export interface CrowdVoteEntry {
  notation: string;
  move: Move;
  count: number;
  percent: number;
  voters: string[];
}

export interface CrowdVoteState {
  /** usernameLower -> { notation, move, displayUser } */
  votesByUser: Record<string, { notation: string; move: Move; displayUser: string }>;
  totalVotes: number;
}

export function createEmptyCrowdVote(): CrowdVoteState {
  return { votesByUser: {}, totalVotes: 0 };
}

export function recordCrowdVote(
  state: CrowdVoteState,
  username: string,
  move: Move,
  grid: BoardState['grid'],
  voterId?: string,
): CrowdVoteState {
  const key = (voterId ?? username).trim().toLowerCase() || 'viewer';
  const notation = formatMoveVietnamese(grid, move);
  const nextMap = {
    ...state.votesByUser,
    [key]: { notation, move, displayUser: username },
  };
  return {
    votesByUser: nextMap,
    totalVotes: Object.keys(nextMap).length,
  };
}

export function tallyCrowdVotes(state: CrowdVoteState, limit = 3): CrowdVoteEntry[] {
  const grouped = new Map<string, { move: Move; voters: string[] }>();
  for (const v of Object.values(state.votesByUser)) {
    const bucket = grouped.get(v.notation);
    if (bucket) {
      bucket.voters.push(v.displayUser);
    } else {
      grouped.set(v.notation, { move: v.move, voters: [v.displayUser] });
    }
  }

  const total = Math.max(1, state.totalVotes);
  const entries: CrowdVoteEntry[] = [];
  for (const [notation, data] of grouped.entries()) {
    entries.push({
      notation,
      move: data.move,
      count: data.voters.length,
      percent: Math.round((data.voters.length / total) * 100),
      voters: data.voters,
    });
  }

  entries.sort((a, b) => b.count - a.count);
  return entries.slice(0, limit);
}

// ============================================================================
// EXPRESSIVE LIVE INTERACTION SCRIPTS (SYNCED GESTURE + EMOTION + HONEST PRONOUNS)
// ============================================================================

export type InteractionBeatKind =
  | 'backseat_coach'
  | 'viewer_spotlight'
  | 'challenger_banter'
  | 'move_ambiguous'
  | 'move_illegal'
  | 'undo_tease'
  | 'draw_offer_response'
  | 'resign_outro'
  | 'hint_reveal'
  | 'ready_check_call'
  | 'afk_warn_10s'
  | 'afk_auto_move'
  | 'afk_rotate'
  | 'crowd_vote_commit'
  | 'concession_refused'
  | 'concession_claim';

function pickFresh(pool: string[], recentLines: string[] = []): string {
  const recentSet = new Set(recentLines.slice(-8));
  const fresh = pool.filter((s) => !recentSet.has(s));
  const list = fresh.length > 0 ? fresh : pool;
  return list[Math.floor(Math.random() * list.length)];
}

export function buildLiveInteractionScript(params: {
  kind: InteractionBeatKind;
  challengerName: string;
  guestGender: GuestGender;
  guestAge: number;
  viewerName?: string;
  viewerText?: string;
  suggestedNotation?: string;
  candidateNotations?: string[];
  bestHintNotation?: string;
  redScore?: number;
  nextChallengerName?: string;
  voteCount?: number;
  /** Which 让子 protection just stopped the challenger's capture. */
  shield?: ShieldKind;
  /** The rung's own announcement, straight from the handicap ladder's copy. */
  concessionClaim?: string;
  recentLines?: string[];
}): PerformanceScript {
  const {
    kind,
    challengerName,
    guestGender,
    guestAge,
    viewerName = 'khách quý',
    suggestedNotation,
    candidateNotations = [],
    bestHintNotation,
    redScore = 0,
    nextChallengerName,
    voteCount = 0,
    recentLines = [],
  } = params;

  const p = resolvePronounProfile(guestGender, guestAge);
  const cleanGuest = challengerName.replace(/^@/, '');
  const cleanViewer = viewerName.replace(/^@/, '');

  const build = (
    line: string,
    emotion: HostEmotion,
    gesture: PerformanceGesture,
    stageDirection: string,
    motif: string,
  ): PerformanceScript => ({
    line,
    emotion,
    gesture,
    stageDirection,
    motif,
    phase: 'trung_cuoc',
    phaseLabel: 'Tương Tác Live',
  });

  if (kind === 'backseat_coach') {
    const line = pickFresh(
      [
        `Ơ kìa ${cleanViewer}... định phím nước cờ cho ${p.guest} hả? ${p.selfCap} nghe thấy hết rồi nha — ${p.audience} chứng giám giúp ${p.self} đi!`,
        `Ái chà ${cleanViewer} ơi! ${p.audience} đừng mách bài cho ${p.guest} chứ — để ${p.guest} tự đấu xem bản lĩnh tới đâu nào!`,
        `Hì hì... bắt quả tang ${cleanViewer} đang nhắc tuồng kìa! ${p.guestCap} mà nghe theo nước ấy thì cẩn thận sập bẫy của ${p.self} nha!`,
      ],
      recentLines,
    );
    return build(
      line,
      'amused',
      'tease',
      'Khẽ hé quạt lụa đỏ liếc về phía khán giả phòng live',
      'Bắt Quả Tang Mách Nước',
    );
  }

  if (kind === 'viewer_spotlight') {
    const line = pickFresh(
      [
        `Cảm ơn ${cleanViewer} ghé chòi hồ sen nha! Ai muốn lên đài thử sức với ${p.self} thì cứ gõ chấm than chơi liền tay nhé!`,
        `Hì hì... nghe ${cleanViewer} nói mà ${p.self} mát lòng quá! ${p.audience} thả tim giữ nhiệt cho ván cờ đêm trăng này đi nào!`,
        `Ôi ${cleanViewer} tinh mắt thật đó! Chờ xong ván này với ${cleanGuest}, ${p.self} mời ${cleanViewer} lên chòi thưởng trà làm một ván nhé!`,
      ],
      recentLines,
    );
    return build(
      line,
      'amused',
      'closeup_talk',
      'Mỉm cười dịu dàng quay sang giao lưu trực diện với khán giả',
      'Giao Lưu Phòng Live',
    );
  }

  if (kind === 'challenger_banter') {
    const line = pickFresh(
      [
        `Hì hì... ${p.guest} nói ngọt thế mà tay vẫn chưa chịu hạ quân kìa! Đi nhanh đi, ${p.audience} đang hóng lắm rồi đó!`,
        `Ái chà ${cleanGuest} ơi... miệng thì khiêm tốn thế thôi, chứ ${p.self} biết ${p.guest} đang giấu sát chiêu trong tay áo đúng không?`,
        `Ồ... ${p.guest} vừa chuyện trò vừa đấu trí à? Cẩn thận phân tâm là ${p.self} thu phục ngay chủ lực của ${p.guest} đó nha!`,
      ],
      recentLines,
    );
    return build(
      line,
      'amused',
      'tease',
      'Nghiêng đầu cười duyên sau vành quạt đáp lời đối thủ',
      'Đối Đáp Hoa Chúc',
    );
  }

  if (kind === 'move_ambiguous') {
    const opts = candidateNotations.slice(0, 2).join(' hay ');
    const line = opts
      ? `Khoan đã ${p.guest} ơi... có tới hai nước đều khớp — ${p.guest} muốn đi ${opts}? Nhắn hoặc đọc rõ giúp ${p.self} nha!`
      : `Ấy khoan ${p.guest} ơi... nước vừa rồi hơi mơ hồ, ${p.guest} nói rõ số cột để ${p.self} hạ quân chuẩn xác nha!`;
    return build(
      line,
      'thinking',
      'think_fan',
      'Khẽ nghiêng đầu dò lại bàn cờ, chờ khách chốt nước rõ ràng',
      'Hỏi Lại Nước Đi',
    );
  }

  if (kind === 'move_illegal') {
    const line = pickFresh(
      [
        `Ấy chết ${p.guest} ơi... nước đó đang bị cản chân hoặc phạm luật rồi! ${p.guest} nhìn kỹ bàn cờ rồi chọn nước khác cho ${p.self} nha!`,
        `Hì hì... ${p.guest} vội quá đi lạc lối rồi kìa! Quân đó chưa đi được ô ấy đâu — bình tĩnh chọn lại nước khác nhé!`,
      ],
      recentLines,
    );
    return build(
      line,
      'amused',
      'tease',
      'Khẽ lắc đầu mỉm cười nhắc luật dịu dàng',
      'Nhắc Luật Duyên Dáng',
    );
  }

  if (kind === 'undo_tease') {
    const line = pickFresh(
      [
        `Ối giời ơi ${p.guest} ơi! Hạ thủ bất hoàn mà lại đòi đi lại à... trừ khi ${p.guest} tặng ${p.self} một đóa hoa hồng thì ${p.self} mới xiêu lòng nha!`,
        `Hì hì... ${p.audience} xem kìa, ${p.guest} vừa hạ quân xong đã muốn thu về rồi! Không được đâu — đánh tiếp đi nào!`,
      ],
      recentLines,
    );
    return build(
      line,
      'amused',
      'tease',
      'Che quạt cười tinh nghịch trêu khách đòi đi lại',
      'Hạ Thủ Bất Hoàn',
    );
  }

  if (kind === 'draw_offer_response') {
    // Black (Kỳ Ma) is winning if redScore <= -130
    if (redScore <= -130) {
      return build(
        `Hì hì... ${p.self} đang chiếm thượng phong mà ${p.guest} đã vội xin hòa rồi sao? Không dễ thế đâu — đánh hết sức với ${p.self} đi nào!`,
        'fierce',
        'tease',
        'Nhếch môi đầy tự tin khẽ khép quạt từ chối cầu hòa',
        'Từ Chối Cầu Hòa',
      );
    }
    return build(
      `Thế cờ này đúng là cân tài cân sức thật đó... ${p.self} nể mặt ${p.guest} đồng ý bắt tay giảng hòa, hẹn tái đấu ván sau nhé!`,
      'calm',
      'sip_tea',
      'Nâng chén trà sen gật đầu chấp thuận giảng hòa',
      'Bắt Tay Giảng Hòa',
    );
  }

  if (kind === 'resign_outro') {
    return build(
      `Ái chà... ${p.guest} chịu nhường phần thắng cho ${p.self} sớm vậy sao? Đa tạ ${cleanGuest} đã góp vui đêm trăng — mời kỳ thủ kế tiếp lên đài nào!`,
      'victory',
      'sip_tea',
      'Ung dung nâng chén trà chúc mừng ván cờ kết thúc êm đẹp',
      'Nhận Thua Khải Hoàn',
    );
  }

  if (kind === 'hint_reveal') {
    const line = bestHintNotation
      ? `Hì hì... ${p.self} thương tình bật mí nhẹ một tia kiếm ý nha: ${p.guest} thử ngó hướng ${bestHintNotation} xem sao — chỉ mách lần này thôi đó!`
      : `Tia kiếm ý đang sáng ngay trên bàn cờ đó ${p.guest} ơi — ${p.guest} tinh mắt chọn đường đẹp nhất nha!`;
    return build(
      line,
      'amused',
      'think_fan',
      'Khẽ chỉ đầu quạt lụa hướng về thế cờ gợi mở',
      'Mách Nhẹ Kiếm Ý',
    );
  }

  if (kind === 'ready_check_call') {
    return build(
      `Chào mừng ${cleanGuest} vừa bước lên chòi hồ sen! ${p.guestCap} gõ nước mở màn hoặc nhắn sẵn sàng trong hai mươi giây để khai cuộc với ${p.self} nha!`,
      'amused',
      'closeup_talk',
      'Vẫy tay chào đón người được chọn vừa lên đài',
      'Mời Khách Lên Đài',
    );
  }

  if (kind === 'afk_warn_10s') {
    return build(
      `Còn mười giây nữa thôi ${p.guest} ơi! Nhanh tay gửi nước đi kẻo ${p.audience} sốt ruột chờ kèo nha!`,
      'surprised',
      'tease',
      'Khẽ phẩy quạt thúc giục đồng hồ đếm ngược',
      'Thúc Giục Thời Gian',
    );
  }

  if (kind === 'afk_auto_move') {
    return build(
      `Hết giờ mất rồi ${p.guest} ơi... ${p.self} nhờ kiếm ý đi tạm một nước giữ nhịp live nhé — lượt sau ${p.guest} nhớ ra chiêu kịp giờ nha!`,
      'thinking',
      'sip_tea',
      'Khẽ thở dài dịu dàng giữ nhịp trận đấu không bị gián đoạn',
      'Giữ Nhịp Phòng Live',
    );
  }

  if (kind === 'afk_rotate') {
    const nextText = nextChallengerName
      ? `Mời ${nextChallengerName.replace(/^@/, '')} từ hàng đợi bước lên tiếp chiêu ngay nào!`
      : `Ai muốn lên đài thì gõ chấm than chơi liền tay nhé!`;
    return build(
      `Có vẻ ${cleanGuest} bận việc rời chòi rồi... ${p.self} xin phép nhường ghế lại nha! ${nextText}`,
      'calm',
      'closeup_talk',
      'Xoay người duyên dáng mời kỳ thủ tiếp theo lên bàn cờ',
      'Luân Chuyển Kỳ Đài',
    );
  }

  if (kind === 'concession_refused') {
    // The rule is said exactly as the ladder writes it, so the spoken concession and the banner
    // cannot drift apart.
    const line = renderSpeechTokens(CONCESSION_LINE_VI[params.shield ?? 'thiet_binh'], {
      guestGender,
      guestAge,
      challengerName,
    });
    return build(
      line,
      'amused',
      'tease',
      'Giơ quạt lụa chặn tay khách giữa bàn, mỉm cười nhắc lệ chấp quân',
      'Nhắc Lệ Chấp Quân',
    );
  }

  if (kind === 'concession_claim') {
    const line = params.concessionClaim
      ? renderSpeechTokens(params.concessionClaim, { guestGender, guestAge, challengerName })
      : `Đêm nay ${p.self} đi thuận cờ, không chấp một quân nào - ${p.guest} chịu đủ áp lực nhé ${p.audience} ơi.`;
    return build(
      line,
      'calm',
      'closeup_talk',
      'Tuyên bố lệ chấp trước ống kính, tay rút bớt quân khỏi bàn khai cuộc',
      'Tuyên Bố Chấp Quân',
    );
  }

  // crowd_vote_commit
  const moveLabel = suggestedNotation ? `nước ${suggestedNotation}` : 'nước cao phiếu nhất';
  return build(
    `Chốt sổ rồi ${p.audience} ơi! Với ${voteCount || 1} phiếu áp đảo, cả phòng live đã đồng tâm hạ ${moveLabel} — để xem ${p.self} đỡ chiêu này ra sao nha!`,
    'fierce',
    'closeup_talk',
    'Ánh mắt rực sáng đón nhận nước cờ đồng tâm của cả phòng live',
    'Toàn Phòng Đồng Tâm',
  );
}
