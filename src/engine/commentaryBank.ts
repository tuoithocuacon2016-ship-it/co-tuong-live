import type { PerformanceGesture, TacticalEventType } from './livePerformance';
import type { HostEmotion } from '../scene/portraitKinematics';
import type { KillPatternId } from './patterns';

/**
 * Four ways the same tactical event can sound. `thuong` is the base pool already living in
 * `buildMovePerformanceScript`; the three tiers here are what the audience hears once the show
 * has a history - bold in the opening, shaken by a swing, and defiant after the dowry is gone.
 */
export type CommentaryTier = 'do_dai' | 'soc' | 'khong_mu_phuong';

export interface BankEntry {
  line: string;
  emotion: HostEmotion;
  gesture: PerformanceGesture;
  stageDirection: string;
  /** Empty means "reuse the motif the engine already named for this ply". */
  motif?: string;
  /**
   * Kill-pattern copy only: whose shape the line speaks of. She does not narrate her own horse when
   * the challenger is the one holding it - and the room hears the difference. Absent means hers.
   */
  by?: PatternHolder;
}

/** Whose shape a pattern line is about: the bride's own, or the one just landed on her. */
export type PatternHolder = 'self' | 'guest';

/**
 * Lines are data, not template literals: the tokens below are substituted by the caller, so the
 * whole bank can be scanned for banned wording and for hardcoded honorifics in a test.
 * Any token outside this list silently deletes a word on air, so it is asserted in tests.
 */
