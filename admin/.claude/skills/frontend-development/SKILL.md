---
name: frontend-development
description: React 19 + TypeScript component/page patterns cho base-projects — cấu trúc component, lazy loading qua module registry, memoization, tổ chức file. Dùng khi viết component/hook mới hoặc page mới.
---

# Frontend Development Patterns — base-projects

Stack thật: React 19, TypeScript, React Router v7 (KHÔNG TanStack Router),
TanStack Query (KHÔNG SWR), kit2/Radix/tailwind-variants (KHÔNG MUI, KHÔNG
shadcn), react-hook-form + zod, Zustand. Pattern dưới đây chỉ áp cho stack
này — bỏ qua bất kỳ hướng dẫn nào ở nơi khác nói về MUI/TanStack Router.

## Cấu trúc 1 component chuẩn

```tsx
import { memo, useCallback, useMemo } from 'react';
import { cn } from '@/shared/utils/style/cn';

interface FooCardProps {
  title: string;
  onSelect?: (id: string) => void;
  className?: string;
}

export const FooCard = memo(function FooCard({ title, onSelect, className }: FooCardProps) {
  // 1. hooks (context → data fetching → local state → derived → effects)
  // 2. handler, useCallback nếu truyền xuống component đã memo
  const handleClick = useCallback(() => onSelect?.(title), [onSelect, title]);
  // 3. early return (loading/error/empty) — xem "Loading state" bên dưới
  // 4. render
  return <div className={cn('...', className)} onClick={handleClick} />;
});
```

Quy tắc: `memo`/`useCallback`/`useMemo` import **named** từ `react`, KHÔNG
`React.memo()`. KHÔNG `React.FC<Props>` — khai props inline. Named export +
`displayName` tự động từ `function FooCard()`. Chi tiết → `docs/rules/code-
style.md`, `docs/rules/clean-code-standards.md`.

## Lazy loading — qua module registry, KHÔNG tự `React.lazy()` mỗi page

base-projects đã có cơ chế lazy-load tập trung: `src/app/router/modules/
module-registry.ts` là nguồn khai báo DUY NHẤT cho mọi feature module (route,
guard, Dock entry, permission). `build-routes.tsx` tự biến registry thành
`RouteObject[]` và lazy-load page component **inline** (không phải top-level
`React.lazy()`, để hỗ trợ cả default lẫn named export).

**→ Thêm page mới KHÔNG cần viết `React.lazy(() => import(...))` tay** — chỉ
cần thêm 1 entry vào `module-registry.ts`. Chỉ dùng `React.lazy` thủ công cho
component NẶNG nằm trong 1 page (không phải cấp route) — ví dụ modal/drawer
hiếm khi mở, chart 3D, editor nặng.

## Loading state — Suspense + skeleton cùng layout, hạn chế early-return spinner

Early-return spinner thay hết layout (`if (isLoading) return <Spinner/>`) gây
layout shift khi data về. Ưu tiên:
1. Skeleton **giữ đúng khung layout** cuối cùng (`<Skeleton>` kit2 với đúng
   `width`/`height` dự kiến) thay vì 1 spinner ở giữa màn hình trống.
2. TanStack Query đã cache — dùng `isPending` (lần đầu, chưa có cache) khác
   `isFetching` (đang refetch nhưng đã có data cũ để hiển thị) — đừng che
   toàn bộ UI khi chỉ đang refetch nền.

## Data fetching — CHỈ qua TanStack Query, KHÔNG `useEffect` + `useState`

```tsx
// ❌ SAI
useEffect(() => { fetchFoo().then(setFoo); }, []);

// ✅ ĐÚNG — service/*.queries.ts, xem docs/rules/api-patterns.md
const { data, isPending } = useFooList(filters);
```

Query key PHẢI gồm mọi param phụ thuộc (`[FOO_KEY, filters]`) để refetch đúng
lúc filter đổi. `enabled: !!id` cho query có điều kiện. Invalidate query liên
quan trong `onSuccess` của mutation.

## Memoization — có chủ đích, không phản xạ

Chi tiết đầy đủ → `docs/rules/code-optimization.md`. Tóm tắt áp dụng khi viết
component mới:
- `useMemo`: giá trị tính toán O(n)+ hoặc tạo reference mới mỗi render (mảng
  filter/sort/map) — KHÔNG memo giá trị rẻ (`arr.length`).
- `useCallback`: handler truyền xuống component ĐÃ `memo()` — không cần cho
  handler chỉ dùng nội bộ JSX của chính component đó.
- `memo()`: component render trong list, hoặc nhận props ổn định nhưng cha
  re-render thường xuyên — KHÔNG memo component gốc/chỉ render 1 lần.
- debounce gợi ý: search input 300-500ms (`useDebounce` có sẵn ở
  `@/shared/hooks`), autosave form ~1000ms.
- List `key` luôn là ID ổn định, KHÔNG dùng index mảng.
- react-hook-form: `watch('fieldName')` theo field cụ thể, KHÔNG `watch()`
  không tham số (re-render toàn form mỗi keystroke).

## Tổ chức file — theo `docs/rules/feature-structure.md`

```
src/features/{feature}/
  api/        # (nếu cần riêng ngoài core/api)
  components/ # composite tái dùng NỘI BỘ feature
  hooks/      # + index.ts re-export
  pages/      # 1 page = 1 route
  schemas/    # zod schema
  service/    # TanStack Query hooks, gọi core/api
```

Tách file khi: component vượt ~200 dòng, có ≥2 trách nhiệm rõ rệt không liên
quan, hoặc logic đủ phức tạp để đáng thành custom hook riêng.

## Thông báo người dùng — 1 kênh duy nhất

```tsx
import { showToast, showToastByCode } from '@/shared/utils/toast.utils';
```

KHÔNG trộn nhiều thư viện toast khác nhau trong cùng codebase — mọi thông báo
đi qua `showToast`/`showToastByCode`, dựa trên kit2 Radix Toast bên dưới.

## TypeScript

Strict mode, KHÔNG `any` (dùng `unknown`/generic), `import type` cho type-
only import, `@/` alias thay vì relative path dài. Chi tiết →
`docs/rules/code-style.md`.
