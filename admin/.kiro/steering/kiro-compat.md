---
inclusion: always
---

# Kiro compat — dùng rules/skills/agents của admin trong Kiro

Workspace Kiro = thư mục `admin/`; mọi đường dẫn dưới đây tính từ đây. Kiro tự nạp `AGENTS.md`; KHÔNG đọc `CLAUDE.md`, `GEMINI.md` hay `.claude/`.

## 1. Nguồn & đồng bộ

- `docs/rules/*.md` là nguồn DUY NHẤT của quy tắc kỹ thuật. `.kiro/steering/<rule>.md` chỉ chứa file reference tới `docs/rules/<rule>.md` (mẫu: `.kiro/steering/api-patterns.md`) — sửa rule thì sửa ở `docs/rules/`, không chép nội dung vào steering.
- `.kiro/steering/project-overview.md` là bản chuyển của `.claude/CLAUDE.md`; đổi index/luật ở một bên → cập nhật bên kia.
- Skill và agent có HAI bản song song: `.claude/skills/` ↔ `.kiro/skills/`, `.claude/agents/` ↔ `.kiro/agents/`. Sửa một bên thì sửa cả hai (Claude Code đọc `.claude/`, Kiro đọc `.kiro/`).

## 2. Ánh xạ Claude Code → Kiro

| Claude Code | Kiro IDE |
|---|---|
| Read / Glob / Grep / LS | read_file / file_search / grep_search / list_directory |
| Edit / MultiEdit / Write | str_replace / fs_write |
| Bash | execute_bash (lệnh chạy lâu: control_bash_process) |
| WebSearch / WebFetch | remote_web_search / web_fetch |
| Task tool / subagent | invoke_sub_agent (custom agent trong `.kiro/agents/` hoặc built-in `context-gatherer`, `general-task-execution`) |
| TaskCreate/TaskUpdate/TaskList | todo_list |
| AskUserQuestion | hỏi trực tiếp người dùng trong chat rồi dừng chờ trả lời |
| Skill tool, `/x` | skill trong `.kiro/skills/` — tự kích hoạt theo description hoặc gõ `/tên-skill` |
| `.claude/CLAUDE.md` | `.kiro/steering/project-overview.md` (+ `AGENTS.md` tự nạp) |
| `rules_dir: docs/rules` | `.kiro/steering/<rule>.md` (bọc file reference tới `docs/rules/<rule>.md`) |
| `agents_dir: .claude/agents` | `.kiro/agents/` |
| `permissions.allow` trong settings.json | `permissions.rules` trong `.kiro/agents/*` (agent mặc định: người dùng tự chọn "Always allow" hoặc permissions.yaml của họ) |
| hooks | `.kiro/hooks/*.json` |
| Plan mode | Kiro Spec (`.kiro/specs/<feature>/requirements.md, design.md, tasks.md`) |

## 3. Custom agents (`.kiro/agents/`)

| Agent | Dùng khi | Tools |
|---|---|---|
| `code-reviewer` | Implement xong 1 thay đổi, trước khi coi là hoàn thành — review vi phạm kit2/design-system, correctness, bảo mật, kiến trúc (có `file:line`) | read, shell |
| `frontend` | Viết/sửa component, page, feature UI; chọn component/layout kit2 | read, write, shell |
| `ui-ux-designer` | Quyết định bố cục/visual cho màn hình mới trước khi code, hoặc review màn đã build (chỉ đọc, không sửa file) | read |

Cách gọi: chọn trong agent picker (thanh nhập chat), gõ `/<tên>` (vd. `/code-reviewer`), hoặc nhờ agent mặc định "dùng agent code-reviewer review diff hiện tại" (chạy như sub-agent). Custom agent KHÔNG kế thừa steering/skill: mỗi agent đã khai `resources` (AGENTS.md, 2 steering này, vài `docs/rules/*.md` sát việc, `.kiro/skills/*/SKILL.md`); rule khác đọc theo Rules index trong `project-overview.md`. Agent của workspace chỉ nạp khi workspace được tin cậy (trusted).