export const COMMENTARY_TOKENS = [
  'guest',
  'capGuest',
  'self',
  'capSelf',
  'audience',
  'name',
  'piece',
  'motif',
] as const;
export const TIERED_BANK: Partial<Record<TacticalEventType, Partial<Record<CommentaryTier, BankEntry[]>>>> = {
  check_bot: {
    do_dai: [
      {
        line: 'Mới khai cuộc mà {self} đã đòi hỏi {guest} trả lời rồi nha {name}! Trung pháo chưa nóng chỗ thì đừng vội mở cửa.',
        emotion: 'check',
        gesture: 'closeup_talk',
        stageDirection: 'Nghiêng đầu hỏi, mũi quạt chỉ thẳng vào cung đối phương',
      },
      {
        line: '{capGuest} đi nhanh quá — {self} chiếu ngay cho {guest} tỉnh ngủ. {audience} coi nước đỡ đầu tiên ra sao nhé!',
        emotion: 'check',
        gesture: 'tease',
        stageDirection: 'Khẽ cười, tay gõ nhịp lên thành chòi',
      },
      {
        line: 'Nước chiếu này là {self} mượn cớ hỏi thăm quân cờ, chứ chưa phải nước đoạt mệnh đâu {guest} ạ. Uống trà rồi hãy đáp.',
        emotion: 'amused',
        gesture: 'sip_tea',
        stageDirection: 'Rót trà, ánh mắt vẫn khoá chặt bàn cờ',
      },
    ],
    soc: [
      {
        line: 'Á… {self} không ngờ đường chiếu này mở sớm vậy! {audience} nín thở giùm — tay {self} còn run đây này.',
        emotion: 'surprised',
        gesture: 'closeup_talk',
        stageDirection: 'Bất ngờ nghiêng người ra sau, quạt mở vội',
      },
      {
        line: 'Chiếu! Nhưng chiếu kiểu này là con dao hai lưỡi nha {guest} — cứu được thì {self} mất thế, không cứu được thì mất luôn cả xe.',
        emotion: 'check',
        gesture: 'think_fan',
        stageDirection: 'Gấp quạt, miết ngón tay lên sống quạt như đang tính',
      },
      {
        line: 'Sâu quá {name} ơi… {self} đi nước này theo bản năng, không phải theo sách. {guest} dám đánh lại tới cùng không?',
        emotion: 'fierce',
        gesture: 'closeup_talk',
        stageDirection: 'Thở ra một nhịp, ánh mắt sắc lại',
      },
    ],
    khong_mu_phuong: [
      {
        line: 'Mất ba lớp hồi môn rồi, {self} chẳng còn gì để giữ ngoài nước chiếu này. {guest} liệu mà đỡ, đừng để {self} thắng danh dự.',
        emotion: 'fierce',
        gesture: 'closeup_talk',
        stageDirection: 'Tóc bới gọn bằng que cài, nhìn thẳng không chớp',
      },
      {
        line: 'Không mũ phượng thì cờ vẫn chạy {guest} ạ. Chiếu đây — nước cuối cùng của {self} đêm nay nặng hơn tất cả sính lễ cộng lại.',
        emotion: 'check',
        gesture: 'tease',
        stageDirection: 'Khẽ vuốt tay áo, đặt quân mạnh hơn thường lệ',
      },
      {
        line: '{audience} thấy không, {self} đánh bằng tay không còn chi phối hết bàn cờ. {guest} đừng vì thương {self} mà đi nước hời.',
        emotion: 'fierce',
        gesture: 'think_fan',
        stageDirection: 'Mỉm cười nửa miệng, chống cằm chờ nước đáp',
      },
    ],
  },
  check_player: {
    do_dai: [
      {
        line: 'Khai cuộc mà {guest} dám chiếu {self} luôn? Gan đó {name} — nhưng gan chưa chắc đã đúng, {audience} nhận xét giúp {self} nhé.',
        emotion: 'surprised',
        gesture: 'closeup_talk',
        stageDirection: 'Nhướng mày thích thú, chống cằm xem đối phương',
      },
      {
        line: 'Ồ, {capGuest} ra đòn trước cả khi trà nguội. {self} thích kiểu này — đánh dè dặt thì đêm dài lắm nhé.',
        emotion: 'amused',
        gesture: 'tease',
        stageDirection: 'Cười khẽ, đẩy chén trà sang phía đối thủ',
      },
      {
        line: 'Chiếu thì chiếu, nhưng {guest} để hở cánh trái rồi kìa. {audience} tinh mắt có thấy {self} thấy không?',
        emotion: 'thinking',
        gesture: 'think_fan',
        stageDirection: 'Quạt chỉ hờ hững sang biên trái bàn cờ',
      },
    ],
    soc: [
      {
        line: 'Nước này… {self} tính sai một nhịp thật rồi. {guest} đừng sợ {self} giận, cứ đi tiếp đi!',
        emotion: 'surprised',
        gesture: 'closeup_talk',
        stageDirection: 'Khựng tay trên quân cờ, mắt mở to',
      },
      {
        line: 'Hay! {capGuest} giấu đòn tới tận bây giờ. {audience} nhớ watermark… à không, nhớ ghi tên {name} vào kỳ phổ đêm nay nhé.',
        emotion: 'fierce',
        gesture: 'groom_react',
        stageDirection: 'Đứng dậy nửa người, tì khuỷu tay lên bàn cờ',
      },
      {
        line: '{self} bị chiếu mà vẫn còn cười được — vì nước này chưa chết ai, {guest} ạ. Nhưng {self} không đánh giá thấp {guest} lần thứ hai đâu.',
        emotion: 'amused',
        gesture: 'think_fan',
        stageDirection: 'Cười nửa chừng, thu lại vẻ thong dong',
      },
    ],
    khong_mu_phuong: [
      {
        line: '{capGuest} chiếu {self} thêm lần nữa đi. Mất hết rồi thì chẳng còn gì để mất — {guest} sẽ thấy Kỳ Ma thật sự đánh cờ thế nào.',
        emotion: 'fierce',
        gesture: 'closeup_talk',
        stageDirection: 'Hất tóc qua vai, giọng trầm và chắc hẳn lại',
      },
      {
        line: 'Đẹp {name} ạ. {audience} làm chứng: {self} đã mất mũ phượng mà vẫn đỡ được nước chiếu này bằng đúng một nhịp.',
        emotion: 'check',
        gesture: 'tease',
        stageDirection: 'Đỡ quân xong mới thở ra, tay hơi run',
      },
      {
        line: '{capGuest} thắng {self} ở nước này, nhưng thắng kiểu này thì đêm sau {self} vẫn ngồi lại kỳ đài. {capGuest} cứ đi tiếp.',
        emotion: 'thinking',
        gesture: 'think_fan',
        stageDirection: 'Nhìn thẳng vào ống quay, không nhìn bàn cờ',
      },
    ],
  },
  heavy_capture_bot: {
    do_dai: [
      {
        line: 'Mới có mấy nước mà {guest} để {self} bắt mất {piece} rồi {name} ơi! Khai cuộc kiểu này thì trà còn nóng mà cờ đã nguội.',
        emotion: 'amused',
        gesture: 'tease',
        stageDirection: 'Nâng quân vừa bắt lên soi dưới ánh nến',
      },
      {
        line: '{self} xin {piece} làm vốn trước nha. {audience} thấy nước đi của {guest} có hơi vội không, bình luận giúp {self} với!',
        emotion: 'check',
        gesture: 'closeup_talk',
        stageDirection: 'Đặt {piece} vào khay chiến lợi phẩm, gõ gõ ngón tay',
      },
      {
        line: 'Ăn non rồi {guest} ạ. {self} lấy {piece} này không phải vì tham — vì đường của {guest} vừa mở toang.',
        emotion: 'fierce',
        gesture: 'think_fan',
        stageDirection: 'Quạt phe phẩy, mắt liếc sang cánh vừa trống',
      },
    ],
    soc: [
      {
        line: 'Thật không vậy… {self} lấy được {piece} của {guest} ngay nước này? {audience} thấy {self} đánh hay thấy {guest} sơ sẩy?',
        emotion: 'surprised',
        gesture: 'closeup_talk',
        stageDirection: 'Che miệng kinh ngạc, rồi bật cười vì chính mình',
      },
      {
        line: 'Một nhịp thôi — {piece} nằm bên {self}. Cờ không có chữ nếu, {name} ạ, chỉ có nước vừa đi.',
        emotion: 'fierce',
        gesture: 'think_fan',
        stageDirection: 'Đặt quân xuống khay dứt khoát, không nhìn đối phương',
      },
      {
        line: '{self} không ăn vì thích ăn. Ăn vì {guest} vừa tự mở cửa nhà mình. {audience} ghi giúp nước này nhé!',
        emotion: 'check',
        gesture: 'groom_react',
        stageDirection: 'Chỉ tay vào ô vừa trống trên bàn cờ',
      },
    ],
    khong_mu_phuong: [
      {
        line: 'Mất {piece} nữa thì {self} vẫn còn nguyên nước cờ. {guest} ạ, hồi môn {self} cho được, còn kỳ đài thì không nhường.',
        emotion: 'fierce',
        gesture: 'closeup_talk',
        stageDirection: 'Cười khẩy, xếp quân vừa bắt thành hàng ngay ngắn',
      },
      {
        line: 'Đẹp! {self} đánh bằng bàn tay không mũ phượng mà vẫn lấy được {piece} của {guest}. {audience} còn nghi ai không?',
        emotion: 'victory',
        gesture: 'tease',
        stageDirection: 'Vỗ nhẹ tay lên bàn, mắt sáng rực',
      },
      {
        line: '{name} để ý nhé: {self} ăn {piece} này là để đổi lấy đường, không phải để hơn một quân. {capSelf} đang nói chuyện bằng thế cờ.',
        emotion: 'thinking',
        gesture: 'think_fan',
        stageDirection: 'Đếm nhịp bằng quạt, nhìn xuyên qua đối thủ',
      },
    ],
  },
  heavy_capture_player: {
    do_dai: [
      {
        line: '{guest} mới đi có mấy nước đã ăn {piece} của {self}? {name} đánh kiểu này là muốn xong ván sớm hay muốn {self} nghiêm túc sớm?',
        emotion: 'thinking',
        gesture: 'closeup_talk',
        stageDirection: 'Khoanh tay, nghiêng người về phía bàn cờ',
      },
      {
        line: 'Mất {piece} từ khai cuộc — {self} ghi nhận bản lĩnh của {guest}, nhưng cũng ghi luôn cái lỗ hổng phía sau nó.',
        emotion: 'amused',
        gesture: 'think_fan',
        stageDirection: 'Dùng quạt gõ nhẹ lên ô vừa mất quân',
      },
      {
        line: '{audience} đừng vội thương {self}. Nước này {guest} đi đúng, còn {self} thì… chưa tính hết. Cờ mà, ai dám nhận mình tính hết?',
        emotion: 'calm',
        gesture: 'sip_tea',
        stageDirection: 'Uống một ngụm dài, đặt chén xuống thật khẽ',
      },
    ],
    soc: [
      {
        line: '…{self} vừa mất {piece}. Nói thật nhé, lâu rồi mới có người làm {self} sững một nhịp như {name} vừa làm.',
        emotion: 'surprised',
        gesture: 'closeup_talk',
        stageDirection: 'Im lặng một nhịp dài rồi mới ngẩng lên',
      },
      {
        line: 'Đau thật. Nhưng đau mới đúng — {guest} đánh mà {self} không đau thì kỳ đài này buồn lắm {audience} ạ.',
        emotion: 'fierce',
        gesture: 'think_fan',
        stageDirection: 'Nghiến nhẹ môi, mắt quét lại toàn bàn',
      },
      {
        line: '{capGuest} đoạt {piece} gọn ghẽ, không thừa một nước. {self} xin thua nước này trên mặt chữ, và thắng lại bằng thế.',
        emotion: 'victory',
        gesture: 'groom_react',
        stageDirection: 'Chắp tay chào đối thủ một nhịp ngắn',
      },
    ],
    khong_mu_phuong: [
      {
        line: 'Mất thêm {piece} nữa. {self} đếm xem còn lại bao nhiêu quân — rồi {guest} cũng đếm lại xem {guest} còn bao nhiêu nước.',
        emotion: 'thinking',
        gesture: 'think_fan',
        stageDirection: 'Đếm quân bằng đầu ngón tay, môi mím',
      },
      {
        line: '{guest} thấy đấy, {self} chẳng còn gì để giữ nên đánh rất thoáng. {piece} cứ lấy đi, đường vào cung thì {self} giữ.',
        emotion: 'fierce',
        gesture: 'closeup_talk',
        stageDirection: 'Đẩy khay hồi môn trống sang một bên, chỉ còn bàn cờ',
      },
      {
        line: '{audience} ghi giùm: nước này {name} ăn {piece} của tân nương. Còn nước sau, tân nương ăn lại cả thế của {guest}.',
        emotion: 'check',
        gesture: 'tease',
        stageDirection: 'Cười rất khẽ, tay đặt lên quân pháo',
      },
    ],
  },
  light_capture_bot: {
    do_dai: [
      {
        line: 'Ăn một mắt rễ thôi mà {self} cũng gõ quạt một cái. {guest} đừng vội mừng, còn nguyên bàn cờ phía sau đó {name}.',
        emotion: 'amused',
        gesture: 'tease',
        stageDirection: 'Gõ sống quạt theo nhịp quân vừa sang tay',
      },
      {
        line: '{capGuest} để hở một mắt rễ, {self} nhặt về không cần suy nghĩ. {audience} thấy {guest} sơ hở ở đâu chưa?',
        emotion: 'calm',
        gesture: 'closeup_talk',
        stageDirection: 'Chỉ đầu roi vào ô vừa trống trên bàn',
      },
      {
        line: 'Quân nhỏ nhưng là quân đầu tiên rời bàn đó {name}. {guest} tính tiếp, hay để {self} tính luôn cho?',
        emotion: 'thinking',
        gesture: 'think_fan',
        stageDirection: 'Mở quạt che nửa mặt, mắt vẫn mở to nhìn cờ',
      },
    ],
    soc: [
      {
        line: 'Khoan đã... {self} chỉ định ăn một Tốt thôi, sao bàn cờ bỗng rộng ra thế này. {guest} đi nước đó từ lúc vậy {name}?',
        emotion: 'surprised',
        gesture: 'closeup_talk',
        stageDirection: 'Bàn tay dừng giữa không trung ngay nước vừa đi',
      },
      {
        line: '{capGuest} thí Tốt hay thật. {capSelf} nhặt lên mà cứ tưởng mình vừa cầm vào bẫy.',
        emotion: 'thinking',
        gesture: 'think_fan',
        stageDirection: 'Lật quân tốt vừa ăn trong tay rồi đặt xuống',
      },
      {
        line: 'Một mắt rễ mà làm {self} phải nhìn lại cả ván. Coi như {self} vừa học thêm một bài, {audience} nhé.',
        emotion: 'calm',
        gesture: 'sip_tea',
        stageDirection: 'Chén trà đưa lên nhưng chưa kịp uống',
      },
    ],
    khong_mu_phuong: [
      {
        line: 'Không còn mũ phượng thì ăn một Tốt cũng chẳng ai vỗ tay. {guest} ạ, {self} đánh cho {audience}, không đánh cho phần thưởng.',
        emotion: 'calm',
        gesture: 'closeup_talk',
        stageDirection: 'Đặt quân vừa ăn xuống, không gõ nhịp lấy lệ',
      },
      {
        line: 'Tốt của {guest}, quạt của {self}, cả hai đều không còn nguyên vẹn. {name} cứ đi tiếp, {self} đỡ hết.',
        emotion: 'fierce',
        gesture: 'tease',
        stageDirection: 'Gấp quạt lại như gấp luôn một lời nhường',
      },
      {
        line: '{self} nhặt quân nhỏ này bằng tay không, vì tay kia chẳng còn gì để đeo nữa. {guest} thấy buồn cười lắm hả?',
        emotion: 'amused',
        gesture: 'sip_tea',
        stageDirection: 'Rót trà đầy cho cả hai chén, mắt không rời bàn',
      },
    ],
  },
  light_capture_player: {
    do_dai: [
      {
        line: 'Lấy quân của {self} nhanh ghê nha {guest}! {audience} coi — mới một mắt rễ thôi mà {guest} sướng cả phòng.',
        emotion: 'amused',
        gesture: 'tease',
        stageDirection: 'Che quạt cười, ngón cái chỉ xuống bàn cờ',
      },
      {
        line: '{capGuest} ăn một Tốt? Được. {self} ghi sổ nước đó, và sổ này {self} không quên đâu {name}.',
        emotion: 'fierce',
        gesture: 'closeup_talk',
        stageDirection: 'Gõ một nhịp lên thành chòi như đóng dấu',
      },
      {
        line: 'Nhặt quân nhỏ thì dễ, giữ thế mới khó. {guest} cứ đi tiếp, {self} chưa nghiêm túc đâu.',
        emotion: 'calm',
        gesture: 'sip_tea',
        stageDirection: 'Uống một ngụm dài, mắt không rời hàng quân thưa',
      },
    ],
    soc: [
      {
        line: '{self} mất quân mà không hiểu mất từ khi nào. {audience} thấy nước nào trước đó sai, nhắc {self} một câu đi.',
        emotion: 'surprised',
        gesture: 'think_fan',
        stageDirection: 'Nghiêng đầu nhìn hàng quân vừa thưa đi',
      },
      {
        line: 'Đau một cái. Không phải vì mất Tốt, mà vì {self} tưởng {guest} không dám ăn.',
        emotion: 'fierce',
        gesture: 'closeup_talk',
        stageDirection: 'Thở hắt ra, bàn tay đặt hờ lên mặt bàn',
      },
      {
        line: '{capGuest} đánh thực dụng quá. {self} không quen bị lấy quân trước, nên ván này bỏ sách.',
        emotion: 'thinking',
        gesture: 'tease',
        stageDirection: 'Gập mảnh kỳ phổ tưởng tượng lại, đẩy sang bên',
      },
    ],
    khong_mu_phuong: [
      {
        line: 'Lấy một quân của người không còn gì để mất à {guest}? {audience} thấy {self} có giữ lại gì đâu.',
        emotion: 'calm',
        gesture: 'closeup_talk',
        stageDirection: 'Nhặt quân đối phương khỏi bàn bằng hai ngón tay',
      },
      {
        line: '{self} đếm: còn ba quân lớn, hết hồi môn, còn nguyên ván cờ. Đủ để đánh với {guest} tới sáng, {name}.',
        emotion: 'fierce',
        gesture: 'think_fan',
        stageDirection: 'Đếm quân bằng đầu ngón tay, không nhìn đối thủ',
      },
      {
        line: '{capGuest} ăn quân, {self} uống trà. Cân bằng đó, vì {self} chẳng còn gì để thua thêm.',
        emotion: 'amused',
        gesture: 'sip_tea',
        stageDirection: 'Rót trà, tay kia đẩy quân vừa bị ăn ra ngoài bàn',
      },
    ],
  },
  blunder_player: {
    do_dai: [
      {
        line: '{guest} đi vội rồi kìa {name}! Cờ khai cuộc mà tay nhanh hơn mắt — {self} chưa kịp uống trà đã có quà.',
        emotion: 'amused',
        gesture: 'tease',
        stageDirection: 'Nâng chén trà lên, mắt vẫn không rời bàn',
      },
      {
        line: 'Nước này thì… {audience} ai cũng thấy, đúng không? {self} chỉ đi chậm một nhịp là {guest} mất cả đường.',
        emotion: 'check',
        gesture: 'closeup_talk',
        stageDirection: 'Liếc nhìn phòng live rồi quay lại bàn cờ',
      },
      {
        line: '{capGuest} ơi, ngồi xuống thở đã. {self} không đánh nước này đâu, {self} đợi {guest} đi lại cho đúng.',
        emotion: 'calm',
        gesture: 'sip_tea',
        stageDirection: 'Gật gà mời đối thủ bình tĩnh lại',
      },
    ],
    soc: [
      {
        line: 'Không tin nổi… {guest} đi nước này thật à? {self} tưởng trên kỳ đài này đã không còn ai tặng {self} quà như vậy.',
        emotion: 'surprised',
        gesture: 'closeup_talk',
        stageDirection: 'Hai tay che miệng, mở to mắt',
      },
      {
        line: 'Hở sườn nặng rồi {name} ạ. {self} mà đánh trúng chỗ này thì ván cờ khép lại trong ba nước nữa thôi.',
        emotion: 'fierce',
        gesture: 'think_fan',
        stageDirection: 'Quạt chĩa thẳng vào khe hở trên bàn cờ',
      },
      {
        line: '{audience} đừng trêu {guest} nữa. {guest} còn cơ hội — nhưng {self} thì đã nhìn thấy đường kết liễu rồi.',
        emotion: 'thinking',
        gesture: 'groom_react',
        stageDirection: 'Gật đầu ra hiệu cho phòng live thôi ồn',
      },
    ],
    khong_mu_phuong: [
      {
        line: '{guest} tặng nước này cho {self} à? {capSelf} mất ba lớp hồi môn mà vẫn chưa dám nhận quà — {guest} nghĩ lại đi.',
        emotion: 'amused',
        gesture: 'tease',
        stageDirection: 'Lật tay áo, đẩy quân của đối thủ về ô cũ theo phép lịch sự',
      },
      {
        line: 'Thôi được. {self} nhận. Và {name} sẽ thấy người mất hết sính lễ đánh tàn cuộc khát cỡ nào.',
        emotion: 'fierce',
        gesture: 'closeup_talk',
        stageDirection: 'Hạ giọng, ánh mắt không còn cười',
      },
      {
        line: 'Nước vội này không phải do {guest} dốt — do {guest} sốt ruột vì {self} còn ngồi đây. Sai ở tâm thế, không sai ở quân cờ.',
        emotion: 'thinking',
        gesture: 'think_fan',
        stageDirection: 'Gõ nhịp quạt lên thành chòi, chậm rãi',
      },
    ],
  },
  comeback_player: {
    do_dai: [
      {
        line: 'Mới có vậy mà {guest} lật được rồi? {name} đánh khai cuộc như người đi săn — im lặng chờ, ra tay một lần.',
        emotion: 'surprised',
        gesture: 'groom_react',
        stageDirection: 'Ngả người ra sau, nhìn đối thủ đánh giá lại',
      },
      {
        line: '{self} vừa mất một nhịp mà {guest} lấy lại cả thế. {audience} thấy chưa, bảo {self} đừng chủ quan.',
        emotion: 'thinking',
        gesture: 'think_fan',
        stageDirection: 'Tự mắng mình bằng một tiếng thở, rồi vào thế',
      },
      {
        line: 'Hay đó {capGuest}! Nhưng lật kèo lúc khai cuộc thì dễ — {self} đợi {guest} lật ở tàn cuộc cơ.',
        emotion: 'amused',
        gesture: 'closeup_talk',
        stageDirection: 'Chống cằm, cười kiểu chờ đợi',
      },
    ],
    soc: [
      {
        line: '…{self} hiểu rồi. Nước vừa rồi không phải may, {name} ạ. {capGuest} dựng bẫy từ ba nước trước.',
        emotion: 'fierce',
        gesture: 'think_fan',
        stageDirection: 'Quét lại từng ô trên bàn, môi mím chặt',
      },
      {
        line: 'Lật kèo thật rồi {audience} ơi! {self} đang cầm lợi thế mà bỗng nhiên phải phòng thủ. Khán giả được xem cờ thật rồi đấy.',
        emotion: 'check',
        gesture: 'groom_react',
        stageDirection: 'Bật dậy nửa người, hai tay tì bàn',
      },
      {
        line: 'Thích thật. Lâu lắm {self} mới phải tính lại từ đầu giữa ván. {guest} giữ thế nhé, đừng buông.',
        emotion: 'victory',
        gesture: 'closeup_talk',
        stageDirection: 'Cười thật lòng, gật đầu một nhịp rõ ràng',
      },
    ],
    khong_mu_phuong: [
      {
        line: '{guest} lên tay rồi. Mà {self} giờ có gì đâu mà sợ mất — cờ trắng tay đánh với cờ còn đủ, hay đúng không {audience}?',
        emotion: 'fierce',
        gesture: 'closeup_talk',
        stageDirection: 'Xoay cổ tay, hít một hơi thật sâu',
      },
      {
        line: 'Lật kèo đi {name}, lật nữa cũng được. {self} đã mất mũ phượng rồi, mất thêm nước này nữa thì {self} vẫn ngồi.',
        emotion: 'check',
        gesture: 'tease',
        stageDirection: 'Vỗ tay xuống bàn đúng một cái, gọn',
      },
      {
        line: 'Thế cờ này công bằng hơn đêm nay từng có. {audience} coi: hai người, một bàn, chẳng còn ai mang theo sính lễ.',
        emotion: 'thinking',
        gesture: 'think_fan',
        stageDirection: 'Kéo khay hồi môn trống ra khỏi khung hình',
      },
    ],
  },
  brilliant_player: {
    do_dai: [
      {
        line: 'Khai cuộc mà đi được nước này? {name} ơi, {self} đổi cách gọi {guest} thành {capGuest} kỳ khách được không?',
        emotion: 'surprised',
        gesture: 'closeup_talk',
        stageDirection: 'Nghiêng đầu, mắt mở to vì tò mò',
      },
      {
        line: '{audience} thấy gì không? {self} thấy một đường ẩn chạy suốt ba cột. {guest} nhìn thấy nó trước {self} một nhịp.',
        emotion: 'thinking',
        gesture: 'think_fan',
        stageDirection: 'Dùng quạt vẽ theo đường ẩn trên bàn cờ',
      },
      {
        line: 'Đẹp và sớm. {self} chỉ lo một điều: nước hay nhất của {guest} mà đem dùng ở nước thứ năm thì nửa ván sau lấy gì ra oai?',
        emotion: 'amused',
        gesture: 'tease',
        stageDirection: 'Cười, giả vờ tiếc hộ đối thủ',
      },
    ],
    soc: [
      {
        line: 'Nước này… {self} phải thừa nhận là mình chưa nghĩ tới. {guest} cho {self} một bài học giữa kỳ đài, {audience} làm chứng nhé.',
        emotion: 'victory',
        gesture: 'groom_react',
        stageDirection: 'Đứng lại giữa chừng, chắp tay chào đối thủ',
      },
      {
        line: 'Sâu quá {name} ạ. {self} tính tới nước thứ ba, còn {guest} tính tới nước thứ năm — và đi đúng cái nhịp đó.',
        emotion: 'fierce',
        gesture: 'think_fan',
        stageDirection: 'Cúi nhìn bàn cờ lâu hơn thường lệ',
      },
      {
        line: 'Ván này đáng để quay lại. {audience} nhớ lưu kỳ phổ đêm nay, vì {guest} vừa làm {self} bí một nhịp thật.',
        emotion: 'check',
        gesture: 'closeup_talk',
        stageDirection: 'Chỉ tay vào ống quay, rồi vào bàn cờ',
      },
    ],
    khong_mu_phuong: [
      {
        line: '{capGuest} giỏi thì {self} mừng. Mất hồi môn mà gặp được kỳ thủ xứng đôi thì kỳ đài này không lỗ, {name} ạ.',
        emotion: 'victory',
        gesture: 'closeup_talk',
        stageDirection: 'Cười rộng, không còn vẻ phòng thủ',
      },
      {
        line: '{capGuest} đánh nước này bằng cái đầu, không bằng may mắn. {self} ghi vào kỳ phổ của đời mình đấy.',
        emotion: 'thinking',
        gesture: 'think_fan',
        stageDirection: 'Ghi nhớ bằng cách nhắm mắt một nhịp',
      },
      {
        line: '{capSelf} không còn mũ phượng, nhưng {self} còn mắt để nhìn ra nước hay. {guest} vừa cho {audience} xem một nước như thế.',
        emotion: 'amused',
        gesture: 'tease',
        stageDirection: 'Vỗ nhẹ lên vai đối thủ theo lệ kỳ đài',
      },
    ],
  },
  dominating_bot: {
    do_dai: [
      {
        line: 'Mới mở bàn mà {self} đã cầm đường rồi {guest} ạ. {name} khoan vội nản — khai cuộc còn dài hơn {guest} tưởng.',
        emotion: 'check',
        gesture: 'closeup_talk',
        stageDirection: 'Tay phủ lên cả nửa bàn cờ',
      },
      {
        line: '{audience} thấy {self} đi nhanh, nhưng thật ra {self} đang nhường {guest} chọn đường nào trong ba đường chết.',
        emotion: 'amused',
        gesture: 'tease',
        stageDirection: 'Khẽ xoè ba ngón tay, cười bí ẩn',
      },
      {
        line: 'Chậm lại {guest} nhé. Thế này mà {guest} đi chắc hai nước nữa thì {self} phải bỏ chén trà xuống thật.',
        emotion: 'thinking',
        gesture: 'sip_tea',
        stageDirection: 'Đưa chén lên nhưng chưa uống',
      },
    ],
    soc: [
      {
        line: 'Bất ngờ rồi. {self} tính một đường, {guest} trả lời bằng đường khác — và đường của {guest} không tệ chút nào.',
        emotion: 'surprised',
        gesture: 'think_fan',
        stageDirection: 'Dừng tay trên quân cờ, tính lại',
      },
      {
        line: '{name} ạ, {self} đang hơn mà không thấy nhẹ người. Đó là dấu hiệu {guest} đã vào thế của {guest} rồi.',
        emotion: 'fierce',
        gesture: 'closeup_talk',
        stageDirection: 'Ngồi thẳng lại, hai tay đặt gọn lên bàn',
      },
      {
        line: 'Được, đánh nghiêm. {audience} im lặng giùm — phần hay nhất của ván cờ bắt đầu từ nước này.',
        emotion: 'check',
        gesture: 'groom_react',
        stageDirection: 'Gật đầu ra hiệu cả chòi im tiếng',
      },
    ],
    khong_mu_phuong: [
      {
        line: '{capSelf} vẫn áp đảo dù mất ba lớp hồi môn. {guest} nghĩ xem: nếu còn đủ sính lễ thì nước này sẽ nặng cỡ nào?',
        emotion: 'fierce',
        gesture: 'closeup_talk',
        stageDirection: 'Tựa người lên trước, giọng chắc',
      },
      {
        line: '{self} không còn gì để mất nên đi nước này rất sạch. Sạch hơn mọi nước {self} đánh khi còn mũ phượng đấy {name}.',
        emotion: 'check',
        gesture: 'think_fan',
        stageDirection: 'Đặt quân không một chút do dự',
      },
      {
        line: 'Thua danh dự thì {self} chịu, thua nước này thì {guest} không chịu nổi đâu {audience} ạ. {guest} còn đường lui không?',
        emotion: 'amused',
        gesture: 'tease',
        stageDirection: 'Liếc khay hồi môn trống rồi liếc đối thủ',
      },
    ],
  },
  under_pressure_bot: {
    do_dai: [
      {
        line: 'Khai cuộc mà {guest} dồn {self} thế này? {name} đánh như người vội — vội thì hay, nhưng vội thì hở.',
        emotion: 'thinking',
        gesture: 'think_fan',
        stageDirection: 'Quấn lại quai áo, mắt dõi theo mũi xe đối phương',
      },
      {
        line: '{audience} cổ vũ mạnh vào! {self} đang bị ép và {self} thích bị ép ngay từ đầu ván — đỡ phải chờ.',
        emotion: 'amused',
        gesture: 'closeup_talk',
        stageDirection: 'Cười vang, vỗ tay theo nhịp phòng live',
      },
      {
        line: '{capGuest} ép được {self} một nhịp, nhưng trung pháo của {self} vẫn đứng giữa. {guest} quên rồi hả?',
        emotion: 'fierce',
        gesture: 'tease',
        stageDirection: 'Gõ nhẹ lên quân pháo giữa bàn',
      },
    ],
    soc: [
      {
        line: 'Nặng thật rồi… {self} phải thở một cái mới đi tiếp được. {name} đừng nghĩ {self} giả vờ nhé.',
        emotion: 'surprised',
        gesture: 'sip_tea',
        stageDirection: 'Uống trà để mua ba giây suy tính',
      },
      {
        line: '{guest} dựng đúng hai mối lo cùng một lúc. {audience} thấy {self} chọn đường nào không — {self} cũng chưa chắc.',
        emotion: 'thinking',
        gesture: 'think_fan',
        stageDirection: 'Di chuyển quạt giữa hai ô cờ, do dự thật',
      },
      {
        line: 'Thôi. Nhận khó. {self} đánh lại từ nước này bằng tất cả những gì còn lại trên bàn.',
        emotion: 'fierce',
        gesture: 'closeup_talk',
        stageDirection: 'Gấp quạt cái rẹt, đặt xuống bàn',
      },
    ],
    khong_mu_phuong: [
      {
        line: '{capGuest} ép {self} trong khi {self} đã mất ba lớp hồi môn. {guest} ạ, đó là lúc {self} hết lịch sự.',
        emotion: 'fierce',
        gesture: 'closeup_talk',
        stageDirection: 'Bỏ hẳn vẻ trêu, nhìn thẳng vào mắt đối thủ',
      },
      {
        line: '{audience} coi nè: không mũ phượng, không xe, không pháo — mà {self} vẫn đứng vững trước sức ép của {name}.',
        emotion: 'check',
        gesture: 'tease',
        stageDirection: 'Đếm quân còn lại bằng đầu ngón tay',
      },
      {
        line: 'Ép nữa đi {guest}. Ép tới lúc {self} bật lại thì {guest} đừng trách vì sao tân nương đánh như người không còn gì để mất.',
        emotion: 'thinking',
        gesture: 'think_fan',
        stageDirection: 'Hỏi nhưng tay đã đặt sẵn lên quân phản đòn',
      },
    ],
  },
  tense_endgame: {
    do_dai: [
      {
        line: 'Vừa mở bàn đã tưởng tàn cuộc? {name} đi nhanh quá, {self} chưa kịp thắp nến thứ hai mà cờ đã thưa quân rồi.',
        emotion: 'thinking',
        gesture: 'closeup_talk',
        stageDirection: 'Liếc cây nến chưa thắp, rồi liếc bàn cờ',
      },
      {
        line: 'Ít quân thì cờ dễ hơn cho ai tính đúng, không dễ cho ai đi nhanh. {guest} thuộc nhóm nào, {audience} đoán thử đi.',
        emotion: 'amused',
        gesture: 'tease',
        stageDirection: 'Xoè tay hỏi phòng live, mắt vẫn ở bàn cờ',
      },
      {
        line: '{self} thích tàn cuộc kiểu này: một sai là thành {audience} ngồi nhìn nhau uống hết ấm trà.',
        emotion: 'calm',
        gesture: 'sip_tea',
        stageDirection: 'Rót thêm trà, động tác chậm và đều',
      },
    ],
    soc: [
      {
        line: 'Trăng lên cao rồi {guest} ạ. Từ nước này, mỗi nhịp lệch là một kỷ niệm mất đi — {self} nói thật, không dọa.',
        emotion: 'fierce',
        gesture: 'think_fan',
        stageDirection: 'Chỉ ra ngoài mặt hồ rồi quay vào bàn',
      },
      {
        line: '{audience} còn ở lại tới nước này thì không phải khách qua đường nữa. {name} ơi, đây là ván của chúng ta.',
        emotion: 'check',
        gesture: 'groom_react',
        stageDirection: 'Nói với phòng live, rồi mới nói với đối thủ',
      },
      {
        line: 'Tay {self} hơi lạnh. Không vì thua — vì sắp thắng, và {guest} thì chưa chịu hiểu điều đó.',
        emotion: 'victory',
        gesture: 'closeup_talk',
        stageDirection: 'Xoè bàn tay ra trước ánh nến rồi nắm lại',
      },
    ],
    khong_mu_phuong: [
      {
        line: 'Tàn cuộc mà {self} vẫn còn nguyên nước cờ, dù hồi môn đã đi hết. {guest} ạ, đó là điều {guest} nên sợ.',
        emotion: 'fierce',
        gesture: 'closeup_talk',
        stageDirection: 'Đẩy khay sính lễ trống sang bên, chỉ còn bàn cờ giữa hai người',
      },
      {
        line: '{self} đánh tàn cuộc bằng ký ức của cả ván. {name} có thấy từng nước {self} vừa đi đều có lý do không?',
        emotion: 'thinking',
        gesture: 'think_fan',
        stageDirection: 'Chỉ ngược lại ba nước trước trên bảng kỳ phổ',
      },
      {
        line: 'Nến hoa chúc vẫn chưa thắp, và {self} vẫn chưa định để nó tắt. {capGuest} đi đi — {audience} đang chờ nước quyết định.',
        emotion: 'check',
        gesture: 'tease',
        stageDirection: 'Nghiêng đầu chờ, tay chống cằm',
      },
    ],
  },
  opening_signature: {
    do_dai: [
      {
        line: '{guest} mở bằng {motif}? {self} thuộc bài {guest} rồi đấy {name} — nhưng thuộc bài và đỡ được là hai chuyện khác nhau.',
        emotion: 'amused',
        gesture: 'closeup_talk',
        stageDirection: 'Gõ nhịp theo đúng thế mở của đối thủ',
      },
      {
        line: 'Ra quân đàng hoàng lắm. {audience} thấy {guest} tập thế này bao nhiêu đêm rồi, {name}? Nói {self} nghe với.',
        emotion: 'calm',
        gesture: 'sip_tea',
        stageDirection: 'Hỏi thật, tay rót trà cho cả hai',
      },
      {
        line: '{motif} thì {self} trả lời bằng nước này, {guest} ạ. {audience} coi: sách có hai trang, và {self} đọc cả hai.',
        emotion: 'check',
        gesture: 'tease',
        stageDirection: 'Lật một trang kỳ phổ giả định trên bàn',
      },
    ],
    soc: [
      {
        line: '{guest} mở {motif} mà {self} phải nhìn lại hai lần. Không phải thế lạ — là thế này {guest} đi quá chuẩn.',
        emotion: 'surprised',
        gesture: 'think_fan',
        stageDirection: 'Nghiêng người, mắt nheo lại tính đường',
      },
      {
        line: 'Hay. {name} mở màn như người lên đài chứ không như người chơi. {audience} thấy nước này đáng vỗ bàn chưa?',
        emotion: 'fierce',
        gesture: 'groom_react',
        stageDirection: 'Vỗ tay một cái ngắn khen đối thủ',
      },
      {
        line: '{self} đổi kế hoạch rồi. {motif} của {guest} bắt {self} phải bỏ sách, mở cờ tay.',
        emotion: 'thinking',
        gesture: 'closeup_talk',
        stageDirection: 'Gập mảnh kỳ phổ nhỏ, đặt sang một bên',
      },
    ],
    khong_mu_phuong: [
      {
        line: 'Mở {motif} với một tân nương không còn mũ phượng — {guest} ạ, {guest} đang đánh với người không cần thắng để về nhà.',
        emotion: 'fierce',
        gesture: 'closeup_talk',
        stageDirection: 'Ngồi thẳng, hai tay đặt trên bàn, không cầm quạt',
      },
      {
        line: '{self} nhớ {motif} này. Đêm trước có người mở y như {guest} và {self} mất một lớp hồi môn. {name} định mất tiếp lớp nào?',
        emotion: 'amused',
        gesture: 'tease',
        stageDirection: 'Đếm lớp hồi môn đã mất bằng đầu ngón tay',
      },
      {
        line: 'Được, không sách nữa. {guest} cứ mở, {self} đỡ bằng tay không — {audience} coi tân nương đánh cờ kiểu gì khi đã trắng tay.',
        emotion: 'check',
        gesture: 'think_fan',
        stageDirection: 'Đẩy ấm trà ra xa, chỉ để lại bàn cờ',
      },
    ],
  },
  balanced_duel: {
    do_dai: [
      {
        line: 'Hai bên đang dò nhau {guest} ạ. {self} thích đoạn này nhất — im như mặt hồ, và ai cũng giả vờ không sợ.',
        emotion: 'calm',
        gesture: 'sip_tea',
        stageDirection: 'Thong thả quay mặt ra hồ, rồi quay lại bàn',
      },
      {
        line: '{name} đi chắc tay đấy, chưa hở chỗ nào. {self} cũng vậy — nên nước nào sai trước sẽ thành chuyện của cả đêm.',
        emotion: 'thinking',
        gesture: 'think_fan',
        stageDirection: 'Soi tay đối thủ đặt quân, không soi bàn',
      },
      {
        line: '{audience} thấy buồn ngủ chưa? {self} chưa. Cờ cân nhau là lúc người ta học cách kiên nhẫn.',
        emotion: 'amused',
        gesture: 'closeup_talk',
        stageDirection: 'Khẽ ngáp giả, rồi cười chính mình',
      },
    ],
    soc: [
      {
        line: 'Khoan… nước này làm thế cờ lệch hẳn. {guest} đi nhẹ mà {self} phải tính lại cả ba đường.',
        emotion: 'surprised',
        gesture: 'think_fan',
        stageDirection: 'Dừng tay giữa không trung, mắt quét ba cột',
      },
      {
        line: '{self} vừa hiểu ra một điều về {name}. Không nói ra đâu — để dành tới nước cuối.',
        emotion: 'fierce',
        gesture: 'closeup_talk',
        stageDirection: 'Mỉm cười một mình, che quạt nửa mặt',
      },
      {
        line: 'Cân mà không còn bình lặng nữa rồi {audience} ạ. Từ nước này, hai người đang đấu trí chứ không đấu quân.',
        emotion: 'check',
        gesture: 'groom_react',
        stageDirection: 'Chỉ tay vào thái dương, không chỉ vào bàn cờ',
      },
    ],
    khong_mu_phuong: [
      {
        line: 'Thế cờ vẫn cân, chỉ có hồi môn là lệch. {guest} ạ, {self} đánh kiểu này là đánh cho {audience}, không đánh cho {guest}.',
        emotion: 'thinking',
        gesture: 'closeup_talk',
        stageDirection: 'Nói với ống quay, đi quân bằng tay kia',
      },
      {
        line: 'Cân tài cân sức mà {self} thấy nhẹ người. Không còn gì để mất thì nước đi nó sạch lắm {name} ạ.',
        emotion: 'calm',
        gesture: 'sip_tea',
        stageDirection: 'Uống trà thật, vai buông lỏng',
      },
      {
        line: '{guest} cứ thủ hoà kiểu này thì trăng tàn chưa xong ván. {self} mất mũ phượng rồi, nhưng mất kiên nhẫn thì chưa.',
        emotion: 'amused',
        gesture: 'tease',
        stageDirection: 'Gẩy tay mời đối thủ đi tiếp',
      },
    ],
  },
  checkmate_red: {
    do_dai: [
      {
        line: 'Chiếu hết! {guest} kết sớm dữ vậy {name}? {self} xin nhận ván này, và hứa ván sau không nhường đâu.',
        emotion: 'surprised',
        gesture: 'closeup_talk',
        stageDirection: 'Đứng dậy khoanh tay, cúi đầu một nhịp ngắn',
      },
      {
        line: '{capSelf} thua thật rồi. {audience} làm chứng: {guest} đi nước cuối sạch lắm, không nhờ may chút nào.',
        emotion: 'calm',
        gesture: 'groom_react',
        stageDirection: 'Vỗ tay một cái ngắn dành cho đối thủ',
      },
      {
        line: '{capGuest} bịt từ khai cuộc, {self} chưa kịp dựng xe. Đêm sau {self} nhớ nước này lắm.',
        emotion: 'thinking',
        gesture: 'think_fan',
        stageDirection: 'Gập bàn cờ lại chậm, mắt vẫn ở ô chiếu bí',
      },
    ],
    soc: [
      {
        line: 'Trời ơi... {self} không thấy đường đó. {audience} đừng vội chê, nước chiếu bí này đẹp thật.',
        emotion: 'surprised',
        gesture: 'closeup_talk',
        stageDirection: 'Bàn tay che miệng, người ngửa ra sau',
      },
      {
        line: 'Chiếu bí. {capSelf} đứng hình mất một nhịp, và nhịp đó là của {guest}, {guest} ạ.',
        emotion: 'fierce',
        gesture: 'sip_tea',
        stageDirection: 'Chén trà dừng giữa môi rồi mới đặt xuống',
      },
      {
        line: '{guest} dựng đúng nước {self} dám khinh. {name}, {self} học bài này kỹ lắm.',
        emotion: 'calm',
        gesture: 'tease',
        stageDirection: 'Cúi đầu cười, ngón tay gõ lên ô chiếu bí',
      },
    ],
    khong_mu_phuong: [
      {
        line: 'Hết hồi môn, hết cả ván. {self} ngẩng cao đầu đi ra hành lang — {audience} đừng thương, thương là {self} giận.',
        emotion: 'fierce',
        gesture: 'closeup_talk',
        stageDirection: 'Đứng thẳng, hai tay không cầm gì, quay mặt đi',
      },
      {
        line: '{capGuest} lấy được nến hoa chúc rồi đó {guest}. {self} không xin lại, vì thắng thì phải nhận cho đủ.',
        emotion: 'calm',
        gesture: 'groom_react',
        stageDirection: 'Cúi đầu nhận ngọn nến vừa tắt bằng hai tay',
      },
      {
        line: 'Thua trắng tay thì cũng nhẹ người. {name} ạ, {self} đánh hết mình, phần còn lại là của {guest}.',
        emotion: 'amused',
        gesture: 'sip_tea',
        stageDirection: 'Nâng chén mời đối thủ rồi uống trước',
      },
    ],
  },
  checkmate_black: {
    do_dai: [
      {
        line: 'Một nước chiếu bí để riêng cho khai cuộc. {guest} ạ, {self} mới nghiêm túc từ nước này thôi {name}!',
        emotion: 'victory',
        gesture: 'tease',
        stageDirection: 'Mở quạt che cười, vai nhún nhẹ một cái',
      },
      {
        line: '{capGuest} thua ngay trên thế quen mà không chịu đổi nước. {audience} ghi nhớ giùm {self} nhé!',
        emotion: 'amused',
        gesture: 'closeup_talk',
        stageDirection: 'Chỉ đầu roi xuống ô chiếu bí, gật gù',
      },
      {
        line: '{capSelf} thắng, và thắng kiểu này thì chưa đủ vui. {name} đặt lại ván khác, lần này {self} đánh thật.',
        emotion: 'fierce',
        gesture: 'think_fan',
        stageDirection: 'Dựng lại quân cờ trước khi đối thủ kịp kêu',
      },
    ],
    soc: [
      {
        line: '{self} không ngờ thế đó thành bí. {guest} đang đứng hình rồi kìa {audience} — {self} cũng vậy.',
        emotion: 'surprised',
        gesture: 'closeup_talk',
        stageDirection: 'Tay dừng trên bàn, nhìn đối thủ rồi nhìn lại cờ',
      },
      {
        line: 'Chiếu bí thật rồi. {capGuest} đánh cả ván hay, chỉ hỏng một nước, và {self} ăn đúng nước đó.',
        emotion: 'calm',
        gesture: 'sip_tea',
        stageDirection: 'Uống trà chậm, để đối thủ kịp hiểu mình vừa thua',
      },
      {
        line: 'Thắng mà tim còn đập nhanh. {name} ạ, nước vừa rồi {self} đi theo bản năng chứ không theo sách.',
        emotion: 'victory',
        gesture: 'tease',
        stageDirection: 'Bàn tay ấn nhẹ lên ngực, mắt sáng lên',
      },
    ],
    khong_mu_phuong: [
      {
        line: '{guest} thắng hay thua thì hồi môn cũng không về lại. {capSelf} chỉ lấy lại ván cờ, và {self} đã lấy.',
        emotion: 'fierce',
        gesture: 'closeup_talk',
        stageDirection: 'Đặt phẳng hai tay lên bàn, nhìn thẳng ống quay',
      },
      {
        line: 'Chiếu bí một người không còn gì để mất: {audience} thấy nước đó sạch chưa, chẳng hóc gì cả.',
        emotion: 'calm',
        gesture: 'think_fan',
        stageDirection: 'Gấp quạt, dựng thẳng trước mặt như một nước cờ',
      },
      {
        line: '{capSelf} giữ được ván cờ là đủ. Hồi môn {guest} cứ giữ đi {name}, đêm sau {self} đánh tiếp.',
        emotion: 'amused',
        gesture: 'groom_react',
        stageDirection: 'Cúi đầu chào một cái ngắn rồi bật cười',
      },
    ],
  },
  // The three referee rulings. The mover is never named here: the event does not say which side
  // broke the rule, so the legacy pool in livePerformance.ts keeps the line that can say
  // "bên chiếu là {self}", and these tier lines stay true whichever side the búa falls on.
  perpetual_check_ruling: {
    do_dai: [
      {
        line: 'Ba lần chiếu đúng một thế cũ là trường chiếu rồi đó {name} - bên chiếu phải đổi nước, không thì kỳ đài xử thua ngay tại bàn.',
        emotion: 'check',
        gesture: 'closeup_talk',
        stageDirection: 'Gõ hai nhịp quạt xuống bàn theo từng vòng chiếu',
        motif: 'Trường Chiếu Định Phận',
      },
      {
        line: 'Chiếu hay mà chiếu lặp ba vòng thì hay thành phạm luật rồi. Đổi nước đi {audience} ơi, kỳ đài không chờ đâu!',
        emotion: 'amused',
        gesture: 'tease',
        stageDirection: 'Xòe ba ngón tay đếm từng vòng lặp, mỉm cười',
      },
      {
        line: 'Khai cuộc mà dọa nhau đúng một nước ba lần thì bên chiếu hết bài rồi {name} ạ. Không đổi là chịu luật.',
        emotion: 'thinking',
        gesture: 'think_fan',
        stageDirection: 'Che nửa mặt sau quạt, mắt vẫn dõi theo vòng chiếu',
      },
    ],
    soc: [
      {
        line: 'Nặng rồi: chiếu lại đúng thế cũ lần thứ ba. Kỳ đài không chờ nước thứ tư đâu {audience} ơi.',
        emotion: 'surprised',
        gesture: 'closeup_talk',
        stageDirection: 'Nghiêng người về trước, giọng chùng xuống một nhịp',
      },
      {
        line: '{capSelf} không cãi: ba vòng đúng một thế là đủ để xử rồi {audience} ạ. Nước sau mới là nước đáng xem.',
        emotion: 'thinking',
        gesture: 'think_fan',
        stageDirection: 'Đặt quạt xuống bàn, mắt nhìn kỳ phổ thay vì ống quay',
      },
      {
        line: 'Ba vòng, một thế, một phán quyết. {name} thấy rõ mà, không cần cãi thêm nước nào.',
        emotion: 'calm',
        gesture: 'groom_react',
        stageDirection: 'Giơ tay ra hiệu khép nước, gật đầu với ống quay',
      },
    ],
    khong_mu_phuong: [
      {
        line: 'Mất hết rồi thì càng phải đi đúng luật. Chiếu lặp ba vòng là xử, {audience} làm chứng giúp kỳ đài nhé.',
        emotion: 'fierce',
        gesture: 'closeup_talk',
        stageDirection: 'Ngồi thẳng lưng, hai tay đặt lên bàn, nhìn thẳng ống quay',
        motif: 'Trường Chiếu Định Phận',
      },
      {
        line: '{capSelf} không cần ai nể mặt: chiếu lặp thì tự chịu, đổi nước đi thì bàn cờ lại mở.',
        emotion: 'calm',
        gesture: 'think_fan',
        stageDirection: 'Gấp quạt dựng trước mặt, giọng đều như đọc điều luật',
      },
      {
        line: 'Hồi môn không còn, luật vẫn còn một câu: bên chiếu lặp phải đổi. Đổi nước thì bàn cờ này còn sóng, {name} ạ.',
        emotion: 'amused',
        gesture: 'sip_tea',
        stageDirection: 'Nhấp một ngụm trà, đặt chén xuống đúng nhịp gõ búa',
      },
    ],
  },
  repetition_draw: {
    do_dai: [
      {
        line: 'Đúng một con đường ba lần thì kỳ đài xử hòa thôi {name} - hai bên đều thuộc bài nhau cả rồi.',
        emotion: 'calm',
        gesture: 'sip_tea',
        stageDirection: 'Khoanh tay trước bàn cờ, mỉm cười nhận thế lặp',
        motif: 'Lặp Thế Thu Cờ',
      },
      {
        line: 'Hai bên cùng đi lại nước cũ lần thứ ba. Muốn thắng thì phải đổi hướng, cứ lặp vầy thì trăng tàn chưa dứt ván đâu.',
        emotion: 'amused',
        gesture: 'tease',
        stageDirection: 'Đếm ba vòng bằng ngón tay, nhếch mép trêu',
      },
      {
        line: 'Hòa vì lặp thế chứ không vì hết nước. {audience} thấy đó, chưa ai chịu mở trước.',
        emotion: 'thinking',
        gesture: 'think_fan',
        stageDirection: 'Phe phẩy quạt, liếc sang bảng kỳ phổ treo sau lưng',
      },
    ],
    soc: [
      {
        line: 'Lại đúng thế cũ lần thứ ba... {self} cũng không muốn thế này. Kỳ đài xử hòa, ván sau mình đánh khác nhé {name}.',
        emotion: 'surprised',
        gesture: 'closeup_talk',
        stageDirection: 'Thở ra một nhịp ngắn, tay chạm quân cờ rồi rút về',
      },
      {
        line: 'Ba vòng cùng một thế, không ai buông trước. Hòa là đúng luật, {audience} bớt ồn cho {self} nghe nước cuối.',
        emotion: 'calm',
        gesture: 'groom_react',
        stageDirection: 'Gật đầu với ống quay, đưa tay mời phòng live im tiếng',
      },
      {
        line: '{name} giữ kỳ phổ lại đi. Hòa hôm nay là vì {self} với {guest} đọc nhau quá kỹ, không phải vì hết nước.',
        emotion: 'thinking',
        gesture: 'think_fan',
        stageDirection: 'Dựng quạt trước mặt, nhìn ô cuối của vòng lặp',
        motif: 'Kỳ Phùng Địch Thủ',
      },
    ],
    khong_mu_phuong: [
      {
        line: 'Hồi môn mất hết rồi, hòa thêm một ván nữa cũng chẳng đau. Luật lặp thế là luật chung, {name} ạ.',
        emotion: 'fierce',
        gesture: 'closeup_talk',
        stageDirection: 'Ngồi thẳng, hai tay buông trên thành ghế, mắt không rời bàn',
      },
      {
        line: '{capSelf} không xin hòa đâu. Kỳ đài xử vì thế lặp ba vòng, {audience} làm chứng là chẳng ai đổi nước.',
        emotion: 'calm',
        gesture: 'sip_tea',
        stageDirection: 'Uống trà chậm, đặt chén xuống không một tiếng động',
        motif: 'Lặp Thế Thu Cờ',
      },
      {
        line: 'Còn ván sau: {self} sẽ đổi thế. {guest} có đổi không thì để {audience} đoán trước.',
        emotion: 'amused',
        gesture: 'tease',
        stageDirection: 'Che nửa mặt sau quạt, liếc ống quay chờ phiếu đoán',
      },
    ],
  },
  sixty_move_draw: {
    do_dai: [
      {
        line: 'Sáu mươi hiệp mà chưa rơi quân nào thì hòa theo luật, {name} à. Hai bên đều chắc tay, và đều chưa dám mở trước.',
        emotion: 'calm',
        gesture: 'sip_tea',
        stageDirection: 'Xoay chén trà, gật đầu công nhận thế thủ',
        motif: 'Sáu Mươi Hiệp',
      },
      {
        line: '{capGuest} giữ kỹ thật: một trăm hai mươi nửa nước không mất quân nào. Hòa rồi, ván sau mạnh tay hơn đi {audience} ơi!',
        emotion: 'amused',
        gesture: 'tease',
        stageDirection: 'Giơ hai ngón tay đếm hiệp, bật cười',
      },
      {
        line: 'Hòa vì hết hiệp chứ không vì hết nước. {audience} thấy đó: một trăm hai mươi nửa nước mà chẳng ai mất thêm quân nào.',
        emotion: 'thinking',
        gesture: 'think_fan',
        stageDirection: 'Quạt lướt trên mặt bàn cờ, chưa kịp chạm quân nào',
      },
    ],
    soc: [
      {
        line: 'Một trăm hai mươi nửa nước bình chân như vại... {self} cũng bí. Hòa là xử đúng, không ai oan cả {audience} ạ.',
        emotion: 'surprised',
        gesture: 'closeup_talk',
        stageDirection: 'Chống cằm nhìn bảng đếm hiệp, rồi ngẩng lên ống quay',
        motif: 'Bình Chân Như Vại',
      },
      {
        line: 'Sáu mươi hiệp không ai ăn quân nào. {audience} nể hay không thì kỳ đài vẫn chỉ có một câu: hòa.',
        emotion: 'calm',
        gesture: 'groom_react',
        stageDirection: 'Đứng dậy khoanh tay chào một nhịp rồi ngồi xuống',
      },
      {
        line: '{name} thủ chắc đến mức {self} chịu hết nước. Ván sau đừng thủ nữa, kỳ đài muốn sóng gió kia kìa.',
        emotion: 'amused',
        gesture: 'sip_tea',
        stageDirection: 'Nhấp trà, mắt nể đối thủ qua bờ chén',
      },
    ],
    khong_mu_phuong: [
      {
        line: 'Mất hồi môn rồi mà ván này vẫn chưa ai dứt điểm ai. Hòa theo luật sáu mươi hiệp, {audience} thấy công bằng không?',
        emotion: 'fierce',
        gesture: 'closeup_talk',
        stageDirection: 'Tay đặt lên ô giữa bàn, giọng đều không gợn',
      },
      {
        line: '{capSelf} không đổ cho luật. Sáu mươi hiệp không ăn quân thì xử hòa, và ván sau {self} đánh khác.',
        emotion: 'calm',
        gesture: 'think_fan',
        stageDirection: 'Gấp quạt dựng trước mặt, chỉ ngẩng lên sau khi khép bàn cờ',
        motif: 'Sáu Mươi Hiệp',
      },
      {
        line: 'Hòa mà chẳng mất thêm quân nào, coi như hai bên cùng giữ được thể diện. {self} giữ đòn cho ván sau đó {name}!',
        emotion: 'amused',
        gesture: 'tease',
        stageDirection: 'Khép bàn cờ, tay để hờ trên quân xe chưa đi',
      },
    ],
  },
};

