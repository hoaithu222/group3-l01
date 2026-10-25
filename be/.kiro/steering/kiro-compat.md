---
inclusion: always
---

# Kiro IDE ↔ Claude Code — tương thích cho be

## 1. Nguồn gốc & đồng bộ

- Steering của be được sao từ `.claude/rules/` — bộ rules dùng chung mà `AGENTS.md`/`GEMINI.md` trỏ tới (Codex, Antigravity, Claude vẫn đọc bản trong `.claude/rules/`). Khi sửa một rule, sửa cả `.claude/rules/X.md` và `.kiro/steering/X.md` (bản Kiro giữ front matter và các chú thích `Kiro IDE`).
- Tương tự với agents và skills: `.claude/agents/<tên>.md` ↔ `.kiro/agents/<tên>.md`, `.claude/skills/<tên>/` ↔ `.kiro/skills/<tên>/`.
- `project-overview.md` gộp từ `CLAUDE.md` + `.claude/CLAUDE.md`; `kiro-compat.md` chỉ có ở Kiro.
- `AGENTS.md` được Kiro tự nạp. Mục “Các điểm phải đối chiếu với mã nguồn” trong đó được ưu tiên hơn ví dụ cũ trong steering (ID là ObjectId chứ không phải UUID, danh sách middleware/infrastructure trong `reuse-first.md` chưa đầy đủ, sanitizer dùng allowlist, `core/...` nằm dưới `src/`).
- Khi AGENTS.md nhắc `.claude/rules/X.md`, bản Kiro là `.kiro/steering/X.md` (cách nạp: bảng trong `project-overview.md`). Phần “Quy trình AI Agent (Antigravity & Codex)” của AGENTS.md vẫn áp dụng, với khác biệt: Kiro có custom agents thật (mục 3), skills trong `.kiro/skills/` (mục 4) và hook privacy thật (mục 7).

## 2. Bảng ánh xạ Claude → Kiro

| Claude Code | Kiro IDE |
|---|---|
| Read / Glob / Grep / LS | read_file / file_search / grep_search / list_directory |
| Edit / MultiEdit / Write | str_replace / fs_write |
| Bash | execute_bash (lệnh chạy lâu: control_bash_process) |
| WebSearch / WebFetch | remote_web_search / web_fetch |
| Task tool, `subagent_type=X` | invoke_sub_agent (custom agent trong `.kiro/agents/` hoặc built-in `context-gatherer`, `general-task-execution`) |
| Task(Explore), scout | built-in subagent `context-gatherer` |
| TaskCreate/TaskUpdate/TaskGet/TaskList | todo_list |
| SendMessage / Agent Teams | không có — subagent trả kết quả về agent chính |
| AskUserQuestion | hỏi trực tiếp người dùng trong chat rồi dừng chờ trả lời |
| Skill tool, `/ck:x`, `/x` | skill trong `.kiro/skills/` — tự kích hoạt theo description hoặc gõ `/tên-skill` |
| `.claude/rules/*.md` | `.kiro/steering/*.md` |
| `CLAUDE.md` | `AGENTS.md` (tự nạp) + `.kiro/steering/` |
| permissions trong settings.json | `permissions.rules` trong agent / permissions.yaml của người dùng |
| hooks trong settings.json | `.kiro/hooks/*.json` |
| Plan mode | Kiro Spec (`.kiro/specs/<feature>/requirements.md, design.md, tasks.md`) |
| `model` (opus/sonnet/haiku), `memory`, `color`, `permissionMode` của agent | bỏ — Kiro dùng model mặc định; không có agent memory/`MEMORY.md` (ghi phát hiện đáng nhớ vào báo cáo trả về agent chính) |
| Ngữ cảnh do hook chèn (`## Naming`, `## Plan Context`, coding level, `docs.maxLoc`) | không có — xem mục 6 |

## 3. Custom agents trong `.kiro/agents/` (13)

| Agent | Khi nào dùng |
| --- | --- |
| `backend` | Tạo module mới (routes/controller/service/repository/DTO), API endpoint, sửa bug backend, đổi schema Prisma (`db push`), auth/authz, tối ưu, viết test |
| `brainstormer` | Brainstorm giải pháp, đánh giá hướng kiến trúc, tranh luận trade-off trước khi code; chỉ tư vấn |
| `code-reviewer` | Review sau khi triển khai / trước PR: chất lượng, bảo mật (OWASP), hiệu năng, edge case |
| `code-simplifier` | Làm gọn, rõ code vừa sửa mà giữ nguyên hành vi |
| `debugger` | Điều tra lỗi (500, test fail, CI/CD), hiệu năng, log, DB; báo cáo nguyên nhân gốc có bằng chứng |
| `docs-manager` | Tạo/cập nhật/rà soát tài liệu trong `docs/`, đồng bộ docs với code |
| `git-manager` | Stage/commit/push theo conventional commits — chỉ khi người dùng yêu cầu |
| `journal-writer` | Ghi nhật ký kỹ thuật khi gặp sự cố lớn, test fail lặp lại, quyết định kiến trúc có vấn đề |
| `mcp-manager` | Khám phá và chạy tool MCP, giữ ngữ cảnh agent chính gọn |
| `planner` | Nghiên cứu và lập kế hoạch triển khai trước tính năng lớn/phức tạp; không tự code |
| `project-manager` | Theo dõi tiến độ theo plan, tổng hợp báo cáo, cập nhật plan/roadmap |
| `researcher` | Nghiên cứu công nghệ, thư viện, best practice; báo cáo có xếp hạng khuyến nghị |
| `tester` | Chạy test/coverage/build sau khi code hoặc sửa lỗi, phát hiện hồi quy |

