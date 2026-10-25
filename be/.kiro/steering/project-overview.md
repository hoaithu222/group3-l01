---
inclusion: always
---

# Tổng quan dự án — Super App Backend (be)

> Gộp từ `CLAUDE.md` và `.claude/CLAUDE.md` (memory Claude của be; Kiro không đọc hai file này). Quy tắc chung đã có trong `AGENTS.md` (tự nạp) — file này chỉ giữ phần bổ sung. Cách dùng tool/agent/skill trong Kiro: `.kiro/steering/kiro-compat.md`.

## Project Overview

**Super App Backend** — Express.js + TypeScript + Prisma + Redis base.
3-layer architecture: **core** (utilities) → **infrastructure** (integrations) → **modules** (business).

Đây là base tối giản (chỉ `auth` + `users`) cho một nền tảng học tập/làm việc
nhóm lớn hơn nhiều — xem `../docs/notes.md` (`d:\work\super-app\docs\notes.md`)
cho đặc tả đầy đủ 8 phân hệ dự kiến, và `docs/development-roadmap.md` cho việc
đối chiếu base hiện tại với các phân hệ đó.

> Ghi chú khi chuyển sang Kiro: “chỉ `auth` + `users`” mô tả base ban đầu; lúc chuyển đổi `src/modules/` đã có 57 module. Luôn đối chiếu mã nguồn và `docs/development-roadmap.md` trước khi kết luận một phân hệ đã có hay chưa.

## Tech Stack

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
| Container      | Docker + docker-compose                 |

Phiên bản trong bảng là mốc tối thiểu theo `package.json`; bản cài thực tế xem `package-lock.json`.

> ⚠️ Khi nâng cấp `prisma`/`@prisma/client`: Prisma ORM **v7 đã bỏ hỗ trợ MongoDB**.
> Chỉ nâng lên bản v6.x mới nhất, KHÔNG lên v7 trở lên nếu còn dùng MongoDB.

## Path Aliases

```
@/*              → src/*
@core/*          → src/core/*
@infrastructure/* → src/infrastructure/*
@modules/*       → src/modules/*
@shared/*        → src/shared/*
```

## Express Structure

Xem chi tiết đầy đủ ở `FOLDER_TREE.md`:

```
src/
├── core/                     # utils, exceptions, middlewares, config (Zod env schema)
├── infrastructure/           # database (Prisma+MongoDB), redis, storage (Local/S3/Cloudinary), socket, mail, logger
├── modules/{feature}/        # 1 module = 1 business feature (routes/controller/service/repo/dto)
└── app.ts / router.ts / server.ts
```

Cây trên là bản rút gọn: còn có `src/shared/` (dto, ports, events… dùng chung) và nhiều thư mục infrastructure khác (vd `error-tracker/`, `queue/`, `push/`, `metrics/`) — tra `FOLDER_TREE.md` và mã nguồn.

## Mandatory Rules

**BẮT BUỘC** tuân thủ tất cả steering trong `.kiro/steering/` trước khi code (sao từ `.claude/rules/`):

- `architecture.md` — 3-layer architecture, module structure, dependency flow
- `error-handling.md` — AppError hierarchy, error codes, catchAsync, ResponseUtils
- `api-patterns.md` — Controller factory, service layer, repository pattern
- `validation-security.md` — Zod DTOs, input sanitization, auth/authz patterns
- `reuse-first.md` — Tái sử dụng utilities, middlewares, infrastructure có sẵn (danh sách chưa đầy đủ — tìm trong mã nguồn trước khi tạo mới, xem AGENTS.md)
- `code-style.md` — TypeScript strict, naming conventions

Workflows:

- Primary: `.kiro/steering/primary-workflow.md`
- Dev rules: `.kiro/steering/development-rules.md`
- Orchestration: `.kiro/steering/orchestration-protocol.md` (tham khảo khi cần phối hợp nhiều agent)

Cách Kiro nạp steering:

| Inclusion | File |
| --- | --- |
| always | `project-overview`, `kiro-compat`, `architecture`, `api-patterns`, `error-handling`, `validation-security`, `code-style`, `development-rules`, `primary-workflow`, `skill-workflow-routing`, `skill-domain-routing` |
| fileMatch | `reuse-first` (`src/**/*.ts`, `prisma/**/*.prisma`, `prisma/**/*.ts`, `scripts/**/*.ts`) |
| auto (theo mô tả) | `orchestration-protocol`, `team-coordination-rules`, `documentation-management` |

`reuse-first.md` tự nạp khi làm việc với file trong `src/`, `prisma/`, `scripts/`; nếu sắp tạo util/middleware/service mới mà chưa mở file nào ở đó, đọc `.kiro/steering/reuse-first.md` trước. Custom agent không tự nạp steering (kể cả fileMatch) nên cũng phải đọc/grep file này trước khi tạo mới.

## Workflow BẮT BUỘC trước khi code

1. **Đọc rules** — Tất cả steering trong `.kiro/steering/` (phần lớn đã tự nạp; `reuse-first.md` nạp theo file)
2. **Kiểm tra existing code** — Tìm utilities, middlewares, base classes có sẵn
3. **Code theo patterns** — Controller factory → Service (DI) → Repository interface
4. **Error handling** — Throw AppError subclasses, dùng catchAsync
5. **Validation** — Zod schemas cho mọi input
6. **Review** — Không hardcode secrets, không skip validation, không dùng `any`

## Pre-flight Checks

1. Đọc file liên quan trước khi sửa
2. Kiểm tra existing middlewares/services trước khi tạo mới
3. Sau khi sửa: `npm run build` để check compile errors (đủ bộ kiểm tra theo AGENTS.md: `npm run build`, `npm run lint`, `npm test -- --runInBand`)
4. Không tạo file mới nếu có thể sửa file hiện có

## Rules

- **KHÔNG** dùng `any` TypeScript — dùng `unknown`
- **LUÔN** validate input với middleware (zod)
- **LUÔN** handle async errors với `catchAsync`
- **KHÔNG** để business logic trong route handlers — chuyển vào services
- **LUÔN** sanitize user input, follow OWASP top 10

## Agents và skills trong Kiro

**Custom agents** (`.kiro/agents/`): `backend`, `brainstormer`, `code-reviewer`, `code-simplifier`, `debugger`, `docs-manager`, `git-manager`, `journal-writer`, `mcp-manager`, `planner`, `project-manager`, `researcher`, `tester` — khi nào dùng và cách gọi: mục 3 của `kiro-compat.md`.

**Skills** (`.kiro/skills/`, mô tả: mục 4 của `kiro-compat.md`):

- **Common:** `ck-debug`, `code-review`, `fix`, `sequential-thinking`, `problem-solving`, `git`
- **Utility:** `brainstorm`, `ask`, `docs`, `docs-seeker`, `bootstrap`
- **BE-specific:** `backend-development`, `databases`

**IMPORTANT:** Analyze and activate relevant skills before proceeding with each task.

Truy cập file bí mật (`.env`, key, service account…): theo mục 7 của `kiro-compat.md`.
