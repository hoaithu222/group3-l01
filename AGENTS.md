# Super App — hướng dẫn cho AI Agents (Antigravity & Codex)

## Phạm vi và cách đọc rules

File này áp dụng cho toàn bộ repository `super-app`. Trả lời người dùng bằng
tiếng Việt, trừ khi được yêu cầu dùng ngôn ngữ khác.

Trước khi sửa, đọc `GEMINI.md` / `AGENTS.md` của thư mục phụ liên quan, kể cả khi phiên làm
việc bắt đầu ở gốc repo. Đường dẫn trong mỗi file hướng dẫn được tính từ thư
mục chứa file đó, trừ khi ghi rõ khác đi.

| Phạm vi công việc | Hướng dẫn phải đọc |
| --- | --- |
| Toàn repo (Antigravity/Codex) | `GEMINI.md`, `AGENTS.md` ở gốc repo |
| Mobile trong `app/` | `app/GEMINI.md` (hoặc `app/AGENTS.md`), rồi `app/.claude/skills/base-rules/SKILL.md` và rules/skill tương ứng |
| Component trong `app/src/shared/ui/` | Đọc thêm `app/src/shared/ui/AGENTS.md` |
| Backend trong `be/` | `be/GEMINI.md` (hoặc `be/AGENTS.md`), rồi các rules kỹ thuật được liệt kê ở đó |
| Trang quản trị web trong `admin/` | `admin/GEMINI.md` (hoặc `admin/AGENTS.md`), rồi `admin/.claude/CLAUDE.md` và `admin/docs/rules/` |
| Tính năng liên quan nhiều package (app/admin ↔ backend) | Đọc các bộ hướng dẫn liên quan; đối chiếu API contract ở cả client và server |
| Yêu cầu sản phẩm, lộ trình | `docs/notes.md`, `docs/modules/`, kế hoạch tổng `docs/development-plan.md` và `be/docs/development-roadmap.md` |

- Hướng dẫn cụ thể ở thư mục con được ưu tiên trong phạm vi thư mục đó.
- Yêu cầu trực tiếp của người dùng và hướng dẫn hệ thống có ưu tiên cao hơn
  các tài liệu trong repo.
- `docs/notes.md` mô tả sản phẩm dự kiến, không phải danh sách tính năng đã có.
  Kiểm tra mã nguồn trước khi kết luận một phân hệ đã được triển khai.
- Không nhập rules của package này sang package khác. Ba package (`app`, `admin`,
  `be`) có dependency, phiên bản Zod (app/admin v4, be v3), cấu hình TypeScript
  và bộ kiểm tra riêng. `app` và `admin` cùng khuôn base nhưng khác nền
  (React Native/NativeWind so với React DOM/Tailwind 4).

## Quy trình làm việc

1. Kiểm tra `git status --short`; giữ nguyên thay đổi sẵn có của người dùng.
2. Đọc file liên quan và tìm component, middleware, service, utility có sẵn
   trước khi thêm mới. Giữ thay đổi đúng phạm vi yêu cầu.
3. Lập kế hoạch phù hợp độ phức tạp; không tạo file kế hoạch cho chỉnh sửa nhỏ.
4. Khi sửa API, đối chiếu endpoint, DTO, response, error code, refresh token
   và cách client xử lý lỗi. Không tự đổi contract chỉ ở một phía.
5. Chạy các kiểm tra tương ứng bên dưới; sửa lỗi do thay đổi của mình gây ra.
   Không tắt rules hoặc sửa test chỉ để có kết quả xanh.
6. Báo cáo kết quả và phần chưa kiểm chứng; cập nhật tài liệu liên quan.

## Lệnh kiểm tra

Repo không có `package.json` ở gốc. Chạy npm trong đúng package; dùng npm và
`package-lock.json` hiện có.

| Thay đổi | Thư mục chạy | Kiểm tra |
| --- | --- | --- |
| Mã nguồn/cấu hình app | `app/` | `npm run check` |
| Mã nguồn/cấu hình backend | `be/` | `npm run build`, `npm run lint`, `npm test -- --runInBand` |
| Mã nguồn/cấu hình admin | `admin/` | `npm run check` |
| Chỉ Markdown/rules | Gốc repo | Kiểm tra đường dẫn, tên script, phạm vi rules và `git diff --check`; không cần build/test ứng dụng |

Không bỏ bước kiểm tra trong `package.json`. Nếu thiếu dependency hoặc dịch
vụ, ghi rõ bước bị chặn. Không chạy reset/seed/database push để kiểm tra rules.

## Dùng chung với Claude

- Dùng tài liệu hiện có qua đường dẫn. Không coi `@file` là import Codex
  hoặc đọc vòng `app/CLAUDE.md` → `app/AGENTS.md`.
- Đọc `.claude/skills/<tên>/SKILL.md` khi được chỉ dẫn; file có sẵn không có
  nghĩa skill đã đăng ký trong Codex. Không sao chép cả bộ ClaudeKit.
- Settings, hooks, tên agent và lệnh `/ck:*` của Claude không cấu hình runtime
  Codex. Dùng công cụ thực sự có trong phiên và giữ bước kiểm tra/review.
- Phần quy trình riêng cho Codex trong `be/AGENTS.md` thay thế cách gọi công
  cụ ClaudeKit. Không tự cài plugin hoặc nới quyền để mô phỏng công cụ thiếu.
- Không ghi secrets vào tài liệu hay commit. Việc cấu hình rules không bao
  gồm thay đổi quyền toàn cục, triển khai hoặc thao tác dữ liệu production.

Hướng dẫn sử dụng và bảo trì: `docs/codex-setup.md`.
