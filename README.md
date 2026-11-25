# Kỳ Đài Giang Hồ 3D

Ứng dụng cờ tướng 3D chạy trên **TikTok Live**: khán giả (hoặc chú rể được ghép cặp) đấu với
**Kỳ Ma Điêu Nguyệt** — nàng cờ thủ mặc hỷ phục đỏ trong chòi cổ giữa hồ sen. Mỗi buổi live là một
chương trong **sáu đêm lục lễ**; thắng nàng không phải để "cưới", mà để lấy từng lớp **hồi môn** mà
nàng đặt lên bàn cờ.

Repo này là mã nguồn của show: engine cờ tướng + bot bình luận + nhân vật render bằng canvas +
server Gemini.

## Chạy local

```bash
bun install          # bun.lock là lockfile chuẩn của repo
cp .env.example .env # GEMINI_API_KEY=...
bun run dev          # tsx server.ts -> http://localhost:3000 (Vite middleware + API)
```

Biến môi trường:

| Biến | Bắt buộc | Dùng cho |
|---|---|---|
| `GEMINI_API_KEY` | có (nếu muốn lời bình AI) | `/api/commentary`, `/api/live-reply`, `/api/tts`. Thiếu key thì server trả 503 và app tự fallback sang bank lời bình cục bộ |
| `CTL_LIVE_INGEST_TOKEN` | có khi bật TikTok Live webhook | key chung cho `POST /api/live/webhook` và `/api/live/chat` (header `x-ctl-ingest-token` hoặc `Authorization: Bearer`). Chưa đặt -> 503, đặt sai -> 401 |
| `PORT` | không | mặc định 3000 |

```bash
bun run build        # vite build (production)
bun run lint         # tsc --noEmit
bun test             # node --import tsx --test, chạy trong CI trên mỗi push
```

## Cấu trúc

```
src/engine/      logic thuần, không DOM, test được bằng node --test
  xiangqi.ts     bàn cờ, luật, generateLegalMoves/makeMove
  ai.ts          negamax + PVS + book mở; bookFavour cho "sách đêm nay"
  patterns.ts    17 sát pháp cờ tướng + tên tiếng Việt
  repetitionReferee.ts  trọng tài trường chiếu / lặp / 60 nước
  bridalLadder.ts 6 lớp hồi môn, forfeit theo sát pháp
  commentaryBank.ts bank lời bình 3 tầng x 3 câu cho mỗi event
  livePerformance.ts chọn tier, render token, xưng hô theo tuổi/giới khách
  nightThemes.ts 6 đêm: khai cuộc, lời trêu, sát pháp, hồi môn, asset
src/scene/       canvas/Three.js: kỳ đài, quân cờ, rig mặt nàng
src/components/  overlay 9:16, banner bình luận, dock điều khiển
server.ts        Express: Gemini, TTS, webhook TikTok Live (ingest token)
docs/art/        IMAGE-SPEC.md - spec ảnh cho dev chính sinh bằng AI
docs/tasks/      thẻ việc của dev chính
```

## Luật chơi của show

- Khách đi **đỏ, đi trước**. Hồi môn gồm 6 lớp theo thứ tự: quạt lụa, kiềng hồi môn, mũ phượng,
  hài thêu, áo choàng gấm, nến hoa chúc (`bridalLadder.ts`).
- Mỗi sát pháp nàng thất thủ **mất đúng một lớp** đã định (`bridalLadder.ts`). Mất 3 lớp là nàng
  hết mũ phượng, chuyển giọng thách đấu.
- Đòn kết (chiếu bí / sát pháp hoàn tất) mới được gọi tên sát pháp. Thế hình thành mà chưa sát thì
  chỉ được gọi là "thế", không được gắn nhãn "sát".
- Trường chiếu / lặp 3 lần / 60 nước không tiến do trọng tài xử, engine tránh nước bị xử thua.

## Trói buộc pháp lý (đã chốt trong kế hoạch)

Nghị định 174/2026 Điều 99 khoản 5 xử phạt nội dung khiêu dâm/trái thuần phong mỹ tục trên không
gian mạng. Show chỉ được **ngụ ý** qua lời thoại hồi môn; ảnh phải kín cổ, không hở vai.
**Không** tồn tại khung "thắng thì được nàng" — đó là cá cược/trả giá bằng con người, bị cấm tuyệt
đối trong repo (test `commentaryBank.test.ts` quét toàn bộ `src/` để chặn câu này).