export function commentaryTier(params: {
  ladderStep: number;
  phase: 'khai_cuoc' | 'trung_cuoc' | 'tan_cuoc' | 'hoi_ket';
  moveCount: number;
  scoreDeltaForRed: number;
}): CommentaryTier | null {
  if (params.ladderStep >= 3) return 'khong_mu_phuong';
  if (params.phase === 'khai_cuoc' && params.moveCount <= 6) return 'do_dai';
  if (Math.abs(params.scoreDeltaForRed) >= 200) return 'soc';
  return null;
}

export function tierPool(
  event: TacticalEventType,
  tier: CommentaryTier | null,
): BankEntry[] {
  if (!tier) return [];
  return TIERED_BANK[event]?.[tier] ?? [];
}

export const COMMENTARY_TIERS: CommentaryTier[] = ['do_dai', 'soc', 'khong_mu_phuong'];

/**
 * The six sát pháp the rotation advertises get a voice of their own, keyed by pattern instead of by
 * tactical event: the banner has named them for months while the room only ever heard generic check
 * copy. Two rules hold here. A pattern line describes the shape on the board and never its outcome -
 * only the referee and the engine get to end a game. And the pool is spent only when the bride is the
 * one holding the pattern, because this copy is written in her voice, about her own pieces.
 */
