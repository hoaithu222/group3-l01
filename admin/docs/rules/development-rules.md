# Development Rules — nguyên tắc chung

> Bổ sung `code-style.md` / `clean-code-standards.md` — đây là nguyên tắc
> tối cao, áp dụng khi rule cụ thể chưa nói tới trường hợp đang gặp.

## YAGNI — You Aren't Gonna Need It

KHÔNG xây abstraction/config/prop cho nhu cầu "có thể sau này cần" — chỉ xây
cho nhu cầu ĐANG có. 3 dòng lặp lại còn tốt hơn 1 abstraction sai (phải viết
lại khi nhu cầu thật xuất hiện, tốn công gấp đôi).

## KISS — Keep It Simple

Giải pháp đơn giản nhất giải quyết đúng vấn đề, không phải giải pháp "chuẩn
mực nhất về lý thuyết". Nếu cần giải thích dài mới hiểu vì sao code viết như
vậy, thường có cách viết đơn giản hơn.

## DRY — nhưng đợi đến lần lặp thứ 3

| Số lần lặp | Hành động |
|---|---|
| 1 | Giữ nguyên tại chỗ |
| 2 | Cân nhắc tách nếu logic phức tạp; giữ nguyên nếu đơn giản |
| 3+ | BẮT BUỘC tách thành hàm/hook/component dùng chung |

Tách sớm quá (ở lần 1-2) tạo abstraction sai vì chưa đủ ca để thấy đúng hình
dạng chung — thường tệ hơn giữ lặp một thời gian.

## Đặt tên file — ưu tiên rõ ràng hơn ngắn gọn

kebab-case cho file không phải component (`format-date.utils.ts`,
`use-arrow-field-nav.ts`). Tên dài nhưng rõ ràng tốt hơn tên ngắn nhưng mơ
hồ — tên file là thứ được grep/tìm kiếm nhiều nhất trong ngày làm việc, kể cả
bởi chính Claude Code khi cần định vị code.

## Không tạo file "-v2"/"-new"/"-enhanced"

Sửa trực tiếp file gốc thay vì tạo bản sao "cải tiến" song song. Codebase
không cần lịch sử qua tên file — đó là việc của git. Ngoại lệ DUY NHẤT: đang
migrate có chủ đích, có kế hoạch xoá bản cũ trong PR gần (không để treo vô
thời hạn).

## Trước khi commit/push

- Lint sạch trước khi commit (`npm run lint`).
- Test không được skip để "qua được build" — test fail nghĩa là có gì đó
  thật sự sai, sửa nguyên nhân chứ không comment-out test.
- Không commit secret/credential — xem skill `git` §quét bí mật.
- Message theo conventional commit — xem skill `git`.

## Liên quan

`code-style.md` (naming/import order chi tiết) · `clean-code-standards.md`
(giới hạn dòng, cấu trúc file) · skill `git` (commit workflow) · skill `fix`
(quy trình sửa bug).
