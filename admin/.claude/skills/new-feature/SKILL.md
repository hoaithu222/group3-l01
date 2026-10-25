---
name: new-feature
description: Scaffold 1 phân hệ/feature mới trong base-projects — folder feature + đăng ký route qua module registry. Dùng khi bắt đầu 1 tính năng/màn hình mới từ đầu (không phải sửa cái có sẵn).
---

# New Feature — quy trình dựng 1 phân hệ mới

Nối 2 rule đã có (`docs/rules/feature-structure.md` + `docs/rules/routing-
conventions.md`) thành 1 quy trình liền mạch. Đọc 2 file đó khi cần chi tiết
— skill này chỉ là thứ tự thao tác.

## Bước 1 — Tạo cấu trúc thư mục feature

```
src/features/{feature-id}/
  pages/      # 1 page = 1 route
  components/ # composite tái dùng nội bộ feature (nếu cần)
  hooks/      # + index.ts re-export
  schemas/    # zod schema (nếu có form)
  service/    # TanStack Query hooks, gọi core/api (nếu có API thật)
```

Không cần tạo cả 5 thư mục ngay — chỉ tạo cái đang dùng, thêm dần. `kebab-
case` cho `{feature-id}`, khớp `id` sẽ khai ở bước 2.

## Bước 2 — Khai `ModuleConfig`

Tạo `src/app/router/modules/{feature-id}.routes.tsx`:

```tsx
import type { ModuleConfig } from './types';

export const {featureId}Module: ModuleConfig = {
  id: '{feature-id}',
  path: '/{feature-id}',
  title: '...',           // ngắn, hiện ở menu/breadcrumb
  subtitle: '...',        // 1 dòng, hiện ở lưới thẻ /modules
  iconName: '...-outline',
  color: 'blue',           // xem ModuleColor trong types.ts
  order: 20,
  page: { lazy: () => import('@/features/{feature-id}/pages/{Feature}Page') },
};
```

Chưa có page thật → `page: { lazy: placeholderPage }` (từ `module-
defaults.ts`), KHÔNG bỏ qua bước đăng ký — giữ chỗ trong menu.

## Bước 3 — Đăng ký vào registry

Thêm 1 dòng vào `MODULE_REGISTRY` trong `src/app/router/modules/module-
registry.ts`. Route, Dock, breadcrumb, `PermissionGuard` tự đồng bộ — KHÔNG
sửa file nào khác.

## Bước 4 — Trang có form?

```tsx
const form = useZodForm(mySchema);
```

Zod schema ở `schemas/{feature}.schema.ts`, luôn `.trim().min(1)` cho field
text bắt buộc (`docs/rules/form-validation.md`). Ghép `<Form>`/`<FormItem>`/
field component kit2 — không raw `<input>` (`docs/rules/reuse-first.md`).

## Bước 5 — Trang có gọi API?

`service/{feature}.queries.ts` — TanStack Query hook, query key gồm mọi
param phụ thuộc (`docs/rules/api-patterns.md`). Filter/search/pagination
sống trên URL qua `useQueryParams()`, KHÔNG `useState`.

## Bước 6 — Chọn component UI

Dùng skill `kit2-component-picker` cho từng khối UI — không tự vẽ bằng
`<div>` thô khi đã có component kit2 đúng concept.

## Bước 7 — Verify

```bash
npx tsc --noEmit
npm run lint
```

Vào thẳng URL `/{feature-id}` trên `npm run dev` — xác nhận route/menu/
breadcrumb hiện đúng (không chỉ tin registry đã khai đúng, chạy thật để
thấy).

## Ví dụ tham chiếu trong repo

`src/features/demo/` + `src/app/router/modules/demo.routes.tsx` — bản mẫu
sống, đọc trực tiếp khi cần ví dụ cụ thể hơn phần trên.
