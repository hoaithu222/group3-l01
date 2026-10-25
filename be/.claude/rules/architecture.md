# Architecture Rules (BẮT BUỘC)

## 3-Layer Architecture

```
src/
├── core/                  # CORE — Reusable utilities (KHÔNG chứa business logic)
│   ├── config/            # Environment schema (Zod), app config
│   ├── constants/         # HTTP status codes, roles, enums
│   ├── exceptions/        # AppError hierarchy
│   ├── middlewares/        # Global middlewares (auth, validate, errorHandler, rateLimiter, upload)
│   ├── types/             # Express type augmentations
│   └── utils/             # catchAsync, ResponseUtils, JwtUtils, error codes
│
├── infrastructure/        # INFRASTRUCTURE — External integrations
│   ├── database/          # Prisma client singleton (MongoDB Atlas) + connect/disconnect
│   ├── redis/             # Redis client singleton
│   ├── logger/            # Winston logger + createContextLogger
│   ├── mail/              # Nodemailer service + templates
│   ├── storage/           # Local + S3 + Cloudinary storage abstraction (STORAGE_TYPE)
│   └── socket/            # Socket.IO server
│
└── modules/               # MODULES — Business features (self-contained)
    └── {module-name}/
        ├── {module}.routes.ts                # Route definitions + DI wiring
        ├── controllers/{module}.controller.ts # Controller factory
        ├── services/{module}.service.ts       # Business logic
        ├── repositories/
        │   ├── {module}.repository.interface.ts  # Repository interface
        │   ├── {module}.repository.prisma.ts     # Prisma implementation
        │   └── {module}.repository.inmemory.ts   # Test implementation
        ├── entities/{module}.interface.ts      # Entity interfaces
        ├── dtos/
        │   ├── create-{module}.dto.ts         # Zod create schema
        │   ├── update-{module}.dto.ts         # Zod update schema
        │   └── index.ts                       # Re-export schemas
        └── tests/                             # Unit + integration tests
```

## Dependency Flow (CRITICAL)

```
Routes → Controller → Service → Repository → Database
                                    ↓
                              Infrastructure (Redis, Mail, Storage, etc.)
```

**Direction BẮT BUỘC:**
- `modules/` → CÓ THỂ import từ `core/` và `infrastructure/`
- `infrastructure/` → CÓ THỂ import từ `core/`
- `core/` → KHÔNG import từ `modules/` hay `infrastructure/`
- `modules/` → KHÔNG import từ module khác (dùng shared service hoặc events)

## Module Structure khi tạo mới

Dùng generator:
```bash
npm run gen:module -- <moduleName> [field1:type field2:type ...]
```

Hoặc tạo thủ công theo cấu trúc trên.

### Pattern "Flat" — ngoại lệ hợp lệ cho module đơn giản

Pattern Full ở trên là mặc định cho module có domain model riêng cần CRUD đầy
đủ. Với module rất đơn giản, ít business rule, ít khả năng cần swap
implementation (ví dụ: một module chỉ ghi log, chỉ đọc cấu hình tĩnh), được
phép dùng file phẳng ngay dưới module (`{x}.routes.ts`, `{x}.controller.ts`,
`{x}.service.ts`, `{x}.repo.ts`, `{x}.validators.ts`) thay vì tách
`repositories/{x}.repository.interface.ts` + `.prisma.ts`. Đây là lựa chọn có
chủ đích, không phải vi phạm rule — nhưng module có domain model riêng (như
`auth`, `users`) vẫn PHẢI theo pattern Full.

## Shared module services (ngoại lệ có chủ đích)

Luật "modules KHÔNG import module khác" ở trên có 2 ngoại lệ đã xác nhận —
dịch vụ dùng chung, export qua 1 barrel công khai của module sở hữu:

