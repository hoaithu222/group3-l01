# CLAUDE.md — Super App Backend (be)

Express.js backend base cho "Super App" (xem `docs/development-roadmap.md` và
`d:\work\super-app\docs\notes.md` cho tầm nhìn sản phẩm đầy đủ). Base hiện tại
chỉ có 2 module (`auth`, `users`) — nền tảng tối giản, chuẩn production, để
build tiếp các phân hệ trong `notes.md`.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Express.js + TypeScript strict |
| Database | MongoDB Atlas qua Prisma 5.8 (`datasource provider = "mongodb"`) — chỉ `prisma db push`, KHÔNG hỗ trợ `prisma migrate` |
| Cache | Redis |
| Storage | Cloudinary / AWS S3 / Local — chọn qua env `STORAGE_TYPE` (`src/infrastructure/storage`) |
| Realtime | Socket.IO |
| Auth | JWT (access + refresh tokens) |
| Testing | Jest |
| Container | Docker + docker-compose |

> ⚠️ Khi nâng cấp `prisma`/`@prisma/client`: Prisma ORM **v7 đã bỏ hỗ trợ MongoDB**.
> Chỉ nâng lên bản v6.x mới nhất, KHÔNG lên v7 trở lên.

## Workflows

- Primary: `.claude/rules/primary-workflow.md`
- Dev rules: `.claude/rules/development-rules.md`
- Orchestration: `.claude/rules/orchestration-protocol.md`

## Pre-flight Checks

1. Đọc file liên quan trước khi sửa
2. Kiểm tra existing middlewares/services trước khi tạo mới
3. Sau khi sửa: `npm run build` để check compile errors
4. Không tạo file mới nếu có thể sửa file hiện có

## Rules

- **KHÔNG** dùng `any` TypeScript — dùng `unknown`
- **LUÔN** validate input với middleware (zod)
- **LUÔN** handle async errors với `catchAsync`
- **KHÔNG** để business logic trong route handlers — chuyển vào services
- **LUÔN** sanitize user input, follow OWASP top 10

## Express Structure

Xem chi tiết đầy đủ ở `FOLDER_TREE.md`:

```
src/
├── core/                     # utils, exceptions, middlewares, config (Zod env schema)
├── infrastructure/           # database (Prisma+MongoDB), redis, storage (Local/S3/Cloudinary), socket, mail, logger
├── modules/{feature}/        # 1 module = 1 business feature (routes/controller/service/repo/dto)
└── app.ts / router.ts / server.ts
```

## Available Skills

**Common:** `ck-debug`, `code-review`, `fix`, `sequential-thinking`, `problem-solving`, `git`

**Utility:** `brainstorm`, `ask`, `docs`, `docs-seeker`, `bootstrap`, `backend-development`, `databases`

## Available Agents

`backend`, `code-reviewer`, `debugger`, `docs-manager`, `planner`, `researcher`, `tester`

## Hook Response Protocol

When blocked by `@@PRIVACY_PROMPT@@`, **MUST use `AskUserQuestion`** to get user approval.
