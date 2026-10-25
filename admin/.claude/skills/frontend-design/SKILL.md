---
name: frontend-design
description: Thiết kế UI mới trong ranh giới token/kit2 có sẵn, tránh thẩm mỹ "AI slop" (bố cục/màu/copy rập khuôn dễ nhận ra là AI tạo). Dùng khi dựng 1 màn hình/landing/dashboard mới từ đầu, trước khi hoặc trong lúc code.
---

# Frontend Design — tránh "AI slop", trong ranh giới kit2

Khác biệt quan trọng với skill gốc: base-projects đã có **1 hệ token cố định**
(`docs/rules/color-system.md`, `font-system.md`) — không được tự chọn font
mới, tự phối màu mới, tự viết token ngoài hệ đã generate. Checklist dưới đây
áp dụng ở tầng BỐ CỤC/MẬT ĐỘ/COPY, không phải tầng "chọn brand mới".

## Checklist "AI Tells" — rà trước khi ship 1 màn hình mới

Nếu 1 màn hình dính ≥3 dấu hiệu dưới đây, dừng lại và thiết kế khác đi:

- [ ] **3 cột đều nhau, căn giữa** (feature card 3-cột y hệt nhau) — layout
  dễ đoán nhất khi AI tạo UI. Phá bằng: kích thước khác nhau theo độ quan
  trọng (xem `docs/rules/visual-hierarchy.md` — 3 tầng PRIMARY/SECONDARY/
  TERTIARY), hoặc dùng `BoxGrid` với `min` width thay vì chia cột cứng.
- [ ] **Hero căn giữa tuyệt đối** + heading to + 1 đoạn mô tả + 2 nút — bố
  cục landing-page rập khuôn nhất.
- [ ] **Số liệu tròn/đẹp bất thường** (50%, 100%, 1000+) trong demo/copy mẫu
  — dữ liệu thật không tròn như vậy, dùng số có phần lẻ thực tế (47.2%).
- [ ] **Copy sáo rỗng**: "Nâng tầm", "Trải nghiệm liền mạch", "Giải pháp toàn
  diện" — nói cụ thể việc nó làm, không nói cảm xúc chung chung.
- [ ] **Placeholder "John Doe"/"Acme Corp"/Lorem Ipsum** trong demo dữ liệu —
  dùng tên/dữ liệu gần thực tế (đã có `src/features/demo/constants/` làm ví
  dụ mẫu dữ liệu giả nhưng có cấu trúc thật).
- [ ] **Card viền + shadow đồng loạt, mật độ cao** — không phân biệt cấp bậc.
  Đối chiếu `visual-hierarchy.md` §border system (page-level `border-2`,
  sub-section `border` 1px).
- [ ] **Badge "New"/"Hot" hình pill lặp lại vô tội vạ** không có ý nghĩa
  trạng thái thật — `Badge` dùng đúng `color`/`variant` cho trạng thái thật,
  không trang trí.
- [ ] **Error message "Oops! Something went wrong"** — nói thẳng lỗi gì, gợi
  ý làm gì tiếp theo (dùng `Callout intent="error"` với `title`/mô tả cụ
  thể, không phải câu xin lỗi chung chung).
- [ ] **`h-screen` cho khung toàn màn** thay vì `h-dvh` — vỡ trên Safari iOS
  (xem `docs/rules/ipad-responsive.md §5`).
- [ ] **Mọi radius/spacing đều nhau bất kể độ lồng** — độ sâu lồng khác nhau
  nên radius/padding khác nhau một chút (không bằng nhau tuyệt đối ở mọi
  cấp).

## Quy trình thiết kế 1 màn hình mới

1. Xác định **1 vùng PRIMARY duy nhất** — nội dung/hành động quan trọng nhất
   trang. Mọi thứ khác lùi về SECONDARY/TERTIARY (`visual-hierarchy.md`).
2. Khung layout: `PageShell` + `PageBody` (+ `Toolbar` nếu có filter) — xem
   skill `kit2-component-picker`.
3. Map từng khối nội dung sang component kit2 có sẵn — **không** tự vẽ card/
   badge/button bằng `<div>` thô.
4. Copy: viết cụ thể, tránh sáo rỗng — số liệu demo có phần lẻ thực tế.
5. Rà lại checklist "AI Tells" ở trên trước khi coi là xong.

## "Design Dials" — 3 trục điều chỉnh có chủ đích

Khi thiết kế, nêu rõ (với chính mình hoặc trong PR) 3 trục này thay vì thiết
kế "mặc định":

| Trục | Thấp | Cao | Chọn theo |
|---|---|---|---|
| **Độ khác biệt bố cục** | Grid đối xứng, an toàn | Bố cục bất đối xứng, kích thước khối lệch theo độ quan trọng | Trang càng "sản phẩm nghiêm túc" (dashboard nội bộ) → thấp; trang càng "gây ấn tượng" (landing) → cao |
| **Cường độ chuyển động** | Không animation hoặc rất tối giản | Transition/spring rõ rệt ở hover/mở/đóng | Kit2 đã có `--animate-*` token sẵn trong `globals.css` — dùng token có sẵn, không tự viết easing mới |
| **Mật độ thị giác** | Thoáng, `p-4`+ | Dày, `p-2` | Mặc định base-projects nghiêng về mật độ vừa-cao (`visual-hierarchy.md` khuyến nghị `p-2` cho panel/card) — chỉ tăng thoáng khi nội dung cần "thở" (landing, empty state) |

## Không tự ý làm (ngoài phạm vi skill này)

- Không thêm font-family mới ngoài `font.json` đã generate.
- Không thêm màu accent thứ 2 ngoài palette đã có (`primary` = xanh lá,
  brand color duy nhất — xem `color-system.md`).
- Không tự viết animation/shadow token mới ngoài `globals.css` đã khai.
- 3D/WebGL/particle effect, redesign toàn bộ brand — ngoài phạm vi 1 base
  template, không thuộc skill này.
