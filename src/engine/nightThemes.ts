/**
 * The six-night rotation (lục lễ): each broadcast evening owns one hồi môn layer, one opening
 * the Kỳ Ma actually steers toward, one signature kill pattern, six lines of night-specific
 * teasing, and the asset set the art spec has to render.
 *
 * Coordinates follow the engine board: row 0 is Black's back rank, row 9 Red's; Red numbers
 * files right-to-left (file = 9 - col) and Black left-to-right (file = col + 1).
 */

import {
  HANDICAP_LADDER,
  handicapFor,
  type ConcessionChoice,
  type Handicap,
} from './handicap';
import type { KillPatternId } from './patterns';
import { patternNameVi } from './patterns';
import type { BridalLadder, DowryLayerId } from './bridalLadder';
import { isHeld, layerById } from './bridalLadder';
import type { BoardState, Coord, PieceType, Side } from './xiangqi';
import type { HostEmotion } from '../scene/portraitKinematics';
import type { PerformanceGesture } from './livePerformance';

export type RedOpeningShape =
  | 'phao_dau'
  | 'tien_nhan_chi_lo'
  | 'khoi_ma'
  | 'phi_tuong'
  | 'bat_ky';

/** A named ply of the night's book line, so tests can replay it on the real board. */
export interface NightBookPly {
  side: Side;
  type: PieceType;
  from: Coord;
  to: Coord;
  notation: string;
}

export interface NightCopyContext {
  board: BoardState;
  ladder: BridalLadder;
}

export interface NightPromptFacts {
  openingShape: RedOpeningShape;
  headlineLayerHeld: boolean;
  concessionNameVi: string;
}

export interface NightTease {
  line: string;
  emotion: HostEmotion;
  gesture: PerformanceGesture;
  stageDirection: string;
  when?: (context: NightCopyContext) => boolean;
}

export interface NightTheme {
  index: 1 | 2 | 3 | 4 | 5 | 6;
  /** Spoken and shown as the evening's chapter title. */
  nameVi: string;
  taglineVi: string;
  /** Red's first ply as the guest sees it: the invitation the night is built around. */
  invite: NightBookPly;
  /** What Red had to play for this night's line to be the answer on the board. */
  shape: RedOpeningShape;
  /** Kỳ Ma's reply (her first ply) - favoured by the search, never forced over a refutation. */
  answer: NightBookPly;
  /** Red's customary second ply, recorded so her third ply is only tried in that position. */
  bridge: NightBookPly;
  /** Kỳ Ma's continuation (her second ply). */
  follow: NightBookPly;
  focusPattern: KillPatternId;
  headlineLayer: DowryLayerId;
  /**
   * The rung this evening proposes, when it plays a conceding game at all. It is only a default:
   * the operator's link or last saved pick outranks it, and a night without one stays an even game.
   */
  concession?: ConcessionChoice;
  teases: NightTease[];
  /** [stage, bride look, overlay motif] asset ids for docs/art/IMAGE-SPEC.md. */
  assets: [string, string, string];
}

export const NIGHT_COUNT = 6;

const sq = (row: number, col: number): Coord => ({ row, col });

const ply = (
  side: Side,
  type: PieceType,
  from: [number, number],
  to: [number, number],
  notation: string,
): NightBookPly => ({
  side,
  type,
  from: sq(from[0], from[1]),
  to: sq(to[0], to[1]),
  notation,
});

function pieceCells(context: NightCopyContext, side: Side, type: PieceType): Coord[] {
  const cells: Coord[] = [];
  context.board.grid.forEach((row, rowIndex) => {
    row.forEach((piece, colIndex) => {
      if (piece?.side === side && piece.type === type) cells.push(sq(rowIndex, colIndex));
    });
  });
  return cells;
}

function pieceAt(
  context: NightCopyContext,
  side: Side,
  type: PieceType,
  row: number,
  col: number,
): boolean {
  const piece = context.board.grid[row][col];
  return piece?.side === side && piece.type === type;
}

function piecesAwayFromHome(
  context: NightCopyContext,
  side: Side,
  type: 'horse' | 'chariot',
): Coord[] {
  const homeCols = type === 'horse' ? [1, 7] : [0, 8];
  const homeRow = side === 'black' ? 0 : 9;
  return pieceCells(context, side, type).filter(
    (cell) => cell.row !== homeRow || !homeCols.includes(cell.col),
  );
}