- Cách gọi: yêu cầu “dùng agent `<tên>` …” (agent chính gọi `invoke_sub_agent`), chọn agent ở agent picker, hoặc gõ `/<tên>`.
- Built-in `context-gatherer` thay `Explore`/scout của Claude để khảo sát codebase.
- Custom agent không kế thừa steering/skills: mỗi agent tự khai báo `resources` (AGENTS.md, `project-overview.md`, `kiro-compat.md`, steering liên quan và `skill://.kiro/skills/*/SKILL.md`). `reuse-first.md` (142 KB) không nằm trong `resources` — grep/đọc khi sắp tạo util/middleware/service mới. Khi giao việc, ghi rõ phạm vi file, tiêu chí hoàn thành và đường dẫn plan/báo cáo (theo `orchestration-protocol.md`).
- Việc nhỏ thì agent chính tự làm; chỉ giao subagent khi có phần việc độc lập phù hợp (theo AGENTS.md). Mục “Team Mode” trong các agent chỉ dành cho Claude Agent Teams — bỏ qua trong Kiro.

## 4. Skills trong `.kiro/skills/` (13)

Skill tự kích hoạt theo description hoặc gõ `/tên-skill`. Tên đổi so với Claude: `ck:debug` → `/ck-debug`; các `ck:<x>` khác → `/<x>` (vd `ck:code-review` → `/code-review`).

| Skill | Mục đích |
| --- | --- |
| `/ask` | Trả lời câu hỏi kỹ thuật/kiến trúc: quyết định thiết kế, best practice, so sánh giải pháp |
| `/backend-development` | Xây backend (Node.js, Python, Go): REST/GraphQL/gRPC, auth (OAuth, JWT), database, microservices, bảo mật OWASP, Docker/K8s |
| `/bootstrap` | Khởi tạo project mới: research, tech stack, design, plan, triển khai (full/auto/fast/parallel) |
| `/brainstorm` | Brainstorm giải pháp kèm phân tích trade-off: ý tưởng, quyết định kiến trúc, đánh giá khả thi |
| `/ck-debug` | Debug có hệ thống, tìm nguyên nhân gốc trước khi sửa: bug, test fail, hiệu năng, log, CI/CD, DB |
| `/code-review` | Review code nghiêm ngặt (thay đổi đang chờ, PR, commit, quét codebase) kèm red-team bảo mật |
| `/databases` | Thiết kế schema, viết query MongoDB/PostgreSQL: aggregation, index, migration, tối ưu hiệu năng |
| `/docs` | Phân tích codebase và quản lý tài liệu dự án (init/update/summarize) |
| `/docs-seeker` | Tra tài liệu thư viện/framework qua llms.txt (context7), phân tích repo GitHub |
| `/fix` | Sửa bug, lỗi type/lint, test fail, CI/CD, định tuyến theo loại lỗi |
| `/git` | Git theo conventional commits: stage, commit, push, PR, merge; tự tách commit, quét secret |
| `/problem-solving` | Kỹ thuật gỡ bí khi bế tắc: vòng xoáy phức tạp, giả định ràng buộc, đơn giản hoá |
| `/sequential-thinking` | Phân tích từng bước có sửa đổi cho bài toán nhiều bước, kiểm chứng giả thuyết |

## 5. ClaudeKit được nhắc tới nhưng không cài trong be

Không tự cài bộ ClaudeKit hay plugin để mô phỏng. Thay thế:

