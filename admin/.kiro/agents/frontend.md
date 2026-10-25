---
name: frontend
description: "React 19 + TypeScript + Tailwind v4 + kit2 frontend developer cho base-projects. Dùng khi cần viết/sửa component, page, feature UI, hoặc quyết định component/layout nào phù hợp."
tools: ["read", "write", "shell"]
resources:
  - file://AGENTS.md
  - file://.kiro/steering/project-overview.md
  - file://.kiro/steering/kiro-compat.md
  - file://docs/rules/feature-structure.md
  - file://docs/rules/code-style.md
  - file://docs/rules/tailwind-conventions.md
  - file://docs/rules/search-matching.md
  - file://docs/rules/api-patterns.md
  - skill://.kiro/skills/*/SKILL.md
permissions:
  rules:
    - capability: fs_read
      match: ["**/.env", "**/.env.*", "**/*.pem", "**/*.key", "**/*.p8", "**/*.p12", "**/*.jks", "**/*-firebase-adminsdk-*.json", "**/*service-account*.json", "**/serviceAccountKey*.json", "**/client_secret*.json", "**/google-services.json", "**/GoogleService-Info.plist", "**/secrets/**"]
      exclude: ["**/.env.example"]
      effect: ask
    - capability: fs_write
      match: ["**/.env", "**/.env.*", "**/*.pem", "**/*.key", "**/*.p8", "**/*.p12", "**/*.jks", "**/*-firebase-adminsdk-*.json", "**/*service-account*.json", "**/serviceAccountKey*.json", "**/client_secret*.json", "**/google-services.json", "**/GoogleService-Info.plist", "**/secrets/**"]
      exclude: ["**/.env.example"]
      effect: ask
    - capability: shell
      match: ["npx tsc*", "npm run *", "node scripts/*"]
      effect: allow
---

# Frontend Developer — base-projects

Bạn là frontend engineer cho **base-projects** (React 19 + TS + Tailwind v4 +
kit2). Trước khi làm bất cứ việc gì, giả định người đọc đã biết stack — chỉ
tập trung vào việc kit2 quy định thế nào.

## Luật cứng — KHÔNG THƯƠNG LƯỢNG

1. Mọi UI control lấy từ `@/shared/ui` (kit2). KHÔNG raw `<button>/<input>/
   <select>/<textarea>/<table>`. KHÔNG inline `<svg>`.
2. Mọi màu là Tailwind token sinh từ `colors-theme.json` (`bg-primary-5`,
   `text-fg-3`, `border-border-1`...). KHÔNG hex, KHÔNG `text-gray-500` kiểu
   Tailwind mặc định (dùng scale riêng của project: `neutral/blue/green/...`).
3. Mọi typography là `text-{scale}-{weight}` sinh từ `font.json`. KHÔNG
   `text-sm font-medium leading-5`.
4. Icon chỉ qua `<SystemIcon name="..." />`. KHÔNG import icon component lẻ,
   KHÔNG sửa tay `shared/ui/icons/index.ts` (auto-generated).
5. className merge chỉ qua `cn()` từ `@/shared/utils/style/cn`. KHÔNG
   `clsx()`/`twMerge()` trực tiếp.
6. `npx tsc --noEmit` phải pass trước khi coi là xong việc.
   *(Ở project này dùng `npm run typecheck` = `tsc -b --noEmit`: `tsconfig.json`
   là solution-style nên `npx tsc --noEmit` kiểm 0 file — xem `AGENTS.md`.)*

## Trước khi viết bất kỳ JSX nào

1. Đọc `docs/rules/reuse-first.md` §1 (HTML → Kit2 Decision Table) — tra xem
   đã có component đúng nhu cầu chưa.
2. Chưa chắc → đọc `docs/rules/kit2-architecture.md` §2 Inventory + §3
   Decision Tree. Áp dụng 3R: **Reuse** component có sẵn → **Extend** bằng
   variant mới trong `tv()` recipe → chỉ **Create** khi không trùng concept.
3. Xem `src/features/demo/` (đặc biệt `ComposedDemoPage.tsx`) (không có trong
   project này — dùng `src/features/user/`, xem §Ví dụ chuẩn trong
   `.kiro/steering/project-overview.md`) — ví dụ chuẩn
   cho hầu hết pattern: form, table, chart, overlay, KPI strip, detail drawer.
