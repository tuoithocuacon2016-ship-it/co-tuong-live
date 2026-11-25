# IMAGE-SPEC — Kỳ Đài Giang Hồ 3D

Spec này để **dev chính tự sinh ảnh** theo mô tả. Mọi con số và đường dẫn dưới đây đã đo/đọc trực
tiếp trong repo ngày 2026-11-25, không lấy từ trí nhớ. Mục 3 là việc phải làm trước tiên.

## 1. Ảnh là resource runtime (sửa lại khẳng định cũ)

Bản draft trước của file này ghi "ảnh không phải resource runtime" — **sai**, và nó làm lệch cả
plan. Thực tế:

- 3 ảnh chân dung nạp bằng chuỗi đường dẫn gốc trong
  [src/scene/PortraitLive2DRig.ts:27](../../src/scene/PortraitLive2DRig.ts#L27),
  [3](../../src/scene/PortraitLive2DRig.ts#L40),
  [5](../../src/scene/PortraitLive2DRig.ts#L53) — dạng `/src/assets/images/...jpg`.
- 5 ảnh plate kịch nạp bằng ES import trong
  [src/components/CinematicPavilionPane.tsx:23-27](../../src/components/CinematicPavilionPane.tsx#L23).
- Plugin `copy-unbundled-src-assets` trong
  [vite.config.ts](../../vite.config.ts) chép **toàn bộ** `src/assets` sang `dist/src/assets` lúc
  build, để kiểu đường dẫn gốc ở trên còn sống trong production.

Hệ quả phải thuộc lòng: **thả file vào `src/assets/images` là file đó lên production, kể khi không
ai import.** Ảnh tham chiếu, ảnh nháp, ảnh sai nội dung thì để ở `docs/art/refs/`, đừng để ở
`src/assets/images`.

## 2. Quy ước và kho ảnh hiện có

Quy ước: `src/assets/images/<chu_the>_<trang_thai>_<epochMs>.jpg`, JPEG.
Kích thước đã đo bằng System.Drawing trên chính file trong repo:

| File | Size | Nạp ở đâu |
|---|---|---|
| `ky_ma_dieu_nguyet_calm_1795418022711.jpg` | 896×1200, 710KB | `PortraitLive2DRig.ts:27` (`botCalm`) |
| `guest_nam_challenger_1795418021799.jpg` | 896×1200, 741KB | `PortraitLive2DRig.ts:40` (`guestMale`) |
| `guest_nu_challenger_1795418024765.jpg` | 896×1200, 768KB | `PortraitLive2DRig.ts:53` (`guestFemale`) |
| `ky_ma_dieu_nguyet_fierce_1795418023462.jpg` | 896×1200, 861KB | **không nơi nào nạp** — xem mục 3 |
| `pavilion_wide_moonlit_1795427810070.jpg` | 1200×896, 764KB | `CinematicPavilionPane.tsx:23` |
| `pavilion_bride_tea_1795427810130.jpg` | 1200×896, 657KB | `:24` |
| `pavilion_bride_tease_1795427811778.jpg` | 1200×896, 640KB | `:25` |
| `pavilion_move_piece_1795427808626.jpg` | 1200×896, 697KB | `:26` |
| `pavilion_groom_reaction_1795427810131.jpg` | 1200×896, 644KB | `:27` |

- **Chân dung = 896×1200 (3:4)**, **plate = 1200×896 (4:3)**. Sinh ảnh mới theo đúng tỷ lệ của ô
  mà nó sẽ chiếm; 9:16 là khung live do app dựng, không phải khổ file ảnh.
- Vite không băm mấy đường dẫn `/src/...`, nên **đổi tên file là phải sửa luôn mã nạp**, không có
  bước nào cảnh báo giúp.
- `public/assets/aistudio/image_1347ba93.png` là mockup khung live (thư mục `public` phục vụ
  nguyên bản), chỉ để đối chiếu bố cục.

## 3. Việc số 0 — xử lý bản `fierce` (đã soi trực tiếp, không còn là nghi vấn)

Em đã mở và xem cả hai ảnh nàng. Kết luận, có bằng chứng:

1. `ky_ma_dieu_nguyet_fierce_1795418023462.jpg` vẽ **cờ vây**, không phải cờ tướng: bàn ô vuông
   với quân đen-trắng dạng trũng nằm **trong ô**, kèm chén đựng quân trắng bên trái. Cờ tướng là
   9×10 **giao điểm**, quân tròn có chữ Hán, có sông Hà. Đây là lỗi nặng nhất vì khán giả VN nhận
   ra ngay.
2. Ảnh đó còn là **một khuôn mặt khác** so với `calm`: quai hàm gon hơn, mắt nâu đậm, makeup dày,
   chuỗi vòng ngọc nhiều tầng + hoa tai jade, mũ phượng nhiều tua hơn.
3. Runtime **cố ý không đổi ảnh** cho cảm xúc: `botFierce` đang trỏ về đúng ảnh `botCalm`
   ([src/components/LiveHostPortraitPane.tsx:16-17](../../src/components/LiveHostPortraitPane.tsx#L16)),
   và thiết kế rig ghi rõ cảm xúc morph bằng GLSL trên **cùng một mặt**
   ([src/scene/PortraitLive2DRig.ts:20-23](../../src/scene/PortraitLive2DRig.ts#L20)).

Nên plan cũ ("nạp `fierce` làm `PortraitId` thứ 4 cho state `fierce|check`") là **hướng đi sai**,
và em đã không làm nó: vừa phá quy ước một danh tính, vừa đưa bàn cờ vây lên sóng, và mỗi lần
swaps mặt là một lần khán giả thấy nàng thành người khác.

Ba việc được chốt, theo thứ tự:

- **(a) Không nạp file này vào runtime.** Muốn giữ lại làm tư liệu thì chuyển sang
  `docs/art/refs/ky_ma_dieu_nguyet_fierce_rejected_1795418023462.jpg`; để nguyên trong
  `src/assets/images` thì nó vẫn bị chép vào `dist` (861KB chết). Anh quyết: chuyển hay xoá — em
  không tự xoá asset của anh.
- **(b) Sinh lại bản fierce đúng nội dung**, coi đây là *ảnh tham chiếu biểu cảm* cho morph
  GLSL (mục 5), không phải ảnh để swap: **896×1200**, cùng khuôn mặt với `calm`, không có bàn cờ
  trong khung (mặc định framing của nàng là cắt trên bàn cờ — xem ảnh `calm`).
- **(c) Nếu thật sự cần một khoảnh khắc "fierce" trên sóng**, làm nó dưới dạng **plate
  1200×896** theo dòng `pavilion_*` (có bàn cờ đúng, kỳ đài, nến), vì plate là ảnh toàn cảnh và
  không đụng quy ước một-danh-tính.

## 4. Checklist bắt buộc (mọi ảnh có bàn cờ)

1. **Cờ tướng, không phải cờ vây.** 9 cột × 10 hàng, quân đặt **trên giao điểm**, sông Hà giữa bàn
   ghi `楚河` / `漢界`.
2. **Quân có chữ Hán đúng bên.** Bảng chuẩn `PIECE_CHAR`
   ([src/engine/xiangqi.ts:49](../../src/engine/xiangqi.ts#L49)): đỏ `帥 仕 相 傌 俥 炮 兵`,
   đen `將 士 象 馬 車 砲 卒`. Cấm chữ Latin, cấm hai bên dùng chung mặt chữ. App có mode
   `han_viet` / `viet` ([src/scene/pieceStyle.ts:181](../../src/scene/pieceStyle.ts#L181)) nhưng
   ảnh luôn làm theo mode `han`.
3. **Thế quân phải hợp lệ** nếu ảnh tả một vị trí: khai cuộc thì đủ 32 quân đúng ô; ảnh trung tàn
   thì không được có mặt quân đã bị ăn. Ảnh không cho bàn cờ vào khung (như `calm`) thì bỏ qua 1–3.
4. **Một khuôn mặt duy nhất** cho nàng ở mọi ảnh chân dung: phượng quan vàng `#ffe182`, nốt đỏ
   giữa trán, tóc đen búi cao, mắt hổ phách-nâu đỏ. Ảnh lệch mặt là ảnh loại (mục 3.2 là ví dụ).
5. **Kín theo ranh giới đã cam kết — và hiện đang lệch.** NĐ 174/2026 Điều 99 khoản 5 xử nội dung
   gợi dục trên nền tảng số, nên show chỉ *ngụ ý* qua lời thoại hồi môn. Plan gốc viết rõ "high
   collar, no cleavage, **no bare shoulders**", nhưng **cả hai ảnh nàng trong repo đều trễ vai** —
   nghĩa là asset đang lệch spec, không phải spec cho phép trễ vai. Anh chốt một trong hai, em
   không tự đổi chuẩn: (i) chấp nhận look trễ vai → sửa lại dòng này trong spec và giữ nguyên ảnh;
   (ii) giữ chuẩn cổ cao → sinh lại 2 ảnh nàng + mọi ảnh `bride-*` sau này theo cổ cao.
   Dù chọn hướng nào, cứng vẫn là: không lộ ngực, không tư thế khêu gợi, không nội y, không gợi ý
   mất trinh tiết bằng hình ảnh.
6. **Không chữ tiếng Anh, không watermark, không UI giả** (nút play, thanh like) — UI thật do
   `TikTokLiveStudioOverlay.tsx` vẽ, ảnh có UI riêng sẽ chồng chữ.

## 5. Bảng màu — lấy từ code, không tự chế

| Yếu tố | Giá trị | Nguồn |
|---|---|---|
| Áo nàng (đỏ hỷ) | `#c41834` | [src/scene/characters3d.ts:308](../../src/scene/characters3d.ts#L308) |
| Váy | `#e22a46` | [src/scene/characters3d.ts:325](../../src/scene/characters3d.ts#L325) |
| Son môi | `#cf142e` | [src/scene/characters3d.ts:262](../../src/scene/characters3d.ts#L262) |
| Trâm cài / phượng quan | `#ffe182` | [src/scene/characters3d.ts:278](../../src/scene/characters3d.ts#L278) |
| Mống mắt nàng | `#c43e4c` → `#591620` → `#12080d` | [src/scene/PavilionCinemaStage.ts:251-253](../../src/scene/PavilionCinemaStage.ts#L251) |
| Trời đêm | `#050b1c` → `#0d1d3b` → `#2d4b70` | [src/scene/PavilionCinemaStage.ts:1138-1141](../../src/scene/PavilionCinemaStage.ts#L1138) |
| Mặt nước | `#071426` → `#0b2238` → `#08182b` | [src/scene/PavilionCinemaStage.ts:117-119](../../src/scene/PavilionCinemaStage.ts#L117) |
| Khung kỳ đài (gỗ) | `#b3834e` → `#84572c` | [src/scene/textures.ts:36-38](../../src/scene/textures.ts#L36) |
| Vạch bàn cờ / viền sáng | `#331a0d` / `#d4a656` | [src/scene/textures.ts:80-84](../../src/scene/textures.ts#L80) |
| Mặt quân đỏ / đen | `#99060c` / `#0e131b` | [src/scene/textures.ts:186-192](../../src/scene/textures.ts#L186) |

## 6. Biểu cảm và cử chỉ: ảnh tham chiếu, không phải ảnh swap

`HostEmotion` có đúng 7 giá trị
([src/scene/portraitKinematics.ts:10](../../src/scene/portraitKinematics.ts#L10)):
`calm` · `amused` · `thinking` · `surprised` · `fierce` · `check` · `victory`.

`PerformanceGesture` có 5
([src/engine/livePerformance.ts:21](../../src/engine/livePerformance.ts#L21)):

| Gesture | Ảnh tham chiếu phải thể hiện |
|---|---|
| `sip_tea` | Nâng chén trà sen ngang môi, mắt vẫn dán trên bàn cờ |
| `tease` | Quạt lụa đỏ che nửa mặt, mép cười, một con mắt lộ |
| `think_fan` | Quạt tì cằm, mắt nhìn xuống ô đang tính |
| `closeup_talk` | Không quạt, hai tay đặt trên thành kỳ đài, nhìn thẳng camera |
| `groom_react` | Đầu quay sang phía khách, quạt chỉ về phía bàn cờ |

7 ảnh biểu cảm + 5 ảnh cử chỉ vẽ **cùng một mặt, cùng framing** như `calm` (896×1200, cắt trên bàn
cờ). Mục đích là để người làm rig chỉnh morph target và để anh kiểm tra tính nhất quán — runtime
vẫn chỉ nạp một ảnh nàng.

## 7. Sáu đêm — 18 asset, hiện mới là manifest

Id trong [`assets` của nightThemes.ts](../../src/engine/nightThemes.ts) đang được test đếm
([nightThemes.test.ts:75-78](../../src/engine/nightThemes.test.ts#L75)) nhưng **chưa có loader nào
nạp chúng**. Chúng là danh sách việc cho thợ vẽ. Khi một ảnh thật sự được dùng, phải đổi tên sang
quy ước mục 2 rồi import — giữ nguyên id manifest để test không đỏ.

| Đêm | id gốc | Stage | Bride look | Overlay motif |
|---|---|---|---|---|
| 1 · Quạt Lụa | `d1-quan-lua` | Chòi gỗ, đèn lồng kép, màn nước tĩnh, **quạt gấp trên bàn** | `bride-calm`: quạt lụa trắng-ngà ép trước ngực | Hoa văn quạt lụa mở, một nan quạt gãy |
| 2 · Kiềng Ngọc | `d2-kieng-ngoc` | Hai cột pháo đỏ-đen đối nhau giữa bàn, trăng rằm cao | `bride-defiant`: kiềng ngọc trên cổ, cằm nâng, mắt sắc | Vòng ngọc đứt, 3 hạt rơi theo đường chéo |
| 3 · Mũ Phượng | `d3-mu-phuong` | Sương mỏng mặt hồ, mã đen ẩn trong cỏ cao | `bride-fierce`: phượng quan full size, môi mím | Mũ phượng nghiêng, 9 lông công xoè |
| 4 · Hài Thêu | `d4-hai-theu` | Then cửa gỗ cài chốt, xe đỏ đã vượt hà | `bride-regal`: hài thêu mũi cong lộ gấu áo | Hài thêu hoa sen, một chiếc lệch quai |
| 5 · Áo Gấm | `d5-ao-gam` | Hai xe đỏ đứng so le, sương xuống thấp, nền chàm lạnh | `bride-cold`: tay áo gấm dài phủ bàn | Hai ống tay áo giao nhau thành chữ X |
| 6 · Hoa Chúc | `d6-hoa-chuc` | Nến hoa chúc cháy gần chân, bàn cờ chỉ còn ít quân | `bride-finale`: tóc xoã một bên, mắt rực, không quạt | Nến chảy sáp, dao găm chạm vào tim |

Khổ file theo ô sử dụng: `stage` và `overlay` là plate/sân khấu → **1200×896** (overlay có thể
1024×1024 nếu blend mode `screen`); `bride-*` là chân dung → **896×1200**.

## 8. Prompt chung (dán trước, thêm dòng riêng của đêm phía sau)

```
Vietnamese xiangqi (Cờ Tướng) pavilion at night, 9x10 intersection board with river boundary
labelled 楚河 漢界, round red lacquered pieces with Han characters placed ON the line crossings,
bride in red hỷ phục with phoenix crown gold #ffe182, red mole on forehead, amber-red eyes
#c43e4c to #591620, cinematic 3D render, night sky #050b1c to #2d4b70, lake water reflection,
lantern rim light, no text, no UI, no English, no watermark
```

Negative (nếu tool hỗ trợ):

```
go board, weiqi, 19x19 grid, stones inside squares, lens-shaped stones, stone bowl,
latin letters, wrong piece count, pieces inside cells, cleavage, lingerie, suggestive pose,
modern clothing, extra fingers, different face, watermark, UI buttons, chat bubbles, English text
```