function holdsLayer(context: NightCopyContext, id: DowryLayerId): boolean {
  return isHeld(context.ladder, id);
}

export const NIGHT_THEMES: readonly NightTheme[] = [
  {
    index: 1,
    nameVi: 'Đêm Thứ Nhất · Quạt Lụa',
    taglineVi: 'Đêm khai đài: chưa mở quạt, chưa vội ra đòn.',
    invite: ply('red', 'soldier', [6, 2], [5, 2], 'B7 tiến 1'),
    shape: 'tien_nhan_chi_lo',
    answer: ply('black', 'horse', [0, 7], [2, 6], 'M8 tiến 7'),
    bridge: ply('red', 'horse', [9, 7], [7, 6], 'M2 tiến 3'),
    follow: ply('black', 'horse', [0, 1], [2, 2], 'M2 tiến 3'),
    focusPattern: 'qua_giac_ma',
    headlineLayer: 'qua_tay_lua',
    teases: [
      {
        line: `Đêm đầu tiên trên kỳ đài, {self} vẫn chưa mở quạt đâu {guest}! Mời {guest} dùng {opening} - {audience} đang chờ xem bản lĩnh đây.`,
        emotion: 'amused',
        gesture: 'tease',
        stageDirection: 'Giữ chặt quạt lụa trước ngực, khẽ nghiêng đầu mời khai cuộc',
        when: (context) => context.board.moveCount === 0,
      },
      {
        line: `Ngựa giấu dưới cỏ mới là ngựa đáng sợ, {guest} ạ! {self} đang nhắm thế {pattern} - {name} có nhận ra không?`,
        emotion: 'thinking',
        gesture: 'think_fan',
        stageDirection: 'Phẩy quạt chậm theo nhịp bàn cờ',
      },
      {
        line: `Trà đêm nay rót đầy mà {guest} còn mải nhìn bàn cờ! {layer} của {self} vẫn còn nguyên đó, đừng mơ lấy sớm~`,
        emotion: 'calm',
        gesture: 'sip_tea',
        stageDirection: 'Nâng chén trà sen, ánh mắt bình thản quan sát đối thủ',
        when: (context) => holdsLayer(context, 'qua_tay_lua'),
      },
      {
        line: `{capGuest} đi chắc tay thật, nhưng đêm thứ nhất là đêm của {self}! Hai con ngựa đã vào thế, nước sau mới ra đòn.`,
        emotion: 'fierce',
        gesture: 'closeup_talk',
        stageDirection: 'Hạ thấp giọng, thần thái tập trung khi thế trận khép dần',
        when: (context) => piecesAwayFromHome(context, 'black', 'horse').length === 2,
      },
      {
        line: `{audience} để ý nhé: đêm nay {self} chỉ đánh bằng một nửa tay - nửa kia để dành cho đêm sau!`,
        emotion: 'amused',
        gesture: 'tease',
        stageDirection: 'Che nửa mặt sau tán quạt, nháy mắt với phòng live',
      },
      {
        line: `Khai đài mà {guest} để {self} giữ nhịp ngựa thì {pattern} sẽ tới sớm lắm đấy - cẩn thận kẻo {layer} bay đi mất nha!`,
        emotion: 'fierce',
        gesture: 'closeup_talk',
        stageDirection: 'Chỉ tay vào ô khuyết giữa bàn, giọng nhắc nhở đầy uy lực',
        when: (context) => context.board.moveCount === 0 && holdsLayer(context, 'qua_tay_lua'),
      },
    ],
    assets: ['d1-quan-lua.stage', 'd1-quan-lua.bride-calm', 'd1-quan-lua.overlay'],
  },
  {
    index: 2,
    nameVi: 'Đêm Thứ Hai · Kiềng Ngọc',
    taglineVi: 'Hai pháo soi nhau giữa bàn, ai nhường trước người ấy mất.',
    invite: ply('red', 'cannon', [7, 7], [7, 4], 'P2 bình 5'),
    shape: 'phao_dau',
    answer: ply('black', 'cannon', [2, 7], [2, 4], 'P8 bình 5'),
    bridge: ply('red', 'horse', [9, 7], [7, 6], 'M2 tiến 3'),
    follow: ply('black', 'horse', [0, 7], [2, 6], 'M8 tiến 7'),
    focusPattern: 'bach_kiem_tuong',
    headlineLayer: 'kieng_hoi_mon',
    teases: [
      {
        line: `Đêm thứ hai rồi {guest} ơi! Pháo của {self} soi thẳng vào pháo của {guest} - ai nản trước, người đó chịu.`,
        emotion: 'fierce',
        gesture: 'closeup_talk',
        stageDirection: 'Ánh mắt sắc lẹm nhìn xuyên qua hai khẩu pháo đối chọi',
        when: (context) =>
          pieceAt(context, 'black', 'cannon', 2, 4) && pieceAt(context, 'red', 'cannon', 7, 4),
      },
      {
        line: `{opening} là thế {self} thích nhất! Đường giữa căng nhất bàn cờ - chỉ một nước hớ là {pattern} gọi tên.`,
        emotion: 'thinking',
        gesture: 'think_fan',
        stageDirection: 'Quạt dừng lại, ngón tay gõ khẽ lên thành kỳ đài',
      },
      {
        line: `Kiềng ngọc nặng lắm {guest} ạ, {self} đeo từ nhỏ. Muốn nghe tiếng nó rơi thì {guest} phải phá được trung lộ đã!`,
        emotion: 'amused',
        gesture: 'tease',
        stageDirection: 'Khẽ đưa tay lên cổ rồi cười nhẹ',
        when: (context) => holdsLayer(context, 'kieng_hoi_mon'),
      },
      {
        line: `{capSelf} không vội. {audience} thấy nè: {name} cứ suy nghĩ cho kỹ, còn {self} rót thêm một chén trà~`,
        emotion: 'calm',
        gesture: 'sip_tea',
        stageDirection: 'Thong thả nhấp trà, cố tình để đồng hồ đếm thêm vài nhịp',
      },
      {
        line: `Cùng một cột pháo mà {guest} đi sau là chịu thiệt. Đổi hướng đi {guest}, đừng để {pattern} gọi tên!`,
        emotion: 'fierce',
        gesture: 'closeup_talk',
        stageDirection: 'Nghiêng người về trước, giọng hạ thấp đầy cảnh báo',
        when: (context) =>
          pieceAt(context, 'black', 'cannon', 2, 4) && pieceAt(context, 'red', 'cannon', 7, 4),
      },
      {
        line: `Đêm nay {self} đánh thẳng, không vòng. Ai giữ nổi hai vị tướng cách nhau một bàn cờ người?`,
        emotion: 'amused',
        gesture: 'tease',
        stageDirection: 'Mở hé quạt lụa, mỉm cười đầy thách thức',
      },
    ],
    assets: ['d2-kieng-ngoc.stage', 'd2-kieng-ngoc.bride-defiant', 'd2-kieng-ngoc.overlay'],
  },
  {
    index: 3,
    nameVi: 'Đêm Thứ Ba · Mũ Phượng',
    taglineVi: 'Ngựa nằm trong cỏ, mũ phượng nghiêng trên đầu.',
    invite: ply('red', 'horse', [9, 7], [7, 6], 'M2 tiến 3'),
    shape: 'khoi_ma',
    answer: ply('black', 'cannon', [2, 1], [2, 4], 'P2 bình 5'),
    bridge: ply('red', 'chariot', [9, 8], [9, 7], 'X1 bình 2'),
    follow: ply('black', 'horse', [0, 7], [2, 6], 'M8 tiến 7'),
    focusPattern: 'ngo_tao_ma',
    headlineLayer: 'mu_phuong',
    // The night the club asks her to give a horse, and it has to be the left one: her own scripted
    // reply here is M8 tiến 7, the (0,7) horse climbing to the ngọa tào square. Take that horse off
    // and the evening's signature line is a story about a stone that is not on the board.
    concession: { id: 'chap_mot_ma', flank: 'ben_trai' },
    teases: [
      {
        line: `{guest} mở bằng ngựa? Đêm nay {self} sẽ trả lời bằng pháo! {opening} của {guest} đã mở sẵn đường giữa - {self} chỉ việc bước vào.`,
        emotion: 'amused',
        gesture: 'tease',
        stageDirection: 'Gạt khẩu pháo vào giữa bàn rồi khẽ cười với đối thủ',
        when: (context) =>
          detectRedOpeningShape(context.board.grid) === 'khoi_ma' &&
          pieceAt(context, 'black', 'cannon', 2, 4),
      },
      {
        line: `Ngựa nằm ở rãnh mới gọi là {pattern}! {self} còn ẩn một nhịp nữa thôi - {guest} đừng chủ quan, kẻo mất ngủ tới sáng.`,
        emotion: 'fierce',
        gesture: 'closeup_talk',
        stageDirection: 'Chỉ tay vào ô rãnh ngựa, ánh mắt rực lên nước đi sắp tới',
        when: (context) =>
          pieceAt(context, 'black', 'horse', 2, 2) || pieceAt(context, 'black', 'horse', 2, 6),
      },
      {
        line: `Mũ phượng nặng lắm {guest} ơi - nặng vì cả {audience} đang đội cùng {self}. Rơi lúc nào là mất vui lúc đó~`,
        emotion: 'calm',
        gesture: 'sip_tea',
        stageDirection: 'Sửa lại chiếc mũ phượng, giọng trầm xuống đầy tự tôn',
        when: (context) => holdsLayer(context, 'mu_phuong'),
      },
      {
        line: `{name} ơi, xe của {guest} đã ra biên rồi đó! Nhưng ngựa của {self} còn ẩn kín hơn nhiều.`,
        emotion: 'thinking',
        gesture: 'think_fan',
        stageDirection: 'Phẩy quạt che nửa gương mặt, đọc đường ngựa đang dọn',
        when: (context) => piecesAwayFromHome(context, 'red', 'chariot').length > 0,
      },
      {
        line: `Đêm thứ ba là đêm của ngựa. {guest} thấy {self} đi chậm - nhưng {layer} đang rung từng nhịp đấy!`,
        emotion: 'fierce',
        gesture: 'closeup_talk',
        stageDirection: 'Nhịp tay theo thế cờ, hơi thở gấp dần vì hứng khởi',
        when: (context) => holdsLayer(context, 'mu_phuong'),
      },
      {
        line: `Ai chơi với {self} cũng quên mất con ngựa phía sau pháo. {guest} có muốn là người đầu tiên nhớ ra không?`,
        emotion: 'amused',
        gesture: 'tease',
        stageDirection: 'Che quạt cười, cố tình liếc sang ô ngựa ẩn',
        when: (context) =>
          (pieceAt(context, 'black', 'horse', 0, 1) && pieceAt(context, 'black', 'cannon', 2, 1)) ||
          (pieceAt(context, 'black', 'horse', 0, 7) && pieceAt(context, 'black', 'cannon', 2, 7)),
      },
    ],
    assets: ['d3-mu-phuong.stage', 'd3-mu-phuong.bride-fierce', 'd3-mu-phuong.overlay'],
  },
  {
    index: 4,
    nameVi: 'Đêm Thứ Tư · Hài Thêu',
    taglineVi: 'Then cài chặt, xe đã lên, hài còn nguyên mũi thêu.',
    invite: ply('red', 'elephant', [9, 6], [7, 4], 'T3 tiến 5'),
    shape: 'phi_tuong',
    answer: ply('black', 'cannon', [2, 7], [2, 4], 'P8 bình 5'),
    bridge: ply('red', 'horse', [9, 1], [7, 2], 'M8 tiến 7'),
    follow: ply('black', 'chariot', [0, 8], [1, 8], 'X9 tiến 1'),
    focusPattern: 'thiet_mon_thuyen',
    headlineLayer: 'hai_theu',
    teases: [
      {
        line: `Tượng bay lên mà trung cung vẫn trống! {self} chiếm pháo trước nhé - {opening} là then cài của đêm nay.`,
        emotion: 'amused',
        gesture: 'tease',
        stageDirection: 'Đẩy khẩu pháo vào trung lộ rồi khép quạt đầy thoả mãn',
        when: (context) =>
          detectRedOpeningShape(context.board.grid) === 'phi_tuong' &&
          pieceAt(context, 'black', 'cannon', 2, 4),
      },
      {
        line: `Xe lên một bước là {pattern} mở cửa. {guest} nghe tiếng then cài chưa, hay còn mải nhìn {layer}?`,
        emotion: 'fierce',
        gesture: 'closeup_talk',
        stageDirection: 'Nâng cao xe qua hàng quân, ánh mắt dán vào cửa cung đối thủ',
      },
      {
        line: `Hài thêu {self} đi cả tháng mới xong. {guest} phá được {pattern} thì {self} tự cởi, không cần ai nhắc.`,
        emotion: 'calm',
        gesture: 'sip_tea',
        stageDirection: 'Khẽ cúi nhìn mũi giày thêu, giọng nhẹ mà rất chắc',
        when: (context) => holdsLayer(context, 'hai_theu'),
      },
      {
        line: `{capGuest} thủ kỹ ghê! Tiếc là cửa giữa đã bị {self} khóa pháo rồi - {audience} đánh xem còn cửa nào không?`,
        emotion: 'thinking',
        gesture: 'think_fan',
        stageDirection: 'Quạt gõ nhịp lên thành kỳ đài khi đọc thế phòng thủ',
        when: (context) => pieceAt(context, 'black', 'cannon', 2, 4),
      },
      {
        line: `Đêm thứ tư, {self} đánh kiểu cửa quan: pháo giữ then, xe đứng canh. Chậm mà không lọt được đâu {guest}!`,
        emotion: 'fierce',
        gesture: 'closeup_talk',
        stageDirection: 'Ngồi thẳng người, hai tay xếp gọn thành thế trận then cài',
        when: (context) =>
          pieceAt(context, 'black', 'cannon', 2, 4) &&
          piecesAwayFromHome(context, 'black', 'chariot').length > 0,
      },
      {
        line: `{name} đừng đẩy tốt bừa! Mỗi con tốt tiến một bước là {layer} của {self} nhẹ đi một chút~`,
        emotion: 'amused',
        gesture: 'tease',
        stageDirection: 'Che quạt cười trêu, liếc nhanh sang hàng tốt',
        when: (context) => holdsLayer(context, 'hai_theu'),
      },
    ],
    assets: ['d4-hai-theu.stage', 'd4-hai-theu.bride-regal', 'd4-hai-theu.overlay'],
  },
  {
    index: 5,
    nameVi: 'Đêm Thứ Năm · Áo Gấm',
    taglineVi: 'Hai xe như hai tay áo, khoác vào là lạnh sống lưng.',
    invite: ply('red', 'cannon', [7, 1], [7, 4], 'P8 bình 5'),
    shape: 'phao_dau',
    answer: ply('black', 'horse', [0, 1], [2, 2], 'M2 tiến 3'),
    bridge: ply('red', 'horse', [9, 1], [7, 2], 'M8 tiến 7'),
    follow: ply('black', 'chariot', [0, 0], [0, 1], 'X1 bình 2'),
    focusPattern: 'song_xa_thac',
    headlineLayer: 'ao_choang',
    teases: [
      {
        line: `Đêm năm đã lạnh rồi {guest} ơi! {self} khoác áo gấm, hai xe giữ trận - {pattern} không đánh một cửa đâu.`,
        emotion: 'fierce',
        gesture: 'closeup_talk',
        stageDirection: 'Kéo nhẹ tay áo gấm, ánh mắt lần lượt quét hai chiếc xe',
        when: (context) => pieceCells(context, 'black', 'chariot').length === 2,
      },
      {
        line: `Một chiếc xe đã sang, chiếc kia vẫn canh góc. {name} định chặn cửa nào trước, hay để {audience} mách nước?`,
        emotion: 'amused',
        gesture: 'tease',
        stageDirection: 'Chỉ lần lượt hai chiếc xe, nở nụ cười đầy ẩn ý',
        when: (context) =>
          pieceAt(context, 'black', 'chariot', 0, 1) && pieceAt(context, 'black', 'chariot', 0, 8),
      },
      {
        line: `Áo gấm ấm lắm, nhưng {layer} này {self} chưa định cởi! Muốn thì {guest} phải sống sót qua hai xe đã~`,
        emotion: 'calm',
        gesture: 'sip_tea',
        stageDirection: 'Khoác lại vạt áo, nhấp trà bình thản giữa thế công',
        when: (context) =>
          holdsLayer(context, 'ao_choang') && pieceCells(context, 'black', 'chariot').length === 2,
      },
      {
        line: `Ngựa của {guest} có về chắn thì các xe phối hợp vẫn mở được đường - {pattern} tới gần lắm.`,
        emotion: 'thinking',
        gesture: 'think_fan',
        stageDirection: 'Gạt quạt sang bên, chăm chú quét hai hàng dọc của đối thủ',
      },
      {
        line: `{capSelf} không cần chiếu liên tục. Hai xe đứng so le là {guest} đã hết đường thở rồi!`,
        emotion: 'fierce',
        gesture: 'closeup_talk',
        stageDirection: 'Đặt hai chiếc xe so le, giọng hạ thấp như tuyên án',
        when: (context) => piecesAwayFromHome(context, 'black', 'chariot').length === 2,
      },
      {
        line: `Đêm thứ năm mà {guest} còn thủ thế thì trăng lặn trước khi cờ tàn mất! Ra đi, {self} đợi đây.`,
        emotion: 'amused',
        gesture: 'tease',
        stageDirection: 'Nhìn lên trời rồi quay lại bàn, gõ tay tỏ ý giục nước',
      },
    ],
    assets: ['d5-ao-gam.stage', 'd5-ao-gam.bride-cold', 'd5-ao-gam.overlay'],
  },
  {
    index: 6,
    nameVi: 'Đêm Thứ Sáu · Hoa Chúc',
    taglineVi: 'Đêm chót: nến còn cháy, dao đã kề, không còn nước để lùi.',
    invite: ply('red', 'soldier', [6, 6], [5, 6], 'B3 tiến 1'),
    shape: 'tien_nhan_chi_lo',
    answer: ply('black', 'cannon', [2, 7], [2, 6], 'P8 bình 7'),
    bridge: ply('red', 'horse', [9, 7], [7, 6], 'M2 tiến 3'),
    follow: ply('black', 'soldier', [3, 6], [4, 6], 'B7 tiến 1'),
    focusPattern: 'dai_dao_hoach_tam',
    headlineLayer: 'nen_hoa_chuc',
    teases: [
      {
        line: `Đêm cuối rồi {guest} ơi! Nến hoa chúc chỉ cháy một lần - {self} không giữ lại cho ai đâu.`,
        emotion: 'fierce',
        gesture: 'closeup_talk',
        stageDirection: 'Chỉnh lại ngọn nến hoa chúc, ánh mắt rực lên nước quyết định',
      },
      {
        line: `{pattern} là đòn không quay đầu. {guest} đi chậm một nhịp thôi là {layer} tàn cùng ván cờ.`,
        emotion: 'fierce',
        gesture: 'closeup_talk',
        stageDirection: 'Đặt tay lên quân tốt đã vượt hà, giọng trầm và chắc',
      },
      {
        line: `Sáu đêm rồi đó {name}! {self} còn lại đúng cây nến - {audience} ở lại xem tới nước cuối nhé~`,
        emotion: 'calm',
        gesture: 'sip_tea',
        stageDirection: 'Nâng chén trà chúc, khẽ hướng về phòng live trước khi khai thế',
        when: (context) =>
          context.ladder.held.length === 1 && holdsLayer(context, 'nen_hoa_chuc'),
      },
      {
        line: `Dù {capGuest} mở bằng tốt hay một nước khác - đêm nay {self} cũng chẳng cần vòng vo nữa.`,
        emotion: 'amused',
        gesture: 'tease',
        stageDirection: 'Khép gọn quạt lại, chỉ để hai tay trên bàn cờ',
        when: (context) => context.board.moveCount === 0,
      },
      {
        line: `Nến chảy tới chân rồi {guest} ạ. Ai sợ nến tắt trước thì người đó bỏ cuộc - {self} không bỏ.`,
        emotion: 'thinking',
        gesture: 'think_fan',
        stageDirection: 'Ngồi lặng quan sát, ánh nến hắt lên gương mặt căng thẳng',
      },
      {
        line: `Đêm chót thì đánh thẳng vào tim trận! {guest} còn nước nào giấu, giấu luôn đi kẻo hối hận đó~`,
        emotion: 'fierce',
        gesture: 'closeup_talk',
        stageDirection: 'Hất nhẹ tóc, thần thái Kỳ Ma hiện rõ trước đòn quyết định',
      },
    ],
    assets: ['d6-hoa-chuc.stage', 'd6-hoa-chuc.bride-finale', 'd6-hoa-chuc.overlay'],
  },
];

