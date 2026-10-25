# API & Data Fetching Patterns

## Cấu trúc API Layer

```
src/core/api/{feature}/
├── {feature}.api.ts      # Endpoint paths
├── {feature}.types.ts    # Request/Response types
├── {feature}.service.ts  # Pure async service functions
└── index.ts              # Re-exports (optional)

src/features/{feature}/
├── service/
│   └── {feature}.queries.ts  # React Query hooks
└── hooks/
    └── use{Feature}.ts       # Combined hook (optional)
```

## 1. API Paths

```typescript
// src/core/api/{feature}/{feature}.api.ts
const API_V1 = '/v1';

export const featureApi = {
  getList: `${API_V1}/feature`,
  getById: (id: string) => `${API_V1}/feature/${id}`,
  create: `${API_V1}/feature`,
  update: (id: string) => `${API_V1}/feature/${id}`,
  delete: (id: string) => `${API_V1}/feature/${id}`,
};
```

## 2. Types

```typescript
// src/core/api/{feature}/{feature}.types.ts
import type { ApiResponse, PaginationMeta } from '@/shared/types/api.types';

export interface FeatureItem {
  id: string;
  name: string;
  // ...
}

export interface GetFeatureListRequest {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
}

export type GetFeatureListResponse = ApiResponse<FeatureItem[]>;
export type GetFeatureByIdResponse = ApiResponse<FeatureItem>;
```

## 3. Service Layer (Pure async — NO React)

```typescript
// src/core/api/{feature}/{feature}.service.ts
import { apiClient } from '@/core/api/client';
import { featureApi } from './{feature}.api';
import type { GetFeatureListRequest, FeatureItem } from './{feature}.types';
import type { ApiResponse } from '@/shared/types/api.types';

export const featureService = {
  getList: async (params: GetFeatureListRequest): Promise<ApiResponse<FeatureItem[]>> =>
    (await apiClient.get(featureApi.getList, { params })).data,

  getById: async (id: string): Promise<ApiResponse<FeatureItem>> =>
    (await apiClient.get(featureApi.getById(id))).data,

  create: async (data: Partial<FeatureItem>): Promise<ApiResponse<FeatureItem>> =>
    (await apiClient.post(featureApi.create, data)).data,

  update: async (id: string, data: Partial<FeatureItem>): Promise<ApiResponse<FeatureItem>> =>
    (await apiClient.put(featureApi.update(id), data)).data,

  delete: async (id: string): Promise<ApiResponse<null>> =>
    (await apiClient.delete(featureApi.delete(id))).data,
};
```

## 4. React Query Hooks

```typescript
// src/features/{feature}/service/{feature}.queries.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { featureService } from '@/core/api/{feature}/{feature}.service';
import { showToast } from '@/shared/utils/toast.utils';

const QUERY_KEYS = {
  list: 'feature-list',
  detail: 'feature-detail',
} as const;

// GET List
export const useFeatureList = (params: GetFeatureListRequest) =>
  useQuery({
    queryKey: [QUERY_KEYS.list, params],
    queryFn: () => featureService.getList(params),
  });

// GET By ID
export const useFeatureById = (id: string | undefined) =>
  useQuery({
    queryKey: [QUERY_KEYS.detail, id],
    queryFn: () => featureService.getById(id!),
    enabled: !!id,
  });

// Mutations
export const useCreateFeature = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: featureService.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.list] });
      showToast('success', 'Tạo thành công');
    },
  });
};

export const useUpdateFeature = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<FeatureItem> }) =>
      featureService.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.list] });
      showToast('success', 'Cập nhật thành công');
    },
  });
};
```

## Quy tắc BẮT BUỘC

1. **React Query cho mọi API call** — KHÔNG dùng `useEffect` + `useState` để fetch
2. **Query keys chứa params** — `[KEY, params]` để auto-refetch
3. **Service layer pure async** — KHÔNG import React trong service
4. **Invalidate sau mutation** — Luôn invalidate related queries
5. **enabled flag** — Dùng `enabled: !!id` cho conditional queries
6. **apiClient có sẵn interceptors** — KHÔNG tự gắn headers
7. **Error handling** — Dùng `showToast` / `showToastByCode` cho error notifications

---

## ⛔ Trạng thái LỖI TẢI — trang/tab nào đọc dữ liệu bằng React Query đều phải có nhánh lỗi

