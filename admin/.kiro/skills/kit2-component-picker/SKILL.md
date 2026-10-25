---
name: kit2-component-picker
description: Xác định component kit2 (@/shared/ui) đúng cho một nhu cầu UI cụ thể theo nguyên tắc 3R (Reuse/Extend/Create). Dùng khi cần viết JSX mới, thêm field vào form, dựng 1 màn hình mới, hoặc phân vân "component nào cho tình huống này" trong base-projects.
---

# Kit2 Component Picker

> Kiro IDE: Grep → grep_search, Glob → file_search. Chi tiết: .kiro/steering/kiro-compat.md.

base-projects có 1 design system duy nhất: **kit2** (`src/shared/ui/`). Skill
này là quy trình quyết định "cần UI X → dùng component nào" — không đoán,
không tự viết raw HTML.

## Quy trình

1. **Mô tả nhu cầu bằng 1 câu** ("cần chọn 1 ngày", "cần bảng KPI dày cho
   dashboard", "cần xác nhận xoá"...).
2. **Tra theo thứ tự, dừng ở bước đầu tiên trả lời được:**
   - `docs/rules/reuse-first.md` §1 "HTML → Kit2 Decision Table" — bảng nhu
     cầu → component, chia theo Form controls / Action-Navigation /
     Feedback-Overlay / Display-Data / Typography / Icons.
   - `docs/rules/reuse-first.md` §3 "Kit2 Catalog" — danh sách đầy đủ theo
     nhóm thư mục (`primitives/ feedback/ actions/ inputs/ selects/ pickers/
     navigation/ data-display/ surfaces/ layout/ overlays/ media/ icons/
     form/`), kèm props chính của từng component.
   - Không chắc bảng đã cập nhật (component mới thêm gần đây có thể chưa vào
     bảng) → `Grep`/`Glob` trực tiếp `src/shared/ui/**` theo tên khái niệm
     (vd. tìm "gauge", "ranking", "capsule") trước khi kết luận "chưa có".
3. **Áp dụng 3R:**
   - **REUSE** — có component đúng concept → dùng thẳng, đọc props qua
     JSDoc đầu file hoặc bảng catalog.
   - **EXTEND** — gần giống nhưng thiếu 1 variant/size/skin → mở `tv()`
     recipe của component đó (thường ở cuối file hoặc file `.theme.ts` cạnh
     nó), thêm 1 key vào `variants.xxx`. KHÔNG fork file mới
     (`ButtonV2.tsx`), KHÔNG tạo component riêng cho từng biến thể màu
     (`BlueBadge`, `SuccessBadge`) — dùng prop `color`/`variant`.
   - **CREATE** — chỉ khi không trùng concept với BẤT KỲ component nào →
     đọc `docs/rules/kit2-architecture.md` §3 (Decision Tree đặt file ở
     nhóm nào) và §9 (checklist bắt buộc: JSDoc, token, `tv()` nếu ≥2 axes,
     barrel export, cập nhật bảng §2 + `reuse-first.md` §3).
4. **Kiểm layout wrapper**: nếu nhu cầu chỉ là container flex/grid không có
   hành vi UI riêng → `<div>/<span>/<section>` raw là OK, không cần kit2 (xem
   `reuse-first.md` §2).

## Cheat sheet — các case hay gặp nhất

| Nhu cầu | Component | Nhóm |
|---|---|---|
| Action chính/phụ/viền/icon-only | `Button` | actions |
| Menu hành động khi click | `Menu` | actions |
| Menu chuột phải | `ContextMenu` | actions |
| Toggle 2-4 lựa chọn ngắn | `SegmentToggle` | actions |
| Text/số/nhiều dòng | `Input`/`NumberInput`/`Textarea` (trong form: `*Field`) | inputs / form/fields |
| Chọn 1 / nhiều từ list | `Dropdown` / `MultiSelect` | selects |
| Chọn từ cây phân cấp | `DropdownTreeSelect` | selects |
| Ngày / khoảng ngày / giờ / ngày-giờ | `SingleDatePicker`/`RangeDatePicker`/`TimePicker`/`DateTimePicker` | pickers |
| Modal / modal có form / xác nhận | `Modal` / `FormModal` / `ConfirmDialog` | overlays |
| Panel trượt cạnh | `Drawer` | overlays |
| Hover hint / click panel nổi | `Tooltip` / `Popover` | overlays |
| Toast | `showToast()` (`@/shared/utils/toast.utils`) | — |
| Bảng dữ liệu / cây | `Table` / `Tree` | data-display |
| Đếm số động | `AnimatedNumber` | data-display |
| Bảng xếp hạng | `RankingBoard` | data-display |
| Bảng tự cuộn (kiosk/màn lớn) | `ScrollBoard` | data-display |
| So sánh giá trị dạng thanh có trục | `CapsuleChart` | data-display |
| Gauge mức nước/tồn kho | `LiquidGauge` | feedback |
| Tiến độ thanh/vòng | `Progress` / `ProgressCircle` | feedback |
| Banner cảnh báo/thông tin trong trang | `Callout` | feedback |
| Trạng thái rỗng / đang tải | `EmptyState` / `Spinner` / `Skeleton` | feedback |
| KPI card / KPI dày dashboard strip | `SummaryCard` / `CompactKpiCard` | surfaces |
| Panel khung chuẩn / khung viền bo | `BoxPanel` / `Surface` | surfaces |
| Card ảnh/screenshot | `CardScreenshort` | surfaces |
| Khung ngoài 1 trang + vùng cuộn | `PageShell` + `PageBody` | layout |
| Toolbar lọc/hành động của trang | `Toolbar` | layout |
| Lưới card tự responsive (khai `min` width) | `BoxGrid` | layout |
| Header trang (icon+title+back+action) | `TitleScreen` | layout |
| Badge trạng thái/chấm | `Badge` | primitives |
| Avatar | `Avatar` | primitives |
| Icon | `<SystemIcon name="..." />` | icons |
| Upload file | `Upload` (+ `useUpload`, trong form: `FileField`) | media |

Bảng này chỉ là lối tắt cho case phổ biến — **nguồn thật luôn là
`docs/rules/reuse-first.md` §3**, cập nhật thường xuyên hơn skill này.

## Sau khi chọn xong

- Token màu/chữ/icon vẫn phải theo `docs/rules/color-system.md` /
  `font-system.md` / `icon-conventions.md` — chọn đúng component không có
  nghĩa được phép hardcode style bên trong nó.
- className override chỉ qua `cn()`.
- Nếu vừa EXTEND hoặc CREATE component → xem lại `reuse-first.md §3` có cần
  cập nhật dòng catalog tương ứng không.
