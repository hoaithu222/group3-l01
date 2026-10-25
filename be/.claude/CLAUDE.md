# Claude AI Configuration — Super App Backend (be)

## Project Overview

**Super App Backend** — Express.js + TypeScript + Prisma + Redis base.
3-layer architecture: **core** (utilities) → **infrastructure** (integrations) → **modules** (business).

Đây là base tối giản (chỉ `auth` + `users`) cho một nền tảng học tập/làm việc
nhóm lớn hơn nhiều — xem `d:\work\super-app\docs\notes.md` cho đặc tả đầy đủ 8
phân hệ dự kiến, và `docs/development-roadmap.md` cho việc đối chiếu base hiện
tại với các phân hệ đó.

### Tech Stack

| Layer          | Technology                              |
| -------------- | --------------------------------------- |
| Framework      | Express 4.18                            |
| Language       | TypeScript 5 (strict mode)              |
| Database       | Prisma 5.8 + **MongoDB Atlas** (`datasource provider = "mongodb"`) — chỉ `prisma db push`, KHÔNG hỗ trợ `prisma migrate` |
| Cache          | Redis 4.6                               |
| Auth           | JWT (access + refresh tokens)           |
| Validation     | Zod 3.22                                |
| Logging        | Winston 3.11                            |
| File Upload    | Multer (memoryStorage khi dùng Cloudinary) |
| Email          | Nodemailer                              |
| Storage        | **Cloudinary** / AWS S3 / Local — chọn qua `STORAGE_TYPE` (`src/infrastructure/storage`) |
| Security       | Helmet, CORS, Rate Limiting             |
| Real-time      | Socket.IO                               |
| Testing        | Jest + Supertest                        |
| API Docs       | Swagger/OpenAPI (tắt mặc định trong production) |

> ⚠️ Khi nâng cấp `prisma`/`@prisma/client`: Prisma ORM **v7 đã bỏ hỗ trợ MongoDB**.
> Chỉ nâng lên bản v6.x mới nhất, KHÔNG lên v7 trở lên nếu còn dùng MongoDB.

### Path Aliases

```
@/*              → src/*
@core/*          → src/core/*
@infrastructure/* → src/infrastructure/*
@modules/*       → src/modules/*
@shared/*        → src/shared/*
```

## Mandatory Rules

**BẮT BUỘC** tuân thủ tất cả rules trong `.claude/rules/` trước khi code:

- `architecture.md` — 3-layer architecture, module structure, dependency flow
- `error-handling.md` — AppError hierarchy, error codes, catchAsync, ResponseUtils
- `api-patterns.md` — Controller factory, service layer, repository pattern
- `validation-security.md` — Zod DTOs, input sanitization, auth/authz patterns
- `reuse-first.md` — Tái sử dụng utilities, middlewares, infrastructure có sẵn (danh sách phản ánh đúng base tối giản này)
- `code-style.md` — TypeScript strict, naming conventions

## Workflow BẮT BUỘC trước khi code

1. **Đọc rules** — Tất cả files trong `.claude/rules/`
2. **Kiểm tra existing code** — Tìm utilities, middlewares, base classes có sẵn
3. **Code theo patterns** — Controller factory → Service (DI) → Repository interface
4. **Error handling** — Throw AppError subclasses, dùng catchAsync
5. **Validation** — Zod schemas cho mọi input
6. **Review** — Không hardcode secrets, không skip validation, không dùng `any`

---

## ClaudeKit Integration

### Hook Response Protocol — Privacy Block (`@@PRIVACY_PROMPT@@`)

When a tool call is blocked by the privacy-block hook, the output contains a JSON marker between `@@PRIVACY_PROMPT_START@@` and `@@PRIVACY_PROMPT_END@@`. **You MUST use the `AskUserQuestion` tool** to get proper user approval.

**Required Flow:**
1. Parse the JSON from the hook output
2. Use `AskUserQuestion` with the question data from the JSON
3. Based on user selection:
   - **"Yes, approve access"** → Use `bash cat "filepath"` to read the file
   - **"No, skip this file"** → Continue without accessing the file

### Available Agents (`.claude/agents/`)

| Agent | Khi nào dùng |
|-------|-------------|
| `code-reviewer` | Review code, kiểm tra best practices |
| `debugger` | Phân tích và sửa bugs phức tạp |
| `tester` | Viết và chạy test cases |
| `planner` | Lập kế hoạch feature trước khi implement |
| `docs-manager` | Tạo và cập nhật documentation |

### Available Skills (`.claude/skills/`)

**Common:** `ck-debug`, `code-review`, `fix`, `sequential-thinking`, `problem-solving`, `git`

**BE-specific:** `backend-development`, `databases`

**IMPORTANT:** Analyze and activate relevant skills before proceeding with each task.

### Orchestration Protocol

Tham khảo `.claude/rules/orchestration-protocol.md` khi cần phối hợp nhiều agents.
