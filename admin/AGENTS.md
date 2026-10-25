# Hướng dẫn cho AI agent — Super App Admin (web)

Đọc `README.md` trước. File này chỉ nêu những gì hay bị làm sai.

## Phạm vi trong Super App

File này áp dụng cho `super-app/admin/`; đường dẫn bên dưới tính từ thư mục
này. Đọc thêm `../GEMINI.md` hoặc `../AGENTS.md` cho quy tắc toàn repo.
Antigravity (Gemini) đọc `GEMINI.md` hoặc file này; Codex đọc trực tiếp file
này; Claude dùng `.claude/CLAUDE.md`. Bộ quy tắc kỹ thuật dùng chung nằm ở
`docs/rules/` (28 file) và skill ở `.claude/skills/`; agent mở chúng như tài
liệu theo chỉ dẫn, không giả định đã được đăng ký tự động.

Admin là **trang vận hành nền tảng** (người dùng, workspace, kiểm duyệt,
audit, cấu hình hệ thống, đối tác O2O/nhà tuyển dụng, giám sát job AI…),
không dựng lại trải nghiệm người dùng cuối của `../app`. Phạm vi từng phân hệ
xem `../docs/development-plan.md`.

## Trước khi sửa

1. Đọc quy tắc tương ứng trong `docs/rules/` (bảng đầy đủ ở `.claude/CLAUDE.md`):

| Sắp sửa gì | Đọc |
| --- | --- |
| Bất kỳ JSX nào | `reuse-first.md` · `kit2-architecture.md` |
| Màu · chữ · icon | `color-system.md` · `font-system.md` · `icon-conventions.md` |
| Bố cục, mật độ | `visual-hierarchy.md` |
| Gọi API, lọc trên URL | `api-patterns.md` |
| Form, kiểm dữ liệu | `form-validation.md` |
| Ô tìm kiếm | `ime-safe-input.md` · `search-matching.md` |
| Thêm phân hệ (route) | `routing-conventions.md` · `feature-structure.md` |
| Zustand / React Query | `state-management.md` |
| Chart | `chart-conventions.md` |
| Trước khi ship | `test-viewpoint.md` |

2. Ưu tiên tái sử dụng `@/shared/ui` (kit2). Không viết raw `<button>/<input>`,
   không hex màu, không `text-sm font-medium`, không sửa file `*.generated.*`.
3. Sau khi sửa mã/cấu hình: `npm run check` phải sạch (typecheck → lint →
   kiểm import → kiểm vòng → orphans → test). Với thay đổi chỉ Markdown, kiểm
   tra đường dẫn và `git diff --check` theo `../AGENTS.md`.

## Tech stack

| Tầng | Công nghệ |
| --- | --- |
| Nền | React 19 · TypeScript 5.9 (⛔ chưa lên TS 7, xem README) · Vite 8 |
| Style | Tailwind CSS 4 (CSS-first `@theme`) + `tailwind-variants` |
| UI | kit2 (`src/shared/ui`) trên Radix UI |
| Dữ liệu server | TanStack React Query 5 · Axios (`@/core/api`) |
| State client | Zustand 5 |
| Form | React Hook Form + Zod 4 |
| Route | React Router 7 + Module Registry (`src/app/router/modules/`) |
| Test | Vitest + Testing Library (jsdom) |

## Cấu hình riêng của Super App

| Khoá | Giá trị | Vì sao |
| --- | --- | --- |
| `VITE_API_BASE_URL` | `/api/v1` | BE mount nghiệp vụ tại `/api/v1/*`; `/api/health` không versioned |
| `VITE_API_PROXY_TARGET` | `http://localhost:3000` | `be/.env` PORT=3000; đi same-origin để cookie HttpOnly hoạt động |
| `VITE_AUTH_ENABLED` | `true` | Dự án thật; base để `false` chỉ để demo không cần BE |
| `API_PREFIX` (`src/core/api/auth/auth.api.ts`) | `''` | Version đã nằm trong `VITE_API_BASE_URL`; đừng khai `/v1` hai lần |

Zod ở admin là **v4**, ở `../be` là **v3** — không chép schema chéo giữa hai
package; đối chiếu bằng tay theo DTO.

## Hợp đồng auth với `../be` (đã khớp — đối chiếu mã 2026-09-21)

