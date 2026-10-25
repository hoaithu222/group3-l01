# Hướng dẫn và Quy tắc cho Antigravity (Gemini) — Super App Admin (Web)

Tài liệu này áp dụng cho toàn bộ thư mục `admin/` trong Super App.
Đường dẫn bên dưới tính từ thư mục `admin/`. Tham khảo thêm `../GEMINI.md` cho các quy tắc toàn repository.

---

## 1. Bản chất & Phạm vi của Admin

- Admin là **trang web quản trị và vận hành nền tảng** (quản lý người dùng, workspace, kiểm duyệt, audit log, cấu hình hệ thống, đối tác O2O/nhà tuyển dụng, giám sát job AI...).
- **KHÔNG** dựng lại trải nghiệm người dùng cuối của ứng dụng di động (`../app`).
- Design system riêng của trang quản trị là **kit2** (đặt tại `src/shared/ui/`) đã được hoàn thiện — **BẮT BUỘC ĐỌC VÀ TÁI SỬ DỤNG**, không tự tiện tạo mới.

---

## 2. Tech Stack

| Tầng | Công nghệ | Lưu ý quan trọng |
| :--- | :--- | :--- |
| **Framework** | React 19 + TypeScript + Vite 8 | Strict mode, tsconfig dạng solution-style |
| **Styling** | Tailwind CSS v4 (CSS-first `@theme`) | **KHÔNG CÓ `tailwind.config.js`** |
| **Component Variant** | `tailwind-variants` (`tv()`) | Phối hợp với `cn()` |
| **UI Primitives** | Radix UI | Dialog, Select, Popover, Tabs, Switch, Avatar, Toast... |
| **Form & Validation** | React Hook Form + Zod **v4** | Zod ở admin là **v4** (ở `../be` là **v3**) |
| **Server State** | TanStack Query v5 | Cache, invalidate queries, mutations |
| **Client State** | Zustand v5 | Không persist token |
| **Routing** | React Router v7 | Module Registry tại `src/app/router/modules/` |
| **Charts** | Recharts v3 | Tích hợp qua `@/shared/charts` |
| **Kéo thả / Ngày giờ** | dnd-kit / dayjs | Tiêu chuẩn thống nhất |
| **Test** | Vitest + Testing Library (jsdom) | Chạy qua `npm run test` |

---

## 3. LUẬT VÀNG — KHÔNG THƯƠNG LƯỢNG (kit2 & UI)

**`@/shared/ui` ("kit2") là nguồn DUY NHẤT cho mọi UI.**
Trước khi viết bất kỳ file `.tsx` nào, bắt buộc đọc `docs/rules/reuse-first.md` (bảng "HTML → Kit2") và `docs/rules/kit2-architecture.md` (decision tree + nguyên tắc 3R):

```
1. REUSE   → Đã có component trong kit2? DÙNG LẠI NGAY.
2. EXTEND  → Gần giống nhưng thiếu prop/variant? Thêm key vào tv() recipe.
3. CREATE  → CHỈ tạo mới khi không trùng concept với bất kỳ component nào trong kit2.
```

### CẤM TUYỆT ĐỐI:
1. **Raw HTML controls**: Cấm viết `<button>`, `<input>`, `<select>`, `<table>`. Phải dùng component tương ứng từ `@/shared/ui`.
2. **Inline `<svg>`**: Cấm viết inline SVG; luôn dùng `<SystemIcon name="..." />` (`docs/rules/icon-conventions.md`).
3. **Hex màu trong `className` hoặc `style`**: Cấm `#fff`, `text-[#333]`, `bg-[#... ]`. Chỉ dùng token từ `src/styles/theme/colors-theme.json` (`docs/rules/color-system.md`).
   - *Ngoại lệ duy nhất cho hex*: Dữ liệu màu do người dùng chọn (`ColorPickerField`, `ColorPalettePanel`), Canvas 2D (`ctx.fillStyle`), và scrim cố ý không lật theo theme.