## 4. Skills (`.kiro/skills/`, gõ `/tên`)

| Skill | Mục đích |
|---|---|
| `/brainstorm` | Cân nhắc trade-off kiến trúc trước thay đổi lớn/khó đảo ngược, không tự chốt khi có ≥2 phương án |
| `/debug` | Debug có hệ thống: tìm root cause trước khi sửa (bug, test fail, hành vi lạ, hiệu năng) |
| `/docs` | Cập nhật `docs/rules/*.md` khi code đổi làm rule lệch, hoặc quyết định có viết rule mới |
| `/fix` | Sửa 1 lỗi cụ thể (bug/type/lint/CI): scout → diagnose → sửa gốc |
| `/frontend-design` | Dựng màn hình/dashboard mới trong ranh giới token/kit2, tránh "AI slop" |
| `/frontend-development` | Pattern component/page/hook React 19 + TS: cấu trúc, lazy-load qua module registry, memo |
| `/git` | Stage, security scan, tách commit theo scope, conventional commits, push/PR |
| `/kit2-component-picker` | Chọn đúng component kit2 cho 1 nhu cầu UI theo 3R |
| `/new-feature` | Scaffold phân hệ/feature mới: thư mục feature + đăng ký route qua module registry |
| `/problem-solving` | Thoát bế tắc khi đã thử nhiều cách (không phải bug cụ thể — dùng `/debug`) |
| `/react-best-practices` | Checklist hiệu năng React (re-render, bundle) cho Vite SPA |
| `/ui-styling` | Style component bằng kit2 (Radix + tailwind-variants + token Tailwind v4), đổi theme, chọn token/variant |
| `/web-testing` | Viết/chạy/sửa test Vitest + Testing Library (không có Playwright/e2e) |

## 5. Quyền (permissions)

- Allow-list của `.claude/settings.json` (`Bash(npx tsc:*)`, `Bash(npm run:*)`, `Bash(node scripts/*)`) đã chuyển thành `permissions.rules` (`capability: shell`, `effect: allow`, match `npx tsc*`, `npm run *`, `node scripts/*`) trong `code-reviewer` và `frontend`. `ui-ux-designer` không có shell. Lệnh khác vẫn hỏi.
- Agent mặc định vẫn hỏi theo cơ chế Kiro; người dùng tự chọn "Always allow" hoặc cấu hình quyền của họ. Agent KHÔNG tự nới quyền toàn cục, không sửa `.kiro/settings/`.
- Typecheck: dùng `npm run typecheck` (`tsc -b --noEmit`, husky pre-commit cũng chạy lệnh này). ⛔ KHÔNG `npx tsc --noEmit` — `tsconfig.json` solution-style nên lệnh đó kiểm 0 file (AGENTS.md). `npx tsc*` trong allow-list chỉ giữ cho khớp bản gốc.

## 6. Privacy — file bí mật

- Hook `.kiro/hooks/privacy-guard.json` (PreToolUse → `node .kiro/scripts/privacy-guard.cjs`) hỏi xác nhận khi tool đọc/ghi/xoá file bí mật: `.env`, `.env.local`, `.env.production`, `*.pem`, `*.key`, service-account, client_secret… Custom agents có thêm `permissions.rules` `effect: ask` cho cùng nhóm file (trừ `.env.example`).
- Khi bị hỏi/từ chối: dừng và chờ người dùng; KHÔNG vượt chặn bằng lệnh khác (cat/type/grep/node…), KHÔNG in giá trị secret ra chat, log hay commit.
- Cần biết tên biến môi trường → đọc `.env.example`. Không đặt secret trong biến `VITE_*` (AGENTS.md).

## 7. Kiểm tra sau thay đổi

Theo `AGENTS.md`: sửa mã/cấu hình → `npm run check` phải sạch (typecheck → lint → kiểm import → kiểm vòng → orphans → test). Chỉ sửa Markdown → kiểm đường dẫn và `git diff --check` (theo `../AGENTS.md`). Không tắt rule hay sửa test chỉ để có kết quả xanh.