const SHAPE_PROBES: { shape: Exclude<RedOpeningShape, 'bat_ky'>; cells: [number, number][]; type: PieceType }[] = [
  { shape: 'phao_dau', cells: [[7, 4]], type: 'cannon' },
  { shape: 'tien_nhan_chi_lo', cells: [[5, 2], [5, 6]], type: 'soldier' },
  { shape: 'khoi_ma', cells: [[7, 6], [7, 2]], type: 'horse' },
  { shape: 'phi_tuong', cells: [[7, 4], [7, 0], [7, 8]], type: 'elephant' },
];

/** Classifies Red's opening from where Red's pieces ended up, not from a guessed move list. */
export function detectRedOpeningShape(grid: BoardState['grid']): RedOpeningShape {
  for (const probe of SHAPE_PROBES) {
    for (const [row, col] of probe.cells) {
      const piece = grid[row][col];
      if (piece && piece.side === 'red' && piece.type === probe.type) return probe.shape;
    }
  }
  return 'bat_ky';
}

export function nightThemeByIndex(index: number): NightTheme {
  const wrapped = ((Math.trunc(index) % NIGHT_COUNT) + NIGHT_COUNT) % NIGHT_COUNT;
  return NIGHT_THEMES[wrapped];
}

/**
 * Local-date rotation: six consecutive evenings walk the audience through six layers. Local
 * components with UTC arithmetic, because the boundary must be the broadcast day, not 07:00 ICT.
 */
