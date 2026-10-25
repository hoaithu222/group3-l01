# Code Optimization Rules

## 1. Performance — React Rendering

### Memoization BẮT BUỘC

**BẮT BUỘC:** import `memo` / `useMemo` / `useCallback` từ `react` — KHÔNG dùng `React.memo()`, `React.useMemo()`, `React.useCallback()`.

```tsx
import { memo, useMemo, useCallback } from 'react';

// ✅ memo cho component nhận props ổn định
export const TableEntity = memo(({ data, onAction }: Props) => { ... });
TableEntity.displayName = 'TableEntity';

// ✅ useMemo cho computed values tốn kém
const filteredItems = useMemo(() =>
  items.filter(item => item.status === activeStatus),
  [items, activeStatus]
);

// ✅ useCallback cho handlers truyền xuống child
const handleClick = useCallback((id: string) => {
  navigate(`/detail/${id}`);
}, [navigate]);
```

### KHÔNG memo khi không cần

```tsx
// ❌ Không memo primitive values
const count = useMemo(() => items.length, [items]); // Không cần, .length rẻ

// ❌ Không memo component chỉ render 1 lần
const AppShell = memo(() => ...); // Root component, không cần memo

// ✅ Chỉ memo khi:
// - Component re-render thường xuyên với cùng props
// - Computed value tốn > O(n) hoặc tạo new reference
// - Callback truyền xuống memoized child
```

---

## 2. Component Design

### Single Responsibility

```tsx
// ❌ SAI — Component làm quá nhiều việc
const UserPage = () => {
  // fetch data + filter logic + form logic + table logic + modal logic
  // 200+ lines
};

// ✅ ĐÚNG — Tách concerns
const UserPage = () => {
  return (
    <>
      <UserFilter />
      <UserTable />
      <UserFormModal />
    </>
  );
};
```

### Custom Hooks cho logic phức tạp

```tsx
// ❌ SAI — Logic trong component
const ListPage = () => {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const { data } = useQuery({ queryKey: ['items', page, debouncedSearch], ... });
  // 20+ lines logic...
};

// ✅ ĐÚNG — Extract vào hook
const useItemList = () => {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const { data, isLoading } = useQuery({
    queryKey: ['items', page, debouncedSearch],
    queryFn: () => itemService.getList({ page, search: debouncedSearch }),
  });
  return { items: data?.items ?? [], total: data?.total ?? 0, isLoading, page, setPage, search, setSearch };
};
```

---

## 3. API & Data Fetching

### React Query — BẮT BUỘC cho API calls

```tsx
// ❌ SAI — useEffect + useState
const [data, setData] = useState([]);
const [loading, setLoading] = useState(false);
useEffect(() => {
  setLoading(true);
  fetchData().then(setData).finally(() => setLoading(false));
}, []);

// ✅ ĐÚNG — React Query
const { data, isLoading } = useQuery({
  queryKey: ['entity-list', params],
  queryFn: () => entityService.getList(params),
});
```

### Query Keys phải chứa dependencies

```tsx
// ❌ SAI — Static key, không refetch khi params đổi
queryKey: ['items']

// ✅ ĐÚNG — Params trong key
queryKey: ['items', { page, search, status }]
```

### Invalidate sau mutation

```tsx
const queryClient = useQueryClient();
const mutation = useMutation({
  mutationFn: entityService.create,
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['entity-list'] });
    showToast('success', 'Tạo thành công');
  },
  onError: (error) => {
    const msg = extractErrorMessage(error);
    showToast('error', msg);
  },
});
```

---

## 4. Khi phát sinh code mới — Tư duy chung (DRY)

### Trước khi viết bất kỳ function/component nào:

1. **Kiểm tra xem có dùng được ở 2+ nơi không?**
   - Nếu CÓ → Đặt vào `src/shared/` (`hooks/`, `utils/`, hoặc `ui/` — kit2)
   - Nếu KHÔNG → Đặt trong feature module

2. **Kiểm tra pattern tương tự đã tồn tại?**
   - Search codebase cho function/component tương tự
   - Mở rộng cái có sẵn thay vì tạo mới

3. **Extract shared logic khi thấy pattern lặp lại:**

```tsx
// ❌ SAI — Copy-paste cùng logic ở 3 features
// Feature A
const handleDelete = async (id: string) => {
  const confirmed = await showConfirm('Bạn chắc chắn?');
  if (confirmed) { await deleteA(id); refetch(); showToast('success', 'Đã xóa'); }
};
// Feature B — copy y hệt...
// Feature C — copy y hệt...

// ✅ ĐÚNG — dùng hook shared ĐÃ CÓ: src/shared/hooks/state/useDeleteWithConfirm.ts
import { useDeleteWithConfirm } from '@/shared/hooks';

const del = useDeleteWithConfirm({
  onConfirm: async (id) => {
    await deleteItem(id);
    queryClient.invalidateQueries({ queryKey: ['item-list'] });
    showToast('success', 'Đã xóa');
  },
});

<Button onClick={() => del.requestDelete(row.id, row.name)}>Xoá</Button>
<ConfirmDialog
  variant="delete"
  open={del.isOpen}
  description={`Xoá "${del.pendingName}"?`}
  onCancel={del.cancel}
  onConfirm={del.confirm}
/>
```

