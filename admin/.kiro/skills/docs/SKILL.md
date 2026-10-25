---
name: docs
description: Cập nhật docs/rules/*.md khi code đổi khiến 1 rule bị lệch khỏi thực tế, hoặc quyết định có nên viết rule mới không. Dùng sau khi sửa code có liên quan tới 1 rule đã có, hoặc khi phát hiện tài liệu nói sai so với code.
---

# Docs — giữ `docs/rules/` đồng bộ với code thật

> Kiro IDE: Grep → grep_search, Glob → file_search. Chi tiết: .kiro/steering/kiro-compat.md.

base-projects chỉ có `docs/rules/*.md` (25 file, xem index ở
`.kiro/steering/project-overview.md`) — không có changelog/architecture-doc riêng. Skill này quản lý
đúng phần đó.

## Khi nào chạy skill này

1. Vừa sửa code mà có rule file nhắc tới tên hàm/component/pattern liên
   quan (vd. đổi signature `useChartMetrics` → `chart-conventions.md` có ví
   dụ dùng nó).
2. Nghi ngờ 1 rule đang nói sai so với code hiện tại (rule cũ, code đã đổi).
3. Xong 1 feature/pattern mới ĐỦ LỚN và LẶP LẠI để đáng có rule riêng — xem
   tiêu chí ở `docs/rules/documentation-management.md`.

## Quy trình cập nhật 1 rule đã có

1. `Grep` tên hàm/component/path được rule nhắc tới trong `src/` — xác nhận
   còn tồn tại, đúng tên, đúng signature.
2. Nếu lệch → sửa TRỰC TIẾP đoạn bị lệch trong rule file, không viết thêm
   rule mới chồng lên rule cũ.
3. Nếu rule đưa ra 1 claim tuyệt đối ("luôn", "không bao giờ", "tất cả đều
   sạch") → verify claim đó bằng `Grep`/`Glob` thật trước khi tin, đừng chỉ
   đọc lướt coi là đúng (rule cũ từng sai claim kiểu này — xem lịch sử sửa
   `clean-code-standards.md`).

## Quy trình viết rule mới

1. Kiểm `.kiro/steering/project-overview.md` §Rules index — có rule nào đã cover chưa? Không
   tạo trùng.
2. Đọc code thật của pattern muốn document (không viết từ trí nhớ/suy đoán)
   — đặc biệt các file có JSDoc giải thích sẵn (`module-registry.ts`,
   `field.theme.ts`...) thường đã có 80% nội dung cần.
3. Viết rule theo cấu trúc quen thuộc của repo: mở đầu nêu nguyên tắc, bảng
   tra cứu nhanh, ví dụ code thật (copy từ file thật, không bịa), mục "Liên
   quan" trỏ sang rule khác cùng chủ đề.
4. Thêm 1 dòng vào bảng index trong `.kiro/steering/project-overview.md`.

## Sau khi cập nhật rule — báo cho code-reviewer biết

Nếu rule mới/sửa ảnh hưởng tới checklist review (thêm luật cấm/bắt buộc
mới) → cân nhắc thêm 1 dòng tương ứng vào `.kiro/agents/code-reviewer.md`
để agent review bắt được vi phạm mới, giống cách `test-viewpoint.md` đã
được thêm vào checklist bảo mật của `code-reviewer.md`.

## Không làm

- Không viết doc mô tả 1 quyết định nhất thời (dùng commit message/PR
  description thay vì file `.md` sống mãi).
- Không copy nội dung rule khác vào rule mới — trỏ tham chiếu
  (`documentation-management.md §Cross-reference`).