export function nightIndexFromDate(date: Date): number {
  const dayInYear = Math.round(
    (Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) -
      Date.UTC(date.getFullYear(), 0, 0)) /
      86_400_000,
  );
  return ((dayInYear - 1) % NIGHT_COUNT + NIGHT_COUNT) % NIGHT_COUNT;
}

export function resolveNightTheme(date: Date, overrideIndex?: number): NightTheme {
  return nightThemeByIndex(
    typeof overrideIndex === 'number' && Number.isFinite(overrideIndex)
      ? overrideIndex - 1
      : nightIndexFromDate(date),
  );
}

export interface NightDowryStatus {
  layerNameVi: string;
  held: boolean;
  labelVi: string;
}

export function nightDowryStatus(theme: NightTheme, ladder: BridalLadder): NightDowryStatus {
  const layer = layerById(theme.headlineLayer);
  const held = isHeld(ladder, layer.id);
  return {
    layerNameVi: layer.nameVi,
    held,
    labelVi: held ? `Treo ${layer.nameVi}` : `Đã giao ${layer.nameVi}`,
  };
}

const sameSquare = (a: Coord, b: Coord): boolean => a.row === b.row && a.col === b.col;

function pieceOn(grid: BoardState['grid'], cell: Coord, side: Side, type: PieceType): boolean {
  const piece = grid[cell.row][cell.col];
  return !!piece && piece.side === side && piece.type === type;
}