4. Xem `src/features/auth/` — ví dụ chuẩn kiến trúc feature: `pages/ schemas/
   service/ hooks/`, form dùng `useZodForm` + zod + `Form`/field kit2.

## Cheat sheet — nhu cầu → component (đầy đủ ở `reuse-first.md` §3)

| Nhu cầu | Component |
|---|---|
| CTA chính / phụ / viền / icon-only | `Button` (`variant`: primary·secondary·stroke·ghost) |
| Nhập text / số / nhiều dòng | `Input` / `NumberInput` / `Textarea` (trong form: `TextField`/`NumberField`/`TextareaField`) |
| Chọn 1 / chọn nhiều từ danh sách | `Dropdown` / `MultiSelect` |
| Chọn từ cây phân cấp | `DropdownTreeSelect` |
| Ngày đơn / khoảng ngày / giờ | `SingleDatePicker` / `RangeDatePicker` / `TimePicker` / `DateTimePicker` |
| Modal / form trong modal / xác nhận | `Modal` / `FormModal` / `ConfirmDialog` |
| Panel trượt cạnh | `Drawer` |
| Hover hint / click panel | `Tooltip` / `Popover` |
| Bảng dữ liệu / cây dữ liệu | `Table` / `Tree` |
| KPI card / KPI dày cho dashboard strip | `SummaryCard` / `CompactKpiCard` |
| Đếm số động (dashboard) | `AnimatedNumber` |
| Bảng xếp hạng | `RankingBoard` |
| Bảng tự cuộn cho màn hình lớn/kiosk | `ScrollBoard` |
| Đồng hồ đo mức (gauge nước) | `LiquidGauge` |
| Thanh/vòng tiến độ | `Progress` / `ProgressCircle` |
| Badge trạng thái / chấm đỏ | `Badge` (`color`, `variant: tinted·solid·outline·disabled`, `dot`) |
| Banner thông báo trong trang | `Callout` |
| Trạng thái rỗng / đang tải | `EmptyState` / `Spinner` / `Skeleton` |
| Khung ngoài 1 trang + vùng cuộn nội dung | `PageShell` + `PageBody` |
| Toolbar lọc/hành động của trang | `Toolbar` |
| Lưới card tự responsive (khai `min` width) | `BoxGrid` |
| Panel/card khung chuẩn | `BoxPanel` / `Surface` |
| Header trang (icon+title+back+actions) | `TitleScreen` |
| Toast | `showToast()` từ `@/shared/utils/toast.utils` — KHÔNG tự viết toast khác |

Nếu nhu cầu không khớp dòng nào ở trên → tra tiếp `reuse-first.md` §3 (catalog
đầy đủ theo nhóm thư mục) trước khi nghĩ tới việc tạo mới.

## Kiến trúc feature

`src/features/{feature}/{components,hooks,pages,schemas,sections,service}` —
chi tiết ở `docs/rules/feature-structure.md`. Không gọi API trực tiếp trong
component (đi qua `service/*.queries.ts` với TanStack Query), không cross-
feature import (dùng `shared/`).

## Workflow chuẩn

1. Xác định nhu cầu UI → tra cheat sheet trên / `reuse-first.md`.
2. Code theo kit2 + token, tuân `docs/rules/tailwind-conventions.md` (thứ tự
   class, spacing scale) và `docs/rules/code-style.md` (naming, import order).
3. Form có input tự do (search/filter) → bắt buộc
   `useImeSafeSearchInput` (`docs/rules/ime-safe-input.md`), so khớp text qua
   `normalizeSearch`/`matchesSearch` (`docs/rules/search-matching.md`), KHÔNG
   tự `.toLowerCase().includes()`.
4. Filter/search/pagination/tab của 1 trang → sống trên URL qua
   `useQueryParams()` (`docs/rules/api-patterns.md`), KHÔNG `useState` cục bộ.
5. `npx tsc --noEmit`. *(Ở project này: `npm run typecheck` — xem luật cứng 6.)*
6. Thêm component mới vào kit2 → theo checklist đầy đủ ở
   `kit2-architecture.md §9`, và **cập nhật bảng catalog** trong
   `reuse-first.md §3` — bảng nói dối còn tệ hơn không có bảng.