const KILL_PATTERN_BANK: Partial<Record<KillPatternId, Record<CommentaryTier, BankEntry[]>>> = {
  qua_giac_ma: {
    do_dai: [
      {
        line: 'Ngựa treo đúng góc cung — {motif} đó {audience}. Đường lui của {guest} bị cắt mất một nửa rồi nha.',
        emotion: 'check',
        gesture: 'closeup_talk',
        stageDirection: 'Chỉ mũi quạt vào góc cung, gật gù',
      },
      {
        line: 'Ngựa đứng góc cung, quạt kề má. {guest} thấy bài này quen chưa? Sách vỡ lòng ai cũng học một lần.',
        emotion: 'amused',
        gesture: 'tease',
        stageDirection: 'Kè quạt sát má, nháy mắt với ống kính',
      },
      {
        line: 'Chưa chiếu ngay đâu, nhưng ngựa nằm góc cung thì đi đâu cũng vướng vó, {name} à.',
        emotion: 'thinking',
        gesture: 'think_fan',
        stageDirection: 'Gạt nhẹ quạt qua bốn ô quanh cung',
      },
    ],
    soc: [
      {
        line: 'Góc cung của {guest} vừa mở một ô — {motif} {self} treo ở đó, và {self} chưa định gỡ xuống đâu {audience}.',
        emotion: 'fierce',
        gesture: 'closeup_talk',
        stageDirection: 'Đặt mã vào góc cung, ngón tay giữ quân một nhịp lâu',
      },
      {
        line: 'Nước này {self} không cãi: {motif} là {guest} đi đúng sách. Đúng sách và đỡ được là hai chuyện khác nhau {audience} ạ.',
        emotion: 'thinking',
        gesture: 'think_fan',
        stageDirection: 'Gật đầu công nhận, rồi miết ngón tay lên mặt bàn',
        by: 'guest',
      },
      {
        line: '{self} suýt mất xe vì cái góc cung đó. Dân chơi cờ sợ nhất con ngựa đứng chéo, nhớ nhé {name}.',
        emotion: 'calm',
        gesture: 'sip_tea',
        stageDirection: 'Uống trà lấy lại bình tĩnh, tay còn run nhẹ',
        by: 'guest',
      },
    ],
    khong_mu_phuong: [
      {
        line: 'Mất mũ phượng rồi mà {self} vẫn thấy góc cung của {guest} chật như ao làng. {motif} chưa phải hết đâu.',
        emotion: 'fierce',
        gesture: 'closeup_talk',
        stageDirection: 'Chống hai tay lên bàn, nhìn thẳng vào đối phương',
      },
      {
        line: '{motif} đẹp thật, nhưng {self} đứng góc cung cả chục ván rồi, {name} à.',
        emotion: 'amused',
        gesture: 'tease',
        stageDirection: 'Cười khẩy, quạt phe phẩy vẻ không vội',
        by: 'guest',
      },
      {
        line: 'Không còn lớp nào để mất, {self} mới dám cãi: góc cung đó chưa khép đâu {audience}.',
        emotion: 'calm',
        gesture: 'think_fan',
        stageDirection: 'Mở quạt chậm, ánh mắt lần theo từng ô thoát',
      },
    ],
  },
  bach_kiem_tuong: {
    do_dai: [
      {
        line: 'Hai ông vua nhìn nhau rồi {audience} ạ. Không quân nào che giữa, là một bên phải quay đi.',
        emotion: 'check',
        gesture: 'closeup_talk',
        stageDirection: 'Kẻ một đường thẳng bằng quạt từ tướng này sang tướng kia',
      },
      {
        line: '{motif} — {self} không cần thêm quân nào để buộc {guest} quay mặt. {name} coi thử xem.',
        emotion: 'amused',
        gesture: 'tease',
        stageDirection: 'Nhướng mày, tay vỗ nhẹ lên mặt bàn',
      },
      {
        line: 'Trông mặt nhau thế này thì ai cũng phải dè chừng, {name} ạ. Đó là luật, không phải {self} doạ.',
        emotion: 'thinking',
        gesture: 'think_fan',
        stageDirection: 'Gấp quạt, gõ đầu quạt theo nhịp từng chữ',
      },
    ],
    soc: [
      {
        line: 'Ố... {guest} mở cột giữa toang thế kia thì {self} chỉ việc nhìn mặt thôi. Đau đấy {audience} ơi.',
        emotion: 'surprised',
        gesture: 'closeup_talk',
        stageDirection: 'Hé mắt nhìn lên cột giữa, tay khựng lại',
      },
      {
        line: '{motif} dựng được là do {self} để trống cột ấy. {audience} thấy rồi đấy, {self} không đổ cho ai.',
        emotion: 'fierce',
        gesture: 'think_fan',
        stageDirection: 'Tự nhận bằng một cái gật, môi mím chặt',
        by: 'guest',
      },
      {
        line: '{self} quên mất luật mặt đối mặt. Thôi, uống ngụm trà rồi tính lại, {guest} cứ đi tiếp đi.',
        emotion: 'calm',
        gesture: 'sip_tea',
        stageDirection: 'Chén trà đưa lên, mắt vẫn khoá vào cột giữa',
        by: 'guest',
      },
    ],
    khong_mu_phuong: [
      {
        line: 'Mất ba lớp rồi, {self} chẳng còn gì ngoài cột giữa trống trơn. {guest} dám nhìn thẳng không?',
        emotion: 'fierce',
        gesture: 'closeup_talk',
        stageDirection: 'Ngẩng cao đầu, nhìn không chớp, tóc trần chỉ còn cài que',
      },
      {
        line: '{motif} là nước {self} để dành tới tận bây giờ. Không mũ phượng thì vẫn hai mặt đối mặt, {name} ạ.',
        emotion: 'calm',
        gesture: 'tease',
        stageDirection: 'Đẩy pháo vào giữa, động tác chậm mà chắc',
      },
      {
        line: 'Ba lớp mất vì một cột trống: {motif} của {guest} gọn, và {self} nhớ nước này đến tận đêm sau {name} ạ.',
        emotion: 'thinking',
        gesture: 'closeup_talk',
        stageDirection: 'Nhìn lên cột giữa một lúc lâu, rồi mới gấp quạt',
        by: 'guest',
      },
    ],
  },
  ngo_tao_ma: {
    do_dai: [
      {
        line: 'Ngựa vào ổ cỏ rồi đó {audience} — sát cung một ô thôi, mà đường lui của {guest} hẹp thấy rõ.',
        emotion: 'check',
        gesture: 'closeup_talk',
        stageDirection: 'Chỉ mũi quạt vào ô ngựa nằm sát cung, gật gù',
      },
      {
        line: '{motif} không ăn quân nào của {guest}: chỉ đứng đúng chỗ đó là ba cửa thoát khép lại.',
        emotion: 'amused',
        gesture: 'tease',
        stageDirection: 'Kề quạt bên má, cười kiểu người ra đề đã có đáp án',
      },
      {
        line: 'Xe pháo nhà {guest} muốn về đỡ cũng vướng chân nhau, {name} ạ. Đó là cái hay của con ngựa nằm ổ.',
        emotion: 'thinking',
        gesture: 'think_fan',
        stageDirection: 'Gạt quạt ngang hai cột xe, mắt lần theo đường lùi',
      },
    ],
    soc: [
      {
        line: 'Chết thật... {self} quên mất con ngựa nằm ổ. Một nước của {guest} mà ba cửa cung của {self} hẹp lại rồi {audience} ơi.',
        emotion: 'surprised',
        gesture: 'closeup_talk',
        stageDirection: 'Ngả người ra sau, tay ôm chén trà chưa kịp uống',
        by: 'guest',
      },
      {
        line: '{motif} của {guest} đúng sách, mà sách thì {self} thuộc hơn {guest} đấy. Nhưng hôm nay {self} đang lơ đãng.',
        emotion: 'fierce',
        gesture: 'think_fan',
        stageDirection: 'Gấp quạt rồi mở ra, mắt không rời cột chốt',
        by: 'guest',
      },
      {
        line: 'Ổ cỏ này {self} chiếm rồi: điểm nhảy lên bao nhiêu thì {guest} cũng phải nhìn con ngựa đó trước đã {name} ạ.',
        emotion: 'check',
        gesture: 'think_fan',
        stageDirection: 'Quạt gõ hai nhịp lên ô ngựa, mắt không rời bàn',
      },
    ],
    khong_mu_phuong: [
      {
        line: 'Mất hết hồi môn nên {self} chẳng nhịn nữa: ổ cỏ này {self} đóng chốt, {guest} liệu mà mở đường.',
        emotion: 'check',
        gesture: 'closeup_talk',
        stageDirection: 'Đặt quân dứt khoát, tóc chỉ còn que cài, nhìn thẳng',
      },
      {
        line: '{motif} mà {guest} học từ ai vậy? Không chê đâu nha, {self} chỉ tò mò vì nước này đẹp thật.',
        emotion: 'amused',
        gesture: 'tease',
        stageDirection: 'Nghiêng đầu cười nửa miệng, quạt kề má chờ câu trả lời',
        by: 'guest',
      },
      {
        line: 'Không mũ phượng, {self} vẫn thích bài này nhất đêm nay. Đỡ được thì uống trà cùng {audience} nhé.',
        emotion: 'fierce',
        gesture: 'sip_tea',
        stageDirection: 'Nâng chén về phía ống kính rồi mới nhìn bàn',
      },
    ],
  },
  thiet_mon_thuyen: {
    do_dai: [
      {
        line: 'Pháo giữ cột giữa, then ngang trước cửa cung. {audience} coi, không có chìa khoá đâu {name} ạ.',
        emotion: 'check',
        gesture: 'closeup_talk',
        stageDirection: 'Gõ sống quạt xuống ô giữa như đang đóng then cửa',
      },
      {
        line: '{motif} là bài dạy người mới, nhưng người mới đỡ mãi vẫn chưa ra. {self} uống trà chờ.',
        emotion: 'amused',
        gesture: 'sip_tea',
        stageDirection: 'Nhấp trà, vẻ mặt của người ra đề đã biết đáp án',
      },
      {
        line: 'Cửa đóng then rồi {guest} ơi — quân nào của {guest} cũng phải đi đường vòng, còn {self} thì đi tắt.',
        emotion: 'thinking',
        gesture: 'think_fan',
        stageDirection: 'Xoay quạt, chỉ lượt từng quân đang bị trói',
      },
    ],
    soc: [
      {
        line: '{guest} dựng then cửa sắt thật... {self} đang loay hoay với hai quân bị trói chân đây {audience}.',
        emotion: 'surprised',
        gesture: 'think_fan',
        stageDirection: 'Chống cằm, quạt mở nửa, mắt khoá cột giữa',
        by: 'guest',
      },
      {
        line: 'Cửa đóng rồi. {self} phải đổi một xe để chặt then: đắt, nhưng {self} chịu.',
        emotion: 'fierce',
        gesture: 'closeup_talk',
        stageDirection: 'Đặt quân mạnh hơn thường lệ, môi mím chặt',
        by: 'guest',
      },
      {
        line: 'Then này {self} đóng, và {guest} phải phá bằng hai nước. Cột giữa thuộc về {self} rồi {audience} ạ.',
        emotion: 'fierce',
        gesture: 'closeup_talk',
        stageDirection: 'Ghiền sống quạt xuống cột giữa, thế ngồi không đổi',
      },
    ],
    khong_mu_phuong: [
      {
        line: 'Then cửa sắt với cô dâu không còn mũ phượng — {guest} cứ thử mở xem, {self} ngồi ngoài hiên chờ.',
        emotion: 'fierce',
        gesture: 'closeup_talk',
        stageDirection: 'Tựa lưng vào cột chòi, thong dong không vội',
      },
      {
        line: '{self} mất ba lớp cũng vì những nước như thế này, nên {motif} đêm nay không làm {self} run nữa {name} à.',
        emotion: 'calm',
        gesture: 'sip_tea',
        stageDirection: 'Vuốt phẳng tay áo, ánh mắt bình thản lạ thường',
        by: 'guest',
      },
      {
        line: 'Cửa có then, nhưng {self} có thời gian. {audience} đếm giùm: {guest} cần mấy nước để phá?',
        emotion: 'amused',
        gesture: 'tease',
        stageDirection: 'Xoè ngón tay đếm cùng khán giả, miệng cười',
      },
    ],
  },
  song_xa_thac: {
    do_dai: [
      {
        line: 'Hai xe một trên một dưới — {motif} đó {audience}. {guest} chọn đường nào cũng là đường hẹp.',
        emotion: 'check',
        gesture: 'closeup_talk',
        stageDirection: 'Lướt tay theo hai cột xe, trên rồi dưới',
      },
      {
        line: 'Xe chồng chéo thế này thì {self} chỉ việc uống trà chờ {guest} chọn nhầm ô, {name} ạ.',
        emotion: 'amused',
        gesture: 'sip_tea',
        stageDirection: 'Nghiêng chén trà, mắt liếc hai con xe',
      },
      {
        line: 'Một xe dò đường, một xe đóng cửa. Bài này đọc sách một lần là nhớ, {audience} ơi.',
        emotion: 'thinking',
        gesture: 'think_fan',
        stageDirection: 'Xoè hai ngón tay đếm từng con xe',
      },
    ],
    soc: [
      {
        line: 'Hai xe của {guest} đi luân phiên thật... {self} đỡ được một nước, nước thứ hai thì {self} thú là khó.',
        emotion: 'surprised',
        gesture: 'think_fan',
        stageDirection: 'Quạt mở rồi gấp, gấp rồi mở theo nhịp xe',
        by: 'guest',
      },
      {
        line: 'Đỡ mãi không hết, kiểu này dân cờ tường rất ghét. {self} đang ghét đây {audience} ạ.',
        emotion: 'fierce',
        gesture: 'closeup_talk',
        stageDirection: 'Chật vật nhìn bàn, môi mím, tay chống cằm',
        by: 'guest',
      },
      {
        line: 'Xe trên dò đường, xe dưới đóng cửa — hai xe của {self} đi cùng nhịp rồi {guest} ạ, {audience} thấy điểm chưa?',
        emotion: 'check',
        gesture: 'closeup_talk',
        stageDirection: 'Lướt tay hai lần theo hai cột xe, trên rồi dưới',
      },
    ],
    khong_mu_phuong: [
      {
        line: '{guest} có hai xe, {self} còn mỗi cái đầu lạnh sau khi ba lớp hồi môn đã mất. Đánh tiếp đi {name}.',
        emotion: 'fierce',
        gesture: 'closeup_talk',
        stageDirection: 'Ngồi thẳng, tóc chỉ còn que cài, nhìn không chớp',
        by: 'guest',
      },
      {
        line: '{motif} mà {self} còn đứng tới nước này thì {audience} nên thả tim cho cả hai bên rồi đó.',
        emotion: 'amused',
        gesture: 'tease',
        stageDirection: 'Giơ chén trà về phía ống kính như cụng ly',
        by: 'guest',
      },
      {
        line: 'Không còn lớp nào để mất, {self} mới dám đẩy cả hai xe vào cửa hẹp. {guest} tính lại đi {name}.',
        emotion: 'fierce',
        gesture: 'closeup_talk',
        stageDirection: 'Đặt hai con xe song song, ngón tay rời quân thật chậm',
      },
    ],
  },
  dai_dao_hoach_tam: {
    do_dai: [
      {
        line: 'Xe đào thẳng vào tim cung — {motif} đó {audience}. Sĩ của {guest} đang phải nằm xuống.',
        emotion: 'fierce',
        gesture: 'closeup_talk',
        stageDirection: 'Đẩy quân xe vào ô giữa, mắt sáng lên',
      },
      {
        line: 'Can đảm mới đi được nước này: một xe chui giữa cung. Hời hay lỗ thì {self} chịu.',
        emotion: 'amused',
        gesture: 'think_fan',
        stageDirection: 'Quạt che nửa mặt, chỉ lộ đôi mắt đang tính',
      },
      {
        line: '{self} thích bài này vì nó đơn giản: cửa giữa mở thì tim lộ ra, {name} à.',
        emotion: 'calm',
        gesture: 'sip_tea',
        stageDirection: 'Rót trà chậm, kiểu người đã nắm được thế',
      },
    ],
    soc: [
      {
        line: '{guest} đào tim {self} thật rồi... mất sĩ giữa là mất luôn lớp che cuối cùng {audience} ơi.',
        emotion: 'surprised',
        gesture: 'closeup_talk',
        stageDirection: 'Tay dừng giữa không trung, miệng hơi hé',
        by: 'guest',
      },
      {
        line: 'Nước này đau. Nhưng {self} không đổ cho ai: chính {self} để hở ô giữa.',
        emotion: 'thinking',
        gesture: 'think_fan',
        stageDirection: 'Cúi nhìn bàn, ngón tay miết dọc sống quạt',
        by: 'guest',
      },
      {
        line: 'Sĩ của {guest} vừa nằm xuống, cột giữa mở toang — {self} đi trước một nhịp rồi {name} ạ.',
        emotion: 'check',
        gesture: 'think_fan',
        stageDirection: 'Quạt mở rộng che nửa bàn, mắt ánh lên',
      },
    ],
    khong_mu_phuong: [
      {
        line: 'Hồi môn mất hết rồi, tim cung còn mỗi một quân giữ. {guest} cứ việc {motif}, {self} không né.',
        emotion: 'fierce',
        gesture: 'closeup_talk',
        stageDirection: 'Ngẩng cao đầu, để hở nguyên ô giữa trước mặt đối phương',
        by: 'guest',
      },
      {
        line: '{motif} mà {guest} đi được thì {self} phải ngồi lại mà xem. {audience} nhớ cổ vũ nước đỡ nhé.',
        emotion: 'amused',
        gesture: 'tease',
        stageDirection: 'Cười thật, khoanh tay trước ngực chờ nước kế',
        by: 'guest',
      },
      {
        line: 'Tim cung của {guest} trống một ô, và {self} không cần mũ phượng mới dám đi vào đó {audience} ạ.',
        emotion: 'fierce',
        gesture: 'closeup_talk',
        stageDirection: 'Đẩy xe vào ô giữa, vai thẳng, không né mắt',
      },
    ],
  },
};

