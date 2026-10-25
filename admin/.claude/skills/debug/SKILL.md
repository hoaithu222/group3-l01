---
name: debug
description: Debug có hệ thống — tìm root cause trước khi sửa, không đoán mò/patch triệu chứng. Dùng khi gặp bug, test fail, hành vi lạ, hoặc vấn đề hiệu năng trong base-projects.
---

# Debug — Root Cause trước, Fix sau

**Nguyên tắc cốt lõi: KHÔNG ĐỀ XUẤT FIX TRƯỚC KHI ĐIỀU TRA XONG ROOT CAUSE.**
"Chắc là do X, thử sửa X xem" không phải điều tra — đó là đoán.

## Quy trình 4 pha

1. **Điều tra root cause** — tái hiện bug, đọc log/console/network thật, xác
   định CHÍNH XÁC dòng code/state nào gây ra hành vi sai. Không nhảy sang
   pha 2 khi chưa tái hiện được.
2. **Phân tích pattern** — bug này có xảy ra ở chỗ khác dùng cùng pattern
   không? (vd: 1 component quên `useImeSafeSearchInput` → grep xem còn chỗ
   nào khác cũng quên).
3. **Kiểm giả thuyết** — trước khi sửa, xác nhận giả thuyết đúng bằng cách
   nhỏ nhất có thể (thêm log tạm, test cô lập) — KHÔNG sửa code chính rồi
   "thử xem có hết bug không".
4. **Implement fix** — sửa tại ĐÚNG NGUỒN gây lỗi, không phải chỗ triệu
   chứng lộ ra. Thêm regression test nếu hợp lý (test fail KHI CHƯA fix,
   pass SAU khi fix).

## Trace ngược tới nguồn, không vá ở nơi triệu chứng lộ ra

Bug lộ ra ở component A không có nghĩa lỗi nằm ở A — trace ngược theo call
stack/data flow tới nơi giá trị sai LẦN ĐẦU xuất hiện. Ví dụ: 1 field hiển
thị `NaN` → lỗi thường nằm ở tầng parse/format dữ liệu API, không phải ở
JSX hiển thị nó.

## Validate ở nhiều tầng (Defense-in-Depth)

Khi debug 1 giá trị sai, kiểm theo thứ tự: đầu vào (API response/user input
có đúng không) → business logic (transform/tính toán có đúng không) →
environment (dev vs prod khác gì, feature flag, env var) → instrumentation
(console.log/breakpoint có đang nhìn đúng chỗ không).

## Luật sắt về verify — KHÔNG CLAIM XONG KHI CHƯA CHẠY LẠI

Chạy đúng lệnh tái hiện bug ban đầu (test, script, thao tác UI) SAU khi sửa,
đọc output thật, rồi mới báo "đã sửa". Không suy luận "logic đúng rồi nên
chắc hết bug" mà bỏ qua bước chạy lại.

## Công cụ điều tra trong base-projects

| Cần gì | Dùng |
|---|---|
| TypeScript error | `npx tsc --noEmit` — đọc hết danh sách, không chỉ lỗi đầu tiên |
| Lint | `npm run lint` |
| Test 1 file | `npx vitest run path/to/file.test.tsx` |
| Import cycle | `npm run check:cycles` (madge) |
| Import lỗi convention | `npm run check:imports` |
| Dead code/export thừa | `npm run check:dead` / `check:orphans` (knip) |
| Đổi UI có đúng không | Chạy `npm run dev`, xem trực tiếp trên browser — đừng suy luận từ code khi có thể xem thật |

## Frontend cụ thể — verify bằng mắt, không chỉ bằng code review

Khi sửa file `.tsx`/`.css` liên quan hiển thị: chạy `npm run dev`, mở trang
liên quan, chụp/xem trực tiếp + kiểm console không có error mới — đừng chỉ
đọc code rồi kết luận "chắc đúng rồi".

## Red flags — tự bắt mình khi thấy các câu này trong đầu

| Câu tự nhủ | Nghĩa thật |
|---|---|
| "Sửa tạm đã, điều tra sau" | Quay lại pha 1, đừng ship patch tạm mà không note lại |
| "Thử đổi X xem sao" | Đang đoán, chưa có giả thuyết đã kiểm chứng |
| "Chắc là do X" | Chưa xác nhận — verify trước khi sửa |
| "Chắc giờ ổn rồi" | Chưa chạy lại để xác nhận — chạy lại đi |
| "Test pass rồi, xong" | Test pass không có nghĩa đã ngăn được lớp bug này tái diễn — có cần thêm guard/test không? |

## Khi 3 lần sửa liên tiếp đều không hết bug

Dừng lại, đừng thử lần thứ 4 theo cùng hướng — nghi ngờ kiến trúc/giả định
nền tảng đang sai, trình bày lại vấn đề với user thay vì tiếp tục đoán.