`data ?? []` và `?? 0` KHÔNG phải xử lý lỗi: BE lỗi thì bảng hiện "Chưa có thành viên", thẻ số hiện `0`, biểu đồ
hiện "Chưa có dữ liệu" — như thể dữ liệu thật sự trống, đúng lúc người dùng cần tin con số. Toast của interceptor
biến mất sau vài giây nên KHÔNG thay được trạng thái lỗi nằm trên trang.

| Tình huống | Hiển thị |
|---|---|
| `isError && !data`, lỗi **tạm thời** (mất mạng, timeout, 5xx) | `<Callout intent="error" title="Không tải được …" action={<Button size="sm" variant="stroke" onClick={() => void refetch()}>Thử lại</Button>} />` — nút đi qua prop `action`, KHÔNG nhét `<Button>` vào `description` |
| **403** (thiếu quyền) / **404** (bản ghi không còn) | `<EmptyState>` nói rõ lý do, **KHÔNG** có nút "Thử lại" — thử lại vẫn 403/404 |
| Số liệu chưa có (đang tải / tải lỗi) | `—` (hằng `NO_DATA`), **không bao giờ `0`** |
| Đã có `data` rồi mới refetch nền lỗi | giữ dữ liệu đang có, không thay bằng khối lỗi |
| Bảng khi đang lỗi | KHÔNG vẽ `<Table>` với `emptyMessage` — `emptyMessage` chỉ dành cho danh sách rỗng THẬT |

Nhiều truy vấn cùng đọc một endpoint (danh sách + thẻ đếm + khối phụ) thì "Thử lại" phải tải lại **cả nhóm**
(`invalidateQueries` theo key gốc, vd `useReloadMembers`), nếu không bảng đã hiện lại mà thẻ đếm vẫn kẹt "—".

Mẫu: `features/workspace/components/WorkspaceLoadError.tsx` (phân loại 403/404 với lỗi tạm thời) ·
`features/gamification/components/XpRulesTab.tsx` · `app/pages/HomePage.tsx`.

---

## ⛔ URL-synced Filters — BẮT BUỘC cho mọi màn hình có filter/phân trang

> Bất kỳ màn hình / tab / panel nào có **filter** (search, dropdown, date range, …),
> **pagination** (page, pageSize), hoặc **tab navigation** → **BẮT BUỘC** đẩy
> toàn bộ state đó lên URL query string qua hook `useQueryParams` từ
> `@/shared/hooks`. **KHÔNG dùng `useState` thuần** để lưu filter.

### Lý do bắt buộc

1. **Shareable** — copy URL gửi cho người khác là họ thấy đúng cùng filter/trang
2. **Refresh-safe** — F5 không mất bộ lọc đang xem
3. **Browser back/forward** — user navigate qua lại theo lịch sử filter tự nhiên
4. **Deep link** — email/notification có thể link thẳng vào filter cụ thể
5. **Debug-friendly** — bug report có URL = reproduce được ngay

### Pattern chuẩn

```tsx
// src/features/{feature}/components/{Feature}List.tsx
import { useMemo } from 'react';
import { useDebounce, useImeSafeSearchInput, useQueryParams } from '@/shared/hooks';
import { Dropdown, Input, Table } from '@/shared/ui';

export const FeatureList = memo(() => {
  const {
    page,
    pageSize,
    search,
    setPage,
    setPageSize,
    setSearch,
    getParam,
    setParam,
  } = useQueryParams();

  // Filter ngoài search/page → đọc/ghi qua getParam/setParam
  const statusFilter = getParam('status', 'all');
  const typeFilter = getParam('type', 'all');

  // Ô tìm kiếm PHẢI uncontrolled — `value={search}` bị ESLint chặn cứng
  // (mất dấu tiếng Việt). Xem `ime-safe-input.md`.
  const { inputProps } = useImeSafeSearchInput(search, setSearch);

  // Search debounce — VẪN debounce, nhưng nguồn = URL
  const debouncedSearch = useDebounce(search, 300);

  const queryParams = useMemo(
    () => ({
      Keyword: debouncedSearch || undefined,
      Status: statusFilter !== 'all' ? Number(statusFilter) : undefined,
      Type: typeFilter !== 'all' ? typeFilter : undefined,
      PageNumber: page,
      PageSize: pageSize,
    }),
    [debouncedSearch, statusFilter, typeFilter, page, pageSize],
  );

  const { data, isFetching } = useFeatureList(queryParams);

  return (
    <>
      <Input {...inputProps} placeholder="Tìm…" />
      <Dropdown
        value={statusFilter}
        options={STATUS_OPTIONS}
        onValueChange={(v) => setParam('status', v === 'all' ? null : v)}
      />
      <Dropdown
        value={typeFilter}
        options={TYPE_OPTIONS}
        onValueChange={(v) => setParam('type', v === 'all' ? null : v)}
      />
      <Table
        data={data?.items ?? []}
        loading={isFetching}
        pagination
        total={data?.totalCount ?? 0}
        currentPage={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />
    </>
  );
});
```