4. **Raw Tailwind font**: Cấm `text-sm font-medium`. Chỉ dùng các class semantic typography `text-{scale}-{weight}` theo `docs/rules/font-system.md`.
5. **Import sâu**: Cấm `import ... from '@/shared/ui/actions/Button'`. Luôn import qua barrel public: `import { Button } from '@/shared/ui'`.
6. **Thư viện style trực tiếp**: Cấm gọi trực tiếp `clsx()` hay `twMerge()`. Luôn dùng helper `cn()`.
7. **Tự viết hook disclosure**: Cấm tự viết `useToggle`/`useModal`. Luôn dùng `useDisclosure`.

---

## 4. Mandatory Pre-code Checklist

Trước khi code bất kỳ tính năng UI nào:
1. **Tìm UI**: Tra cứu `docs/rules/reuse-first.md` (Decision Table & Catalog).
2. **Quyết định vị trí**: Nếu phải tạo mới, theo decision tree của `docs/rules/kit2-architecture.md`.
3. **Màu sắc**: CHỈ dùng token từ `colors-theme.json` (`docs/rules/color-system.md`).
4. **Typography**: CHỈ dùng `text-{scale}-{weight}` (`docs/rules/font-system.md`).
5. **Icon**: CHỈ dùng `<SystemIcon name="..." />` (`docs/rules/icon-conventions.md`).
6. **ClassName**: Ghép nối duy nhất qua hàm `cn()`.
7. **Form Validation**: Mọi trường chuỗi bắt buộc trên Zod schema LUÔN dùng `.trim().min(1)`, **CẤM** dùng `.min(1)` một mình (`docs/rules/form-validation.md`).
8. **Tìm kiếm & Nhập liệu**:
   - Ô tìm kiếm / input tự do: Bắt buộc dùng `useImeSafeSearchInput` để không nuốt dấu tiếng Việt (`docs/rules/ime-safe-input.md`).
   - So khớp text: Bắt buộc dùng `normalizeSearch()` hoặc `matchesSearch()`, không tự viết `.toLowerCase().includes()` (`docs/rules/search-matching.md`).
9. **Điều hướng**: Mọi control có URL đích phải là `<Link>`, không dùng `<button onClick={navigate}>` (`docs/rules/navigable-controls.md`).

---

## 5. Cấu hình Super App & Hợp đồng API với Backend

### Biến môi trường & Proxy
- `VITE_API_BASE_URL = '/api/v1'`: Backend mount API nghiệp vụ tại `/api/v1/*`.
- `VITE_API_PROXY_TARGET = 'http://localhost:3000'`: Proxy same-origin để cookie HttpOnly hoạt động thông suốt.
- `VITE_AUTH_ENABLED = 'true'`: Xác thực thật.
- `API_PREFIX = ''` (`src/core/api/auth/auth.api.ts`): Tiền tố version đã nằm trong `VITE_API_BASE_URL`, không khai `/v1` hai lần.

### Hợp đồng Auth & API với `../be`
- **Phiên đăng nhập & Refresh Token**:
  - Refresh token lưu trong cookie `HttpOnly` do backend cấp và quản lý.
  - **CẤM persist access token vào `localStorage`** (`auth.store.ts` cố ý loại `token` khỏi `partialize`).
  - Refresh endpoint: `POST /auth/refresh` trả `{ accessToken, user }`.
  - Profile endpoint: `GET /auth/me`.
  - Khi refresh thất bại: **KHÔNG gộp lỗi mất mạng (`unavailable`) với hết hạn phiên (`unauthenticated`)**. Mất mạng không được xóa phiên của người dùng (`src/core/api/session.ts`).
- **Phân quyền**:
  - `user.roles: string[]`, `user.permissions: string[]` theo định dạng `resource:action` (vd: `users:view`).
  - Role `admin` là super-role, tự động vượt qua mọi kiểm tra permission.
- **Envelope API & Xử lý lỗi**:
  - Thành công: `{ success: true, data: T, message?: string, meta?: PaginationMeta }`.
  - Phân trang: `meta { page, limit, total, totalPages, hasNext, hasPrev }` khớp `PaginationMeta`.
  - Lỗi: `{ success: false, error: { code, message, details }, requestId }` khớp `core/api/error.handler.ts`.

