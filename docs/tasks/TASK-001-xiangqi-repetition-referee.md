# TASK-001: Trọng Tài Luật Cờ Tướng Chuẩn Giải (Trường Chiếu, Lặp Thế 3 Lần & Luật 60 Hiệp)

- **Trạng thái:** `Sẵn sàng nhận việc (Ready)`
- **Độ ưu tiên:** `Cao (P1)`
- **Người thực hiện:** Dev nghiên cứu lõi
- **Nhánh đề xuất:** `feat/xiangqi-repetition-referee`

---

## 1. Bối cảnh & Vấn đề thực tế
Hiện tại `src/engine/xiangqi.ts` mới xử lý kết thúc ván bằng **chiếu bí (checkmate)** và **hết nước đi (stalemate)**. Khi phát trực tiếp trên TikTok Live:
1. Người chơi (hoặc bot ở cờ tàn) có thể dùng Xe/Pháo **chiếu lặp đi lặp lại vô hạn (Trường chiếu)** làm treo ván đấu và tụt nhịp phiên live.
2. Những thế cờ tàn không bên nào chịu ăn quân có thể kéo dài lê thê vì chưa có **luật 60 hiệp không ăn quân (120 nước nửa)** của Cờ Tướng chuẩn.
3. Ở tầng AI (`src/engine/ai.ts`), `recentPositionKeys` hiện chỉ phạt nhẹ điểm lặp chứ chưa phân biệt **nước lặp phạm Trường chiếu (bị xử thua)** với **nước lặp hòa hợp lệ**.

---

## 2. Yêu cầu công việc (Bắt buộc nối trọn vòng: Core → AI → Giao diện)

### Phần A — Module trọng tài thuần (`src/engine/repetitionReferee.ts`)
Xây dựng module thuần (không phụ thuộc React/DOM) có chức năng:
1. **Theo dõi lịch sử thế cờ ổn định** (dùng hash/key chuẩn cho trạng thái bàn cờ + lượt đi, kèm cờ đánh dấu nước đó có chiếu tướng hay không và có ăn quân hay không).
2. **Phát hiện lặp thế 3 lần (3-fold repetition)** & phân loại kết quả theo luật Cờ Tướng:
   - **Trường chiếu (Perpetual Check):** Trong chu kỳ lặp giữa lần xuất hiện 1 → 2 → 3, nếu **chỉ một bên** liên tục chiếu tướng ở mọi nước của mình trong vòng lặp thì bên đó **phạm luật và bị xử thua** (nếu Đỏ trường chiếu → `black_win`, nếu Đen trường chiếu → `red_win`).
   - **Hòa lặp thế (Mutual / Non-checking Repetition):** Cả hai bên cùng chiếu lặp qua lại hoặc không bên nào trường chiếu → xử **Hòa (`draw`)**.
   - **Cảnh báo sớm ở lần lặp thứ 2 (`warning`):** Trả về cờ cảnh báo `perpetual_check_warning` trước khi chạm ngưỡng lần 3 để Kỳ Ma nhắc khéo người chơi trên live!
3. **Luật 60 hiệp không ăn quân (`noCapturePlies >= 120`)**: Tự động kết thúc ván với kết quả **Hòa (`draw`)** và lý do rõ ràng.

### Phần B — Tích hợp vào `xiangqi.ts` & `ai.ts`
1. Mở rộng `BoardState` (giữ tương thích ngược với toàn bộ test cũ tạo `BoardState` thủ công!) bằng các trường tùy chọn như `statusReason?: 'checkmate' | 'stalemate' | 'perpetual_check' | 'repetition_draw' | 'sixty_move_draw' | 'resign' | 'draw_agreement'` và lịch sử trọng tài để `makeMove()` tự động cập nhật trạng thái ván đấu chuẩn xác.
2. Nối vào `src/engine/ai.ts`:
   - Khi Kỳ Ma đang tìm nước đi (`analyzePosition`), **tránh tuyệt đối** nước dẫn tới bị xử thua do Trường chiếu (chấm điểm phạt nặng tương đương thua cờ) trừ khi không còn lựa chọn nào khác.
   - Không đánh gãy bộ `patterns.ts` (17 sát cục) và tốc độ tìm kiếm hiện có trong `ai.test.ts`.

### Phần C — Nối trọn vẹn lên Giao diện & Lời thoại Live
1. **`src/App.tsx`**:
   - Khi xuất hiện cảnh báo lặp lần 2 (`perpetual_check_warning`), hiện thông báo hệ thống trong khung chat và cho Kỳ Ma nhắc luật khéo léo (không bị cắt ngang giọng đang đọc).
   - Khi ván kết thúc bởi trọng tài (Trường chiếu / Hòa lặp thế / Hòa 60 hiệp), chuyển mượt sang màn hình kết thúc trận như chiếu bí thông thường.
2. **`src/components/StatusModal.tsx`**:
   - Hiển thị chính xác tiêu đề & mô tả theo `statusReason` (ví dụ: *"Phạm luật Trường Chiếu — Đổi nước khác kẻo bị xử thua!"*, *"Hòa do lặp thế 3 lần"*, *"Hòa theo luật 60 hiệp không ăn quân"*).
3. **`src/engine/livePerformance.ts`**:
   - Bổ sung mẫu câu thoại tự nhiên, duyên dáng đúng giọng **Tân Nương Áo Đỏ** cho tình huống nhắc luật Trường chiếu và hòa cờ tàn.

---

## 3. Bộ kiểm thử bắt buộc (`src/engine/repetitionReferee.test.ts`)
Viết unit test dùng `node:test` + `node:assert/strict` bao phủ tối thiểu các kịch bản sau:
1. Lặp thế 2 lần có chiếu → trả về cảnh báo `perpetual_check_warning`, **chưa** kết thúc ván.
2. Đỏ trường chiếu 3 lần liên tiếp trong vòng lặp → xử `black_win` với lý do `perpetual_check`.
3. Đen trường chiếu 3 lần liên tiếp trong vòng lặp → xử `red_win` với lý do `perpetual_check`.
4. Cả hai bên cùng lặp thế không chiếu (hoặc chiếu đổi qua lại) đủ 3 lần → xử `draw` (`repetition_draw`).
5. Đủ 120 nước nửa liên tiếp không ăn quân → xử `draw` (`sixty_move_draw`); có nước ăn quân ở nước 119 → bộ đếm reset về `0`.
6. Test tích hợp AI: Kỳ Ma ở thế đang hơn quân **không** tự chui vào nước Trường chiếu thứ 3 bị xử thua.

---

## 4. Tiêu chí nghiệm thu (Definition of Done)
- [ ] Tất cả lệnh sau chạy **0 lỗi, 100% PASS** trên nhánh nộp:
  - `npm run lint` (`tsc --noEmit`)
  - `npm test` (giữ nguyên toàn bộ **76 test cũ** xanh + toàn bộ test mới xanh)
  - `npm run build`
- [ ] **Nối thông 100% từ Backend/Engine ra tới UI** — không để module mới nằm rời chưa được gọi trong `App.tsx` hoặc `ai.ts`.
- [ ] Không thay đổi cấu trúc bảo mật `actorId` / `CTL_LIVE_INGEST_TOKEN`, không chỉnh sửa 3D board (`src/scene/*`) hay bố cục HUD ngoài phạm vi thẻ việc.
- [ ] Kèm mô tả ngắn trong PR/commit về các file đã sửa và kết quả chạy thử thực tế.
