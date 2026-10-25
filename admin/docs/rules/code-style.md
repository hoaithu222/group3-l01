# Code Style & Conventions

## TypeScript

- **Strict mode**: KHÔNG dùng `any` — dùng `unknown` nếu cần
- **Path alias**: Dùng `@/` thay vì relative paths dài
- **Interfaces vs Types**: `interface` cho object shapes, `type` cho unions/intersections
- **`import type`**: Luôn dùng khi chỉ import types

## Naming Conventions

| Element | Convention | Example |
|---------|-----------|---------|
| Component | PascalCase | `FilterBar`, `UserTable` |
| Hook | camelCase, prefix `use` | `useDisclosure`, `useUserList` |
| Utility function | camelCase | `formatDate`, `cn` |
| Type/Interface | PascalCase | `UserFormValues`, `ApiResponse` |
| Constant | UPPER_SNAKE_CASE | `DEFAULT_PAGE_SIZE` |
| File — component | PascalCase | `FilterBar.tsx`, `UserTable.tsx` |
| File — hook | camelCase | `useDisclosure.ts`, `useUserList.ts` |
| File — utility | kebab-case | `date.utils.ts`, `format.utils.ts` |
| File — types | kebab-case | `api.types.ts`, `common.types.ts` |
| Directory | kebab-case | `data-display/`, `image-annotator/`, `page-header/` |

## React Components

**BẮT BUỘC:** import `memo` từ `react` — KHÔNG dùng `React.memo()`.

```tsx
import { memo } from 'react';

interface ComponentProps {
  data: DataType;
  isLoading?: boolean;
  onAction?: (item: DataType) => void;
}

export const ComponentName = memo(({
  data,
  isLoading = false,
  onAction,
}: ComponentProps) => {
  // 1. hooks first
  // 2. derived state (useMemo)
  // 3. callbacks (useCallback)
  // 4. early returns
  // 5. JSX

  if (isLoading) return <Spinner />;

  return <div className="...">{/* JSX */}</div>;
});

ComponentName.displayName = 'ComponentName';
```

### KHÔNG dùng

```tsx
// ❌ React.memo() — phải dùng named import
export const Foo = React.memo(...);

// ❌ React.FC type — dùng inline props type
export const Foo: React.FC<Props> = (props) => ...;
```

## Imports Order

1. React / React libraries
2. Third-party libraries (radix, dayjs, react-hook-form, zod, recharts)
3. `@/core/` imports
4. `@/shared/` imports
5. `@/app/` imports
6. Feature-relative imports (`./`, `../`)
7. Types (`import type`)

## Class Name Composition

```tsx
// ✅ ĐÚNG — Dùng cn() cho conditional classes
import { cn } from '@/shared/utils/style/cn';

<div className={cn(
  "flex items-center gap-2 p-4 rounded-lg",
  "bg-bg-1 border border-border-1",
  isActive && "bg-primary-1 border-primary-5",
  className
)} />
```