/**
 * Squares the search should favour for Black's current ply. A book move is a nudge, not a command:
 * ai.ts adds 44cp to its exact root score, so a scripted ply only gets played when the engine's own
 * best answer is within that window - a refutation of tonight's opening still outvotes the script.
 */
export function nightBookFavour(
  theme: NightTheme,
  board: BoardState,
): { from: Coord; to: Coord }[] {
  if (board.turn !== 'black' || board.status !== 'playing') return [];

  // A conceded night has empty squares where the book expects a stone (让马 takes the horse the
  // answer is written from). The bonus only ever lands on an exact root move, so an absent piece is
  // inert today - this is what keeps it inert if the script ever becomes a command.
  if (board.moveCount === 1 && detectRedOpeningShape(board.grid) === theme.shape) {
    if (!pieceOn(board.grid, theme.answer.from, 'black', theme.answer.type)) return [];
    return [{ from: theme.answer.from, to: theme.answer.to }];
  }

  const lastMove = board.lastMove;
  if (
    board.moveCount === 3 &&
    lastMove &&
    lastMove.piece.side === 'red' &&
    sameSquare(lastMove.from, theme.bridge.from) &&
    sameSquare(lastMove.to, theme.bridge.to) &&
    pieceOn(board.grid, theme.answer.to, 'black', theme.answer.type) &&
    pieceOn(board.grid, theme.follow.from, 'black', theme.follow.type)
  ) {
    return [{ from: theme.follow.from, to: theme.follow.to }];
  }

  return [];
}