/** The patterns with their own voice. The show and its tests both read this instead of guessing. */
export const BANKED_KILL_PATTERNS = Object.keys(KILL_PATTERN_BANK) as KillPatternId[];

export function killPatternPool(
  patternId: KillPatternId | null | undefined,
  tier: CommentaryTier | null,
  holder?: PatternHolder,
): BankEntry[] {
  if (!patternId || !tier) return [];
  const pool = KILL_PATTERN_BANK[patternId]?.[tier] ?? [];
  return holder ? pool.filter((entry) => (entry.by ?? 'self') === holder) : pool;
}

/**
 * Every pool that holds broadcast copy, tiered events and named patterns together. The wording and
 * quota invariants walk this, so a bank cannot dodge a check just by not being `TIERED_BANK`.
 */
export function bankedPools(): Array<{ id: string; tier: CommentaryTier; entries: BankEntry[] }> {
  const out: Array<{ id: string; tier: CommentaryTier; entries: BankEntry[] }> = [];
  for (const event of Object.keys(TIERED_BANK) as TacticalEventType[]) {
    for (const tier of COMMENTARY_TIERS) {
      out.push({ id: event, tier, entries: tierPool(event, tier) });
    }
  }
  for (const patternId of BANKED_KILL_PATTERNS) {
    for (const tier of COMMENTARY_TIERS) {
      out.push({ id: patternId, tier, entries: killPatternPool(patternId, tier) });
    }
  }
  return out;
}
