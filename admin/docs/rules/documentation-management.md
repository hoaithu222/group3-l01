# Documentation Management

> base-projects hiện chỉ có `docs/rules/` — chưa có changelog/architecture
> doc riêng. File này quy định KHI NÀO đáng tạo thêm tài liệu, không giả
> định cấu trúc phức tạp chưa tồn tại.

## Nguyên tắc: tài liệu sống cạnh code nó mô tả

- Quyết định kiến trúc/quy ước UI → `docs/rules/*.md` (đã có 25 file, xem
  index ở `.claude/CLAUDE.md`).
- Giải thích "vì sao" 1 đoạn code viết như vậy, không hiển nhiên nhìn code
  là hiểu → comment ngắn tại chỗ, KHÔNG file `.md` riêng cho 1 quyết định
  nhỏ.
- Kiến trúc 1 hệ thống con phức tạp (module registry, state slice...) → rule
  riêng trong `docs/rules/` khi hệ thống đó đủ lớn để cần tra cứu lặp lại
  (xem `routing-conventions.md`, `state-management.md` làm ví dụ).

## Khi nào tạo file `.md` mới trong `docs/rules/`

Tạo khi: quy ước áp dụng LẶP LẠI nhiều nơi (không phải 1 lần), có thể viết
thành luật kiểm tra được (đúng/sai rõ ràng), và không đã có rule nào khác
đang cover đủ (kiểm `CLAUDE.md` §Rules index trước khi tạo trùng).

KHÔNG tạo khi: chỉ là ghi chú cho 1 PR/1 quyết định nhất thời — dùng commit
message hoặc PR description, không phải file rule sống mãi trong repo.

## Giữ rule KHÔNG bị lệch khỏi code thật (bài học từ audit thực tế)

Rule file có xu hướng "trôi" khỏi code khi code đổi mà quên cập nhật doc —
đã từng phát hiện thật trong repo này: ví dụ ví dụ code trong
`chart-conventions.md` thiếu tham số mới thêm vào hook, `clean-code-
standards.md` khẳng định "không file nào vượt giới hạn" trong khi thực tế
có ngoại lệ, `feature-structure.md` mô tả cấu trúc feature không khớp
feature mẫu thật.

**Khi sửa code mà 1 rule file có ví dụ/claim liên quan → cập nhật rule TRONG
CÙNG PR**, không tách riêng "sẽ update doc sau". Khi review 1 rule file cũ,
đối chiếu nhanh với code thật (`Glob`/`Grep` tên hàm/component được nhắc)
trước khi tin nội dung — rule là tài liệu, không phải nguồn thật, code mới
là nguồn thật.

## Cross-reference thay vì lặp nội dung

Rule mới nếu trùng 1 phần nội dung rule đã có → trỏ tới rule đó (`xem
form-validation.md §...`), KHÔNG copy lại đoạn văn. Nội dung trùng lặp ở 2
nơi là 2 nơi có thể lệch nhau theo thời gian — 1 nguồn thật, nhiều điểm trỏ
tới.

## Liên quan

`.claude/CLAUDE.md` (index toàn bộ rule) · skill `docs` (quy trình cập nhật
tài liệu sau khi code đổi).
