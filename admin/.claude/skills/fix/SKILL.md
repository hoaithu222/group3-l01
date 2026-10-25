---
name: fix
description: Quy trình sửa bug/lỗi type/lỗi lint/CI có hệ thống cho base-projects — Scout trước, Diagnose trước, không sửa triệu chứng. Dùng khi có 1 lỗi/bug cụ thể cần fix.
---

# Fix — Scout → Diagnose → Fix → Verify + Prevent

Không đề xuất fix trước khi hoàn thành Scout + Diagnose. Fix triệu chứng
(che lỗi mà không hiểu vì sao xảy ra) tính là THẤT BẠI của quy trình này.

## Chọn chế độ theo độ phức tạp

| Trường hợp | Chế độ |
|---|---|
| Lỗi type/lint đơn giản, rõ ràng 1 dòng | **quick** — sửa thẳng, verify bằng `tsc`/`lint`, không cần Scout đầy đủ |
| Bug nghiệp vụ, không rõ nguyên nhân | **auto** (mặc định) — chạy đủ 6 bước dưới |
| Bug nhạy cảm (auth, data loss, security) | **review** — dừng lại xác nhận với user sau mỗi bước lớn, không tự ý sửa hết rồi mới báo |
| Nhiều lỗi độc lập không liên quan nhau | **parallel** — tách xử lý từng lỗi riêng, đừng gộp chung 1 commit lớn |

## 6 bước

**0. Chọn chế độ** (bảng trên).

**1. Scout (bắt buộc)** — định vị chính xác: file nào, dependency nào, test
nào đang cover (hoặc KHÔNG cover) vùng lỗi, lịch sử git gần đây của vùng đó
(`git log -p --follow <file>`) có thay đổi nào gần thời điểm lỗi xuất hiện
không.

**2. Diagnose (bắt buộc)** — dùng skill `debug`: tái hiện lỗi, ghi lại output
GỐC (lỗi/log trước khi sửa) làm baseline để so sánh sau fix. Đưa ra giả
thuyết root cause, kiểm chứng trước khi sang bước 3. Nếu ≥2 giả thuyết đều
sai → dừng, trình bày lại vấn đề với user thay vì thử giả thuyết thứ 3 một
mình.

**3. Đánh giá độ phức tạp** — Đơn giản (1 file, rõ nguyên nhân) / Trung bình
(vài file liên quan) / Phức tạp (liên quan kiến trúc, cần bàn với user
trước) — chọn hướng tương ứng, đừng lao vào sửa kiến trúc lớn mà không hỏi.

**4. Implement fix** — sửa tối thiểu cần thiết, theo đúng pattern đã có
trong codebase (kit2, `docs/rules/*`), KHÔNG nhân dịp "sửa luôn cho gọn" mở
rộng ra phần không liên quan tới bug.

**5. Verify + Prevent (bắt buộc)**:
   - Chạy lại CHÍNH XÁC lệnh/thao tác tái hiện lỗi ban đầu, so với baseline
     ở bước 2 — xác nhận thật sự hết lỗi, không suy luận.
   - Thêm regression test nếu hợp lý (đặc biệt bug logic/tính toán) — test
     phải FAIL khi bỏ fix, PASS khi có fix (xem skill `web-testing`).
   - Chạy song song: `npx tsc --noEmit`, `npm run lint`, test liên quan.

**6. Kết thúc** — báo tóm tắt: nguyên nhân gốc là gì, sửa ở đâu, verify bằng
gì. Đề xuất commit theo skill `git` nếu user muốn.

## Bảng phản bác lý do biện minh cho việc bỏ qua quy trình

| Lý do hay nghĩ | Vì sao không đủ |
|---|---|
| "Thấy vấn đề rồi, sửa luôn" | Thấy TRIỆU CHỨNG ≠ hiểu ROOT CAUSE. Scout + Diagnose trước. |
| "Test pass rồi, xong" | Không có regression test thì cùng lớp bug dễ tái diễn — cân nhắc thêm guard. |
| "Nhỏ thôi, không cần verify lại" | Đúng cho case `quick` thật sự nhỏ; sai nếu là bug logic — vẫn phải chạy lại xác nhận. |
| "Chắc do X, sửa X là được" | Chưa kiểm chứng giả thuyết — verify trước khi sửa, không sau. |

## Liên quan trong repo này

Scout/Diagnose dùng skill `debug`. Sau khi biết cần đổi component nào →
skill `kit2-component-picker`. Trước khi coi 1 file component đã "sạch" →
review theo agent `code-reviewer`. Không có `ck:scout`/`ck:problem-solving`/
`ck:brainstorm` trong base-projects — nếu bí, hỏi thẳng user thay vì gọi
skill không tồn tại.