/** Tokens the night lines add on top of the shared commentary vocabulary. */
export const NIGHT_TOKENS = ['opening', 'pattern', 'layer'] as const;

/**
 * Spoken names for the four book shapes, using the wording `detectMoveMotif` already puts on the
 * banner so a night line and the motif chip never call the same opening two different things.
 */
const SHAPE_NAME_VI: Record<RedOpeningShape, string> = {
  phao_dau: 'Pháo Đầu Trấn Trung',
  tien_nhan_chi_lo: 'Tiên Nhân Chỉ Lộ',
  khoi_ma: 'Bình Phong Khởi Mã',
  phi_tuong: 'Phi Tượng Trấn Trung',
  bat_ky: 'Khai Cuộc Phổ Thông',
};

export function nightTeaseTokens(theme: NightTheme): Record<string, string> {
  return {
    // The invite is written as notation for the board; on air it is only ever the shape name,
    // because the show's rule is that Kỳ Ma describes a position, never reads a move record.
    opening: SHAPE_NAME_VI[theme.shape],
    pattern: patternNameVi(theme.focusPattern),
    layer: layerById(theme.headlineLayer).nameVi,
  };
}

export function redOpeningShapeNameVi(shape: RedOpeningShape): string {
  return SHAPE_NAME_VI[shape];
}

