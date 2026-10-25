---
inclusion: always
---

# Kiro IDE — tương thích cấu hình Claude (package `super-app/app`)

Kiro tự nạp `AGENTS.md` và `AGENTS.md` lồng nhau (vd. `src/shared/ui/AGENTS.md`). ⛔ Kiro KHÔNG đọc `CLAUDE.md`,
`GEMINI.md`, `.claude/`. `../AGENTS.md`, `../GEMINI.md` (quy tắc toàn repo) nằm ngoài workspace của package, Kiro
không tự nạp — `AGENTS.md` bảo đọc thì mở trực tiếp. File này chỉ nêu phần khác khi chạy trong Kiro, không lặp lại
`AGENTS.md`.

## 1. Quy tắc mở đầu

⛔ Trước MỌI thay đổi mã nguồn (kể cả một dòng): kích hoạt skill `base-rules` (`/base-rules`, file
`.kiro/skills/base-rules/SKILL.md`), rồi skill chuyên đề theo bảng skill trong `AGENTS.md`. Dòng này thay cho chỉ dẫn
"mở `.claude/skills/base-rules/SKILL.md`" trong `AGENTS.md`.

## 2. Đồng bộ

- `AGENTS.md`/`GEMINI.md` nhắc `.claude/skills/<x>/SKILL.md` → trong Kiro là `.kiro/skills/<x>/SKILL.md` (cùng nội
  dung). ⚠️ Sửa skill thì sửa CẢ HAI nơi — sửa một bên là Claude/Codex/Gemini và Kiro đọc hai bộ luật khác nhau.
- `docs/rules/` là nguồn DUY NHẤT của rules. Steering trong `.kiro/steering/` chỉ nhúng tham chiếu tới file rule;
  ⛔ không sao chép nội dung rule vào steering. Sửa rule thì sửa trong `docs/rules/`.

## 3. Skill (`.kiro/skills/`)

Tự kích hoạt theo `description`, hoặc gõ `/tên-skill` trong chat.

| Skill | Mục đích |
| --- | --- |
| `/base-rules` | Luật mặc định, đọc TRƯỚC mọi việc: điều cấm, quy trình sửa, cổng `npm run check`, chỉ đường skill |
| `/ui-component` | Dựng/sửa component `src/shared/ui/`, `className`, node Figma; cạm bẫy NativeWind + tailwind-merge |
| `/responsive-ui` | Bố cục co giãn `phone:`/`tablet:`/`tablet-lg:`, máy tính bảng, xoay ngang |
| `/design-tokens` | Sửa token màu/chữ/bo góc/giãn cách/breakpoint/font và generator |
| `/feature-screen` | Thêm màn hình/feature/route/tab, `MODULE_REGISTRY`, guard, `PATHS` |
| `/api-data` | Gọi API ba tầng, React Query, interceptor, 401/refresh token |
| `/form-and-test` | Form React Hook Form + Zod 4, viết test Jest + Testing Library |

## 4. Steering rule (`.kiro/steering/`)

Mỗi file bọc đúng một `docs/rules/<tên>.md`:

| Steering | Tự nạp khi |
| --- | --- |
| `api-patterns` | auto — gọi API, `apiClient`, React Query, 401/refresh |
| `code-style` | auto — đặt tên, thứ tự import, giới hạn dòng, chú thích |
| `feature-structure` | auto — cấu trúc `src/features/<ten>/`, đặt file ở đâu, import chéo feature |
| `form-validation` | auto — form React Hook Form + Zod |
| `mobile-ux` | auto — vùng chạm, vùng an toàn, bàn phím, trợ năng |
| `navigation` | fileMatch — `app/**/*.tsx`, `src/shell/navigation/**`, `src/shell/deeplink/**`, `src/shell/config/constants.ts` |
| `responsive` | auto — breakpoint, máy tính bảng, xoay ngang |
| `screen-layout` | auto — lưới màn, lề/khe, định dạng tiền/ngày |
| `styling-nativewind` | auto — `className`, token, `tv()`/`cn()` |
| `testing` | fileMatch — `**/*.test.ts`, `**/*.test.tsx`, `**/tests/**`, `jest.config.js`, `jest.setup.js`, `__mocks__/**` |
| `ui-components` | auto — DÙNG component `@/shared/ui` trong màn hình/feature |
| `webview` | auto — dựng/sửa màn hình webview |

⚠️ Tự nạp chỉ là lưới an toàn. Vẫn theo mục "Trước khi sửa" của `AGENTS.md`: rule cần đọc mà chưa có trong ngữ cảnh
thì tự mở `docs/rules/<tên>.md`.

## 5. Ánh xạ Claude → Kiro

| Claude Code | Kiro IDE |
| --- | --- |
| Read / Glob / Grep / LS | read_file / file_search / grep_search / list_directory |
| Edit / MultiEdit / Write | str_replace / fs_write |
| Bash | execute_bash (lệnh chạy lâu: control_bash_process) |
| WebSearch / WebFetch | remote_web_search / web_fetch |
| Task tool / subagent | invoke_sub_agent (built-in `context-gatherer`, `general-task-execution`, hoặc custom agent trong `.kiro/agents/` — không có trong project này) |
| TaskCreate/TaskUpdate/TaskList | todo_list |
| AskUserQuestion | hỏi trực tiếp người dùng trong chat rồi dừng chờ trả lời |
| Skill tool, `/x` | skill trong `.kiro/skills/` — tự kích hoạt theo description hoặc gõ `/tên-skill` |
| `CLAUDE.md` (`@AGENTS.md`) | `AGENTS.md` (Kiro tự nạp) + `.kiro/steering/` |
| `.claude/settings.json` | `.kiro/settings/mcp.json` (MCP, chỉ người dùng sửa), permissions.yaml của người dùng |
| hooks | `.kiro/hooks/*.json` |
| Plan mode | Kiro Spec (`.kiro/specs/<feature>/requirements.md, design.md, tasks.md`) |

## 6. Plugin Expo

Claude bật plugin `expo@claude-plugins-official` (Expo Skills) trong `.claude/settings.json`. Kiro không có plugin
tương đương; người dùng có thể tự import Expo Skills từ https://github.com/expo/skills qua Kiro panel (Agent Steering &
Skills → + → Import a skill). ⛔ Agent KHÔNG tự cài plugin/skill ngoài.

## 7. Bí mật

Hook `.kiro/hooks/privacy-guard.json` hỏi xác nhận khi tool đọc/ghi/xoá file bí mật: `.env`/`.env*.local` (thực tế
mọi `.env*` trừ `.env.example`), `google-services.json`, `GoogleService-Info.plist`, `*service-account*.json`, `*.jks`,
`*.p8`, `*.p12`, `*.key`, `*.pem`…

- Bị hỏi hoặc bị từ chối ⇒ chờ người dùng. ⛔ Không dùng lệnh khác để vượt chặn. ⛔ Không in giá trị secret.
- Cần biết tên biến môi trường ⇒ đọc `.env.example`.

## 8. Kiểm tra sau thay đổi

Theo `AGENTS.md` (mục "Trước khi sửa", bước 3): `npm run check`. Không lặp lại chi tiết ở đây.