> ⚠️ Bước 2 ở trên tồn tại vì đúng ca này: đừng viết `useDeleteAction` mới khi
> `useDeleteWithConfirm` đã có sẵn.

### Ngưỡng tạo shared code:

| Lặp lại | Hành động |
|---------|-----------|
| 1 lần | Giữ trong feature |
| 2 lần | Cân nhắc extract nếu logic phức tạp |
| 3+ lần | **BẮT BUỘC** extract vào shared |

---

## 5. TypeScript Strict

```tsx
// ❌ SAI
const data: any = response.data;
const items = data?.items || [];
function process(input) { ... } // implicit any

// ✅ ĐÚNG
const data = response.data as ApiResponse<EntityList>;
const items: EntityItem[] = data?.items ?? [];
function process(input: ProcessInput): ProcessOutput { ... }
```

### Type Reuse

```tsx
// ❌ SAI — Duplicate types
// File A: interface User { id: string; name: string; email: string; }
// File B: interface User { id: string; name: string; email: string; }

// ✅ ĐÚNG — Single source
// src/core/api/{feature}/{feature}.types.ts
export interface User { id: string; name: string; email: string; }
// Import everywhere: import type { User } from '@/core/api/auth/auth.types';
```

---

## 6. Import Best Practices

```tsx
// ✅ ĐÚNG — Path alias + kit2
import { Button, Modal, type ButtonVariant } from '@/shared/ui';
import { SystemIcon } from '@/shared/ui/icons/Icons';
import { useDisclosure } from '@/shared/hooks';
import { cn } from '@/shared/utils/style/cn';
import type { ApiResponse } from '@/shared/types/api.types';

// ❌ SAI — Relative paths dài
import { Button } from '../../../shared/ui/actions/Button';

// ✅ ĐÚNG — import type khi chỉ dùng type
import type { UserFormValues } from './types';
```

---

## 7. Conditional Rendering

```tsx
// ❌ SAI — Ternary lồng nhau
{isLoading ? <Spinner /> : error ? <Callout intent="error" /> : data ? <Table /> : null}

// ✅ ĐÚNG — Early returns rõ ràng
if (isLoading) return <Spinner />;
if (error) return <Callout intent="error" description={error.message} />;
if (!data?.length) return <EmptyState />;
return <Table data={data} />;
```

---

## 8. Event Handlers

```tsx
// ❌ SAI — Inline arrow functions tạo new reference mỗi render
<Button onClick={() => handleDelete(item.id)} />

// ✅ ĐÚNG — useCallback hoặc closure ở ngoài (khi truyền xuống memoized child)
const onDelete = useCallback((id: string) => handleDelete(id), [handleDelete]);

// ✅ OK — Inline arrow khi component KHÔNG memoized (đơn giản, ít re-render)
// Không cần over-optimize mọi thứ
```

---

## 9. Form Patterns

```tsx
// ✅ ĐÚNG — kit2 `useZodForm` (đã bọc sẵn zodResolver + mode 'onTouched')
import { z } from 'zod';
import { useZodForm } from '@/shared/ui';
import { emailField, requiredText } from '@/shared/utils/validation/validators.utils';

const schema = z.object({
  name: requiredText('Tên là bắt buộc'),   // = z.string().trim().min(1, …)
  email: emailField(),
});

type FormValues = z.infer<typeof schema>;

const form = useZodForm<FormValues>(schema, { defaultValues: { name: '', email: '' } });

// ⛔ KHÔNG tự gọi useForm + zodResolver — xem `form-validation.md`
```

---

## 10. Lazy Loading

```tsx
// ✅ ĐÚNG — khai lazy TẬP TRUNG ở src/app/router/lazy-pages.ts
export const UserPage = lazy(() => import('@/features/user/pages/UserPage'));

// routes.tsx bọc bằng <LazyLoad component={…} /> (Suspense + error boundary có sẵn)
{ path: '/users', element: <LazyLoad component={UserPage} /> }

// ⛔ KHÔNG khai lazy() cạnh hằng số `routes` trong routes.tsx —
//    vỡ Fast Refresh (`clean-code-standards.md §5`).
// Trang thuộc phân hệ đi qua MODULE_REGISTRY → build-routes.tsx tự lazy-hoá.
```

---

## Checklist trước khi submit code

- [ ] Không có hardcoded colors (hex, rgb, named colors)
- [ ] Không duplicate component/hook/utility đã có sẵn
- [ ] Không có `any` type
- [ ] Không có `useEffect` + `useState` cho data fetching (dùng React Query)
- [ ] Components phức tạp được wrap `memo` (named import — KHÔNG `React.memo()`)
- [ ] Table columns được `useMemo`
- [ ] Handlers truyền xuống child được `useCallback`
- [ ] Import dùng path alias `@/`
- [ ] Types được import với `import type`
- [ ] Logic dùng ở 3+ nơi đã được extract vào shared