export function buildNightPromptFacts(
  theme: NightTheme,
  openingShape: RedOpeningShape,
  ladder: BridalLadder,
  handicap: Handicap,
): NightPromptFacts {
  return {
    openingShape,
    headlineLayerHeld: isHeld(ladder, theme.headlineLayer),
    concessionNameVi: handicap.nameVi,
  };
}

const OPENING_SHAPE_VALUES = new Set<RedOpeningShape>(
  Object.keys(SHAPE_NAME_VI) as RedOpeningShape[],
);
const CONCESSION_NAME_VALUES = new Set(
  HANDICAP_LADDER.flatMap((rung) =>
    (['ben_trai', 'ben_phai', 'ca_hai'] as const).map(
      (flank) => handicapFor(rung.id, flank).nameVi,
    ),
  ),
);

export function buildNightPromptState(
  theme: NightTheme,
  rawFacts: unknown,
  self: string,
  guest: string,
): string {
  const facts =
    rawFacts && typeof rawFacts === 'object' ? (rawFacts as Record<string, unknown>) : {};
  const openingShape = OPENING_SHAPE_VALUES.has(facts.openingShape as RedOpeningShape)
    ? (facts.openingShape as RedOpeningShape)
    : null;
  const headlineLayerHeld =
    typeof facts.headlineLayerHeld === 'boolean' ? facts.headlineLayerHeld : null;
  const concessionNameVi =
    typeof facts.concessionNameVi === 'string' && CONCESSION_NAME_VALUES.has(facts.concessionNameVi)
      ? facts.concessionNameVi
      : null;
  const copy = nightTeaseTokens(theme);
  const openingState = openingShape
    ? `Khai cuộc thực tế: ${redOpeningShapeNameVi(openingShape)}.`
    : 'Khai cuộc thực tế chưa được xác minh; không được nói tên opening.';
  const layerState =
    headlineLayerHeld === true
      ? `Lớp hồi môn trọng tâm "${copy.layer}" vẫn đang treo.`
      : headlineLayerHeld === false
        ? `Lớp hồi môn trọng tâm "${copy.layer}" đã giao; không được nhắc nó như một phần thưởng còn trên bàn.`
        : `Trạng thái lớp hồi môn trọng tâm "${copy.layer}" chưa được xác minh; không được khẳng định nó còn hay đã mất.`;
  const concessionState = concessionNameVi
    ? `Chấp đang chơi: ${concessionNameVi}. Chỉ được nhắc quân thực sự đã rút theo chấp này.`
    : 'Chấp đang chơi chưa được xác minh; không được bịa quân đã rút.';

  return (
    `Đêm ${theme.index}/6 — "${theme.nameVi}": ${theme.taglineVi} ` +
    `Sách khai cuộc của đêm: ${copy.opening}. ${openingState} ` +
    `Thế đêm nay ${self} đang nhắm là ${copy.pattern}; ${layerState} ${concessionState} ` +
    `CHỈ được hứa, TUYỆT ĐỐI không nói đã khóa được ${guest} ` +
    `hay đã lấy được "${copy.layer}" của ${self}.`
  );
}