| Module sở hữu | Barrel | Dịch vụ | Dùng bởi |
| --- | --- | --- | --- |
| `audit-log` | `services/audit-log.service.ts` (import trực tiếp, chưa có `public.ts` riêng) | `AuditService.record()` | `users`, `admin-jobs`, `system-config` (p0-07, qua interface `AuditRecorder` structural typing tại nơi gọi) |
| `assets` (p0-05) | `@modules/assets/public` | `AssetLinkService` (attach/detach/replace/detachAll), `AssetAccessService` (canRead/assertRead) | Module Phase 1+ cần gắn/đọc asset (vd `messages`, `tasks`) — dùng `createAssetLinkService()`/`createAssetAccessService()` factory, tự `new` trong `{module}.routes.ts`, KHÔNG import file trong `assets/services/`/`assets/repositories/` trực tiếp |
| `devices` (p0-06) | `@modules/devices/public` | `DeviceService` (register/unregister/listActive/revokeTokens/getActiveFcmTokens/getActiveVoipTokens/hasActiveDevice) | `auth` (logout → `unregister(userId, deviceId)` qua port `DeviceUnregisterPort`), `notifications` (push pipeline tra token) — dùng `createDeviceService()` factory |
| `notifications` (p0-06) | `@modules/notifications/public` | `notify(tx, input)` (ghi Notification+Recipients+Outbox trong transaction), `registerNotificationType(def)` | Module Phase 1+ tạo thông báo (vd `messages`, `meetings`, `calls`) — KHÔNG tự ghi `Notification`/`NotificationRecipient`/gọi `getPushSender()` trực tiếp, luôn qua `notify()` |
| `messages` (p1-04) | `@modules/messages/public` | `registerMessageScope(scopeType, impl)` (registry `MessageScope` — RIÊNG của engine tin nhắn, khác `registerScopeResolver` của `core/permission`), `createSystemMessageService()` (factory `ISystemMessagePort.post()`) | `channels` (đăng ký adapter `CHANNEL` lúc `router.ts` gọi `registerChannelModule()`); tương lai `conversations` (p1-05, `CONVERSATION`), `calls`/`meetings`/`integrations` (Phase 2+, đăng tin hệ thống qua `ISystemMessagePort`) |
| `moderation` (p4-01) | `@modules/moderation/public` | `createReportPort()` → `ReportPort` (`submit` báo cáo idempotent, `closeOpenByTarget` đóng báo cáo mở khi ẩn nội dung); chiều ngược lại module sở hữu đích đăng ký `registerReportTargetExtension` qua `@shared/ports/report.port` | `study` (bộ học `STUDY_SET`); sau này portfolio/company/job-offer/mentor-post — KHÔNG import `moderation/services/*` trực tiếp |
| `calls` (p2-01/p2-03) | `@modules/calls` (`getCallsContainer()`) + 3 hàm/kiểu thuần (`callEvents`, `CallActiveConflictError`, `isConnectedLike`) | `CallsContainer` (`deps.store/repo/tokens/jobs`, `ends.endCall/leave/removeParticipant`, `rooms.leave`, `reconcile`) | `meetings` (p2-05) — CHỈ trong `modules/meetings/adapters/calls-room.adapter.ts` (+ `calls-room-enter.ts`), sau cổng `MeetingCallPort`; `pomodoro` (p5-02) — CHỈ trong `modules/pomodoro/adapters/calls-room.adapter.ts`, sau cổng `PomodoroCallPort` (`Call { CHANNEL, ROOM, hostId = chủ phiên }`); phần còn lại của hai module đó KHÔNG import `calls`. Không sửa lõi cuộc gọi |
| `users` (thêm thành viên theo SĐT/email) | `@modules/users/public` (kiểu ở `@shared/ports/user-contact-lookup.port`) | `createUserContactLookup()` → `UserContactLookupPort` (`findByContact` khớp CHÍNH XÁC email/SĐT đã chuẩn hoá, `findActiveUser`) | `members` (`MemberAddService` — `GET …/member-lookup`, `POST …/members`), `conversations` (`ConversationListService.people` tìm theo email/SĐT đầy đủ trong tập người chung nhóm) — KHÔNG tự query `User.email`/`User.phone` |
| `discovery` (p1-09 → p5-04) | `@modules/discovery/public` | `buildSnippet` / `buildDisplayText` (hàm THUẦN dựng snippet + highlight giữ dấu) | `workspace-search` (p5-04) — KHÔNG import `discovery/services/*` trực tiếp |
| `channels` (p5-04) | `@modules/channels` (`index.ts`) | `createChannelCreationPort()` → `ChannelCreationPort` (`create` qua `ChannelService.create`) | `workspace-templates` (áp mẫu tạo kênh) — kiểu ở `@shared/ports/channel-creation.port` |
| `workspace-templates` (p5-04) | `@modules/workspace-templates` (`index.ts`) | `createWorkspaceTemplatePort()` → `WorkspaceTemplatePort` (`plan`/`applyPlan`) | `workspaces` (tạo nhóm từ mẫu, nối ở `workspaces.routes.ts`) — kiểu ở `@shared/ports/workspace-template.port` |
| `study` (p4-01) | `@modules/study/public` | `gradeAnswer` (hàm chấm THUẦN), `createStudyContentReader()` (đọc bộ/mục đã kiểm `canView`), hằng loại mục | p5-01 live quiz, p7-02 coins (quyền nội dung); p4-02 (mock/SR) cùng module `study` nên dùng thẳng nội bộ |
| `contribution` (p4-06) | `@modules/contribution/public` (kiểu ở `@shared/ports/contribution-read.port`) | `createContributionReadPort()` → `ContributionReadPort` (`memberScore`/`careerScore` trên snapshot `ALL`, chỉ đọc) | p6-07 portfolio, p6-08 recruiter board — chỉ import KIỂU từ `shared/ports`, không import `contribution/services/*`. `contribution` nối vào `projects` CHỈ qua sink `registerTaskEventSink("p4-06.contribution")` (không sửa lõi) và GHI duy nhất `Board.contribution` |

## Entry Points

| File | Vai trò |
|------|---------|
| `server.ts` | Startup, connect DB/Redis, graceful shutdown |
| `app.ts` | Express factory, middleware order |
| `router.ts` | Route aggregation: `/api/health` + `/api/v1/*` |

## Quy tắc

1. **Mỗi module tự chứa** — routes, controller, service, repository, DTOs, tests
2. **DI qua factory functions** — KHÔNG dùng DI container, inject qua constructor
3. **Repository interface trước** — Service nhận interface, không concrete class
4. **Routes file wires DI** — Instantiate repo → service → controller trong routes file
5. **Lazy module import** — Route modules import trong `router.ts`