---

## 6. Thêm phân hệ Admin mới (Routing & Architecture)

- Tuân thủ `docs/rules/routing-conventions.md` và `docs/rules/feature-structure.md`:
  - 1 file route module: `src/app/router/modules/{id}.routes.tsx`.
  - 1 dòng đăng ký trong `src/app/router/modules/module-registry.ts`.
  - `id` chính là resource khi kiểm tra quyền (`{id}:view`).
- **Feature Gate & Audience**:
  - Lọc theo quyền qua `resolveAudience()` trong `useAccessibleModules.ts`.
  - Bật/tắt tính năng theo cờ backend (`capabilities.features.<flag>`). Tắt cờ thì ẩn khỏi menu và trả `FeatureDisabledPage` qua `FeatureGate`.
- **Tránh Circular Dependency**:
  - `PlaceholderPage` và trang chuyển hướng `UserDetailPage` phải đọc route handle qua `useMatches()`, **KHÔNG** import trực tiếp `module-registry.ts` vì registry đang lazy-load chính các trang đó.
- **Hạ tầng Socket & Capabilities**:
  - Socket.IO client dùng chung tại `src/core/socket/` (`socket`, `connectSocket`, `disconnectSocket`, `useSocketEvent`). Vòng đời kết nối nằm tại `src/app/providers/SocketProvider.tsx`, **KHÔNG** đặt trong layout.
  - Capabilities (`GET /capabilities`, cache 5 phút): service thuần ở `src/core/capabilities/`, hook UI ở `src/app/capabilities/`.

---

## 7. Pipeline Design Tokens

| Loại token | File nguồn (sửa tay) | Lệnh sinh lại mã (chạy tự động) |
| :--- | :--- | :--- |
| **Màu sắc** | `src/styles/theme/colors-theme.json` | `npm run generate:colors` |
| **Typography** | `src/styles/font/font.json` | `npm run generate:font` |
| **Icon SVG** | `src/assets/icons/*.svg` | `npm run generate:icons` |
| **Ảnh hệ thống** | `src/assets/image/*` | `npm run generate:images` |

⛔ **CẤM BAO GIỜ** sửa tay các file sinh tự động (`generated-colors.css`, `generated-font.css`, `shared/ui/icons/index.ts`, `colors.generated.ts`).

---

## 8. ⛔ Bảy điều KHÔNG ĐƯỢC LÀM

1. **KHÔNG persist access token vào `localStorage`** (tránh XSS lấy cắp token).
2. **KHÔNG gộp `unavailable` với `unauthenticated`** khi refresh session (mất mạng ≠ hết phiên).
3. **KHÔNG dùng `npx tsc --noEmit`** (tsconfig là solution-style, lệnh này kiểm tra 0 file; bắt buộc dùng `npm run typecheck` tức `tsc -b --noEmit`).
4. **KHÔNG khai `PATHS` mà không mount route tương ứng** (test `tests/app-routes.test.tsx` sẽ báo lỗi).
5. **KHÔNG import sâu** `@/shared/ui/actions/Button` — luôn qua barrel public `@/shared/ui`.
6. **KHÔNG đặt secret** trong biến `VITE_*` (mọi biến `VITE_*` đều lộ trong client bundle).
7. **KHÔNG tạo component bản sao kiểu `XxxV2.tsx`**; nâng cấp trực tiếp component hoặc mở rộng qua variant.

---

## 9. Lệnh kiểm tra trước khi hoàn thành

Sau khi chỉnh sửa mã hoặc cấu hình trong `admin/`:
```bash
npm run check
```
Lệnh này chạy toàn bộ chuỗi: `typecheck` (`tsc -b --noEmit`) → `lint` → kiểm tra import → kiểm tra vòng lặp phụ thuộc (circular) → kiểm tra file mồ côi (orphans) → `vitest run`.
Tất cả các bước phải có kết quả xanh sạch trước khi kết thúc tác vụ.