| Client (admin và `../app`) | BE hiện tại | Trạng thái |
| --- | --- | --- |
| `POST /auth/refresh` — web gửi cookie HttpOnly | `POST /auth/refresh` (alias `/auth/refresh-token`) | Khớp |
| `GET /auth/me` | `GET /auth/me` (alias `/auth/profile`) | Khớp |
| `user.roles: string[]`, `user.permissions: string[]` ("resource:action") | `AuthUserDto`: `role`, `roles[]`, `permissions[]` (`be/src/modules/auth/dtos/auth-user.dto.ts`) | Khớp |
| Refresh trả cả `user` | ✅ trả `{ accessToken, user }` | Khớp |
| Lỗi `{ success:false, error:{code,message,details}, requestId }` | ✅ | Khớp — `core/api/error.handler.ts` đọc đúng dạng này |
| Phân trang `meta { page, limit, total, totalPages, hasNext, hasPrev }` | ✅ | Khớp `shared/types` `PaginationMeta` |

⛔ Không "chữa" lệch hợp đồng bằng adapter trong `src/core/api` của admin:
`../app` dùng cùng hợp đồng, sửa một chỗ ở BE là đủ. Chỉ khi BE quyết định
đổi tên khác, sửa `AUTH_REFRESH_PATH` (`src/core/config/auth.config.ts`) và
`authApi` (`src/core/api/auth/auth.api.ts`) — **cả hai** cùng lúc.

**Kiểu response của các phân hệ nghiệp vụ hiện viết tay** theo BE thật (`openapi.json` sinh kiểu chưa có — p0-09;
script `gen:api-types` đã khai nhưng `src/core/api/generated/` chưa có đầu ra). Mỗi `features/*/types/*.ts` ghi
route/DTO BE nó khớp; đổi contract ở BE thì đối chiếu lại các file đó. Khi `openapi.json` có, thay dần bằng kiểu
sinh (`npm run gen:api-types`), đừng viết thêm DTO response bằng tay.

## Thêm phân hệ admin

Theo `docs/rules/routing-conventions.md`: 1 file `src/app/router/modules/{id}.routes.tsx`
+ 1 dòng trong `module-registry.ts`. `id` cũng là `resource` khi kiểm quyền
(`{id}:view`). Danh sách resource dự kiến và thứ tự dựng: `../docs/development-plan.md`.
Vai trò hệ thống `admin` vượt mọi kiểm quyền chi tiết (`SUPER_ROLE` trong
`src/app/store/slices/auth/auth.store.ts`).

`ModuleConfig` (Phase 0) có thêm `audience` (`'ops' | 'recruiter' | 'partner'`
— lọc menu theo vai đăng nhập, suy từ `permissions[]` qua `resolveAudience()`
trong `useAccessibleModules.ts`) và `featureFlag` (tên cờ trong
`capabilities.features`, hoặc MẢNG tên cờ = hiện khi BẤT KỲ cờ nào bật — tắt thì `useAccessibleModules` ẩn khỏi menu VÀ route
trả `FeatureDisabledPage` qua `FeatureGate`, xem `app/router/modules/FeatureGate.tsx`).
Trang chưa có UI thật (`PlaceholderPage`) và trang redirect deep-link
(`UserDetailPage`) đọc route `handle` qua `useMatches()` thay vì import thẳng
`module-registry.ts` — import ngược sẽ khép vòng vì registry lazy-load chính
các trang đó (`RouteHandle` trong `app/router/modules/types.ts`).

Socket.IO client dùng chung ở `src/core/socket/` (`socket`, `connectSocket`,
`disconnectSocket`, `useSocketEvent`) — vòng đời nối/ngắt theo trạng thái đăng
nhập nằm ở `src/app/providers/SocketProvider.tsx`, KHÔNG đặt trong layout.
Capabilities (`GET /capabilities`, cache 5 phút) tách hai tầng: service thuần
ở `src/core/capabilities/`, hook `useCapabilities()`/`useFeature()` ở
`src/app/capabilities/` (chạm `useAuthStore` nên không đặt trong `core`).

## ⛔ Những điều KHÔNG được làm

1. **KHÔNG persist access token** vào localStorage — `auth.store.ts` cố ý loại
   `token` khỏi `partialize`; refresh token ở cookie HttpOnly do BE đặt.
2. **KHÔNG gộp `unavailable` với `unauthenticated`** khi refresh
   (`src/core/api/session.ts`) — mất mạng ≠ phiên chết.
3. **KHÔNG dùng `npx tsc --noEmit`** — `tsconfig.json` là solution-style,
   lệnh đó kiểm 0 file. Dùng `npm run typecheck` (`tsc -b --noEmit`).
4. **KHÔNG khai `PATHS` mà không mount route** — `tests/app-routes.test.tsx` sẽ đỏ.
5. **KHÔNG import sâu** `@/shared/ui/actions/Button` — luôn qua barrel `@/shared/ui`.
6. **KHÔNG đặt secret** trong biến `VITE_*` — mọi thứ nằm trong bundle.