### API hook `useQueryParams`

| Trả về | Mô tả |
|--------|------|
| `page` (number) | URL `?page=2` → 2. Default 1 |
| `pageSize` (number) | URL `?pageSize=20` → 20. Default `DEFAULT_PAGE_SIZE` |
| `search` (string) | URL `?search=foo` → "foo" |
| `tab` (string) | URL `?tab=members` → "members" |
| `getParam(key, default?)` | Đọc custom param |
| `setPage(n)` | Set `?page=n` |
| `setPageSize(n)` | Set `?pageSize=n`, auto reset `?page=1` |
| `setSearch(v)` | Set `?search=v`, auto reset `?page=1`. `''` xoá key |
| `setTab(v)` | Set `?tab=v`. `''` xoá key |
| `setParam(key, v)` | Set custom param, auto reset `?page=1`. `null` xoá key |
| `updateParams({...})` | Batch update nhiều param 1 lần (không reset page) |
| `clearParams()` | Xoá toàn bộ query string |
| `searchParams` (`URLSearchParams`) | Đối tượng thô, khi cần đọc param ngoài bảng trên |

Config nhận: `pageKey` · `pageSizeKey` · `searchKey` · `tabKey` · `defaultPageSize` · `resetPageOnChange`.

**Tính chất:**
- Mặc định dùng `{ replace: true }` → không phá `history` khi gõ search
- Đổi filter / search / pageSize → tự reset `page = 1`
- Giá trị rỗng (`''`, `null`, `undefined`) → xoá key khỏi URL (URL sạch)
- Default keys: `page`, `pageSize`, `search`, `tab` — đổi qua `config` nếu nhiều bảng share URL

### Tuỳ chỉnh key (khi 2+ bảng cùng trang)

```tsx
// Bảng A
const a = useQueryParams({
  pageKey: 'aPage',
  searchKey: 'aSearch',
});

// Bảng B
const b = useQueryParams({
  pageKey: 'bPage',
  searchKey: 'bSearch',
});
```

### Anti-patterns — BLOCK MERGE

| ❌ Sai | ✅ Đúng |
|-------|--------|
| `const [search, setSearch] = useState('')` cho list page | `const { search, setSearch } = useQueryParams()` |
| `const [page, setPage] = useState(1)` cho list page | `const { page, setPage } = useQueryParams()` |
| `const [filter, setFilter] = useState('all')` | `const filter = getParam('key', 'all'); setParam('key', val)` |
| Tự viết `useSearchParams` + tự parse trong component | Dùng `useQueryParams` — KHÔNG re-implement |
| Lưu filter vào `localStorage` thay vì URL | URL là source of truth duy nhất cho filter |
| Quên reset `page = 1` khi đổi filter | `useQueryParams` tự reset — KHÔNG cần code tay |
| Để URL có `?status=` (empty) | Truyền `null` vào `setParam` → key bị xoá |

### Khi nào ngoại lệ KHÔNG cần đẩy URL?

| Tình huống | Giải pháp |
|-----------|-----------|
| Filter trong modal/dialog tạm thời (đóng = mất) | `useState` OK — KHÔNG cần URL |
| Form input (chưa submit) | `react-hook-form` — KHÔNG dùng URL |
| Toggle expand/collapse UI (không ảnh hưởng data) | `useState` / `useDisclosure` OK |
| Selected row trong table (chưa navigate) | `useState` OK |
| Drag-drop reorder state tạm | `useState` OK |

> Quy tắc: nếu **state ảnh hưởng tới query gọi API** hoặc **danh sách dữ liệu user thấy** → BẮT BUỘC lên URL.

### Checklist trước khi commit list/table page

- [ ] Mọi `useState` cho search / filter / page / pageSize / tab đã được thay bằng `useQueryParams`?
- [ ] Filter dropdown gọi `setParam(key, val === 'all' ? null : val)` (xoá key khi default)?
- [ ] `useDebounce(search, 300)` vẫn được áp cho input text search?
- [ ] `Table` nhận `currentPage={page}`, `pageSize={pageSize}`, `onPageChange={setPage}`, `onPageSizeChange={setPageSize}`?
- [ ] Refresh trình duyệt → filter & pagination giữ nguyên?
- [ ] Copy URL sang tab khác → thấy đúng filter?