| Tham chiếu trong steering/agents | Trong Kiro |
| --- | --- |
| `ck:scout` (`/ck:scout`, `/ck:scout ext`, skill `scout`) | subagent `context-gatherer` (hoặc `grep_search`/`file_search`) |
| `ck:plan` (`/ck:plan --fast/--hard`, skill `plan`, `ck-plan/references/…`) | agent `planner` (hoặc Kiro Spec) |
| `ck:cook` | tự triển khai theo `primary-workflow.md` (hoặc thực thi tasks của Kiro Spec) |
| `ck:test` | agent `tester` |
| `ck:project-management` (skill `project-management`) | agent `project-manager` |
| `ck:journal` | agent `journal-writer` |
| `ck:mcp-management` / `ck:use-mcp` (skill `mcp-management`) | agent `mcp-manager` |
| agent `fullstack-developer` / `backend-developer` | agent `backend` |
| agent `ui-ux-designer` | không có trong be |
| `ck:ai-multimodal`, `ck:preview`, `ck:chrome-devtools`, `ck:context-engineering`, `ck:ship`, `ck:ui-ux-pro-max`, `ck:repomix`, `ck:project-organization`, `ck:frontend-design`, `ck:better-auth`, `ck:worktree`, `ck:web-testing`, `ck:security-scan`, `ck:deploy`, `ck:team`, skill `research`, `document-skills`, `imagemagick`, `mermaidjs-v11`… | không có: bỏ qua bước đó hoặc hỏi người dùng |
| `.claude/scripts/*.cjs` (`validate-docs.cjs`, `set-active-plan.cjs`), `.claude/.ck.json`, `.claude/.mcp.json` | không có. MCP của Kiro nằm ở `.kiro/settings/mcp.json` (lúc chuyển đổi chưa có; chỉ người dùng tạo/sửa) |
| CLI ngoài `repomix`, `gemini`, `gh`, `mongosh` (`psql` không liên quan — DB là MongoDB) | lúc chuyển đổi không tìm thấy trong PATH — kiểm tra `command -v <cli>` trước khi dùng; không tự cài (kể cả `npx` tải gói mới); thiếu thì dùng tool đọc code của Kiro hoặc hỏi người dùng |

## 6. Quy ước đặt tên (thay `## Naming` / `## Plan Context` do hook ClaudeKit chèn)

Kiro không chèn biến đặt tên hay Plan Context. Tự lấy ngày giờ hiện tại (vd `date +%Y%m%d-%H%M`) và dùng:

| Loại | Đường dẫn (tính từ `be/`) |
| --- | --- |
| Kế hoạch | `plans/<YYYYMMDD-HHmm>-<chu-de>/plan.md` (theo AGENTS.md); phase: `phase-XX-<ten>.md` cùng thư mục |
| Báo cáo của subagent | `plans/reports/<agent>-<YYYYMMDD-HHmm>-<chu-de>.md`; nếu agent chính giao việc kèm một plan thì dùng `<plan-dir>/reports/` như prompt ghi |
| Nhật ký (`journal-writer`) | `docs/journals/<YYYYMMDD-HHmm>-<chu-de>.md` |
| Hình minh hoạ | `<plan-dir>/visuals/` hoặc `plans/visuals/` |

- `<chu-de>`: kebab-case, không dấu, ngắn gọn (vd `refresh-token-rotation`).
- Chỉ tạo plan/báo cáo/nhật ký khi thật sự cần; không tạo cho chỉnh sửa nhỏ. `plans/` và `docs/journals/` chưa có sẵn — tạo khi cần.
- Không phụ thuộc biến hook (`{CK_REPORTS_PATH}`, `{plan_dir}`, `docs.maxLoc`…); `docs.maxLoc` mặc định 800 dòng.

## 7. Privacy — file bí mật

- Hook `.kiro/hooks/privacy-guard.json` (PreToolUse, chạy `.kiro/scripts/privacy-guard.cjs`) hỏi người dùng xác nhận khi tool sắp đọc/ghi/xoá file bí mật: `.env`/`.env.*` (trừ `.env.example`), `*.pem`, `*.key`, `*-firebase-adminsdk-*.json`, service account, `client_secret*.json`, thư mục `secrets/`… Custom agents có thêm `permissions.rules` (`effect: ask`) cho cùng nhóm file.
- Khi bị hỏi hoặc bị từ chối: dừng và chờ người dùng quyết định; không dùng lệnh/shell khác để vượt chặn; không in giá trị secret ra chat, tài liệu, log hay commit (chỉ nhắc tên biến).
- Thay cho giao thức `@@PRIVACY_PROMPT@@` + `AskUserQuestion` của ClaudeKit.

## 8. `$ARGUMENTS` trong skill

Kiro IDE không tự thay placeholder: `$ARGUMENTS` trong `SKILL.md` = phần văn bản người dùng gõ sau `/<skill>` (vd `/fix lỗi 500 ở /api/v1/users` → `$ARGUMENTS` = `lỗi 500 ở /api/v1/users`).

## 9. Kiểm tra sau thay đổi

- Mã nguồn/cấu hình be: chạy trong `be/` theo AGENTS.md — `npm run build`, `npm run lint`, `npm test -- --runInBand`. Lệnh chạy lâu (dev server, watch) dùng `control_bash_process`.
- Chỉ Markdown/steering/agents: kiểm tra đường dẫn, tên script, phạm vi rules và `git diff --check` (theo `../AGENTS.md`); không cần build/test ứng dụng. Với steering/agents: dòng 1 phải là `---`, `fileMatchPattern` là mảng, `resources` chỉ trỏ file có thật.
- Không chạy `prisma:reset`, seed hay `db:push` chỉ để kiểm tra rules/build.
