# Clean Code Standards (BẮT BUỘC)

> Quy chuẩn clean-code áp dụng cho **mọi file `.ts` / `.tsx`** trong `src/`.
> Mục tiêu: 1 file = 1 trách nhiệm rõ ràng, Fast Refresh không vỡ, đọc-sửa
> nhanh, KHÔNG có "rác" treo ở module-scope.
>
> Vi phạm các quy tắc đánh dấu **⛔** → **block merge** trong code review.

---

## 1. ⛔ Một file `.tsx` = một component duy nhất

### Quy tắc cứng

```
1 file .tsx CHỈ chứa 1 React component (default export hoặc named).
KHÔNG khai báo component thứ 2 ở module-scope cùng file.
```

### Lý do

- React Fast Refresh (`react-refresh/only-export-components`) yêu cầu mỗi
  file chỉ export component để hot-reload hoạt động đúng.
- File 2 components → khó tìm, khó test riêng, khó memo riêng.
- Đã có precedent: `routes.tsx` từng break husky vì khai `HomeRedirect`
  cạnh `routes` const.

### ❌ SAI — 2 components trong 1 file

```tsx
// src/features/user/pages/UserPage.tsx

const UserHeader = () => <div>...</div>;        // ❌ component thứ 2

const UserTable = () => <table>...</table>;     // ❌ component thứ 3

export const UserPage = () => (                  // ✅ component chính
  <>
    <UserHeader />
    <UserTable />
  </>
);
```

### ✅ ĐÚNG — Tách file

```
src/features/user/pages/UserPage.tsx          ← export UserPage
src/features/user/components/UserHeader.tsx   ← export UserHeader
src/features/user/components/UserTable.tsx    ← export UserTable
```

### Ngoại lệ duy nhất

**Local sub-component memoized** dùng CHỈ trong file đó, KHÔNG export:

```tsx
// ✅ OK — local helper component, không export
const Row = memo(function Row({ item }: { item: Item }) {
  return <tr>...</tr>;
});

export const UserTable = ({ items }: Props) => (
  <table>
    {items.map((item) => <Row key={item.id} item={item} />)}
  </table>
);
```

Điều kiện áp dụng ngoại lệ:
- Sub-component **KHÔNG export**
- Dùng `memo()` rõ ràng
- ≤ 30 dòng JSX
- Dùng ≥ 2 chỗ trong cùng file (nếu chỉ 1 chỗ → inline JSX, đừng tách)
- Nếu dùng ở file khác → promote thành file riêng

---

## 2. ⛔ KHÔNG khai báo "biến rác" ở module-scope

### Quy tắc cứng

```
File component CHỈ chứa: imports + types + 1 component + (tùy chọn) local
sub-component memo. KHÔNG để biến/hằng/helper ad-hoc nằm ngoài component.
```

### ❌ SAI — biến/helper rải module-scope

```tsx
// src/features/user/pages/UserPage.tsx
import { useState } from "react";

const PAGE_SIZE = 20;                            // ❌ const → constants/
const DEFAULT_FILTERS = { status: "active" };    // ❌ const → constants/
const COLUMNS = [                                // ❌ const → columns.ts
  { key: "name", label: "Tên" },
  { key: "email", label: "Email" },
];

function formatRow(row: User) {                  // ❌ helper → utils/
  return { ...row, fullName: `${row.first} ${row.last}` };
}

const userSchema = z.object({ ... });            // ❌ schema → schemas/

export const UserPage = () => { ... };
```

### ✅ ĐÚNG — Tách theo trách nhiệm

```
src/features/user/
├── constants.ts            ← PAGE_SIZE, DEFAULT_FILTERS
├── columns.ts              ← COLUMNS
├── utils/format.utils.ts   ← formatRow
├── schemas/user.schema.ts  ← userSchema
└── pages/UserPage.tsx      ← CHỈ component
```

```tsx
// src/features/user/pages/UserPage.tsx
import { PAGE_SIZE, DEFAULT_FILTERS } from "../constants";
import { COLUMNS } from "../columns";
import { formatRow } from "../utils/format.utils";
import { userSchema } from "../schemas/user.schema";

export const UserPage = () => { ... };           // ✅ CHỈ component
```

### Bảng phân loại — biến nào ở đâu?

| Loại declaration | File đặt | Lý do |
|------------------|----------|-------|
| `const FOO = 42` (constant) | `{feature}/constants.ts` | Reuse + test riêng |
| `const COLUMNS = [...]` (table cols) | `{feature}/columns.ts` hoặc `{feature}/config/columns.tsx` | Tách config khỏi UI |
| `function format(...)` (pure helper) | `{feature}/utils/{name}.utils.ts` | Test unit dễ |
| `const schema = z.object(...)` | `{feature}/schemas/{name}.schema.ts` | Reuse server/client validation |
| `const queryKey = [...]` | `{feature}/service/{name}.queries.ts` | Đi cùng React Query hooks |
| `type Foo = {...}` (≥ 2 chỗ dùng) | `{feature}/types/{name}.types.ts` | Single source |
| `interface Props {}` (chỉ component này dùng) | **Cùng file component** | OK — props là contract của component |
| Local sub-component memoized | **Cùng file** (xem §1 ngoại lệ) | Bind chặt với component cha |

### Ngoại lệ KHÔNG phải "rác"

```tsx
// ✅ OK — Props interface của chính component (contract local)
interface UserCardProps {
  user: User;
  onEdit?: (id: string) => void;
}

// ✅ OK — type narrowing helper riêng cho file (chỉ 1 file dùng)
type LocalStatus = "loading" | "ready" | "error";

export const UserCard = ({ user, onEdit }: UserCardProps) => { ... };
```

---

## 3. ⛔ Giới hạn độ dài file

| Loại file | Giới hạn cứng | Khi vượt |
|-----------|--------------|----------|
| Component (`.tsx`) | **200 dòng** | Tách sub-component / extract hook / split view |
| Hook (`.ts`) | **150 dòng** | Tách thành nhiều hook nhỏ compose lại |
| Utility (`.ts`) | **150 dòng** | Tách theo concern (date, format, validate, …) |
| Types (`.ts`) | **200 dòng** | Tách theo domain |
| Service / queries (`.ts`) | **250 dòng** | Tách theo entity con |
| Theme / recipe (`.theme.ts`) | **250 dòng** | Tách theo sub-widget |
| Constants / config | **không giới hạn** (data, không phải logic) | — |
| Auto-generated | **không giới hạn** | KHÔNG sửa tay |


### ⛔ Ngoại lệ DUY NHẤT: primitive của kit2 (`src/shared/ui/**`)

Giới hạn 200 dòng áp cho **component NGHIỆP VỤ** — nơi file dài là dấu hiệu một
component đang ôm nhiều việc. Primitive của design system là loại khác: `Table`
gói trọn đổi bề rộng cột, đóng băng cột, kéo-thả, phân trang và sắp xếp trong
MỘT hợp đồng API. Xé nó thành 5 file không làm dễ đọc hơn — chỉ bắt người đọc
nhảy qua lại giữa các file để dựng lại một thứ vốn liền mạch.

Vì vậy `src/shared/ui/**` được phép vượt 200 dòng, kèm hai điều kiện:

1. File vẫn phải là **MỘT component** (luật §1 giữ nguyên hiệu lực). Dài vì một
   component phức tạp thì được; dài vì nhét hai component thì không.
2. Recipe `tv()`, hằng số và helper thuần **vẫn phải tách** ra `*.theme.ts` /
   `*.utils.ts` như luật §2. Ngoại lệ này chỉ nới phần JSX + hành vi của chính
   component đó.

⛔ Ngoại lệ **KHÔNG** lan sang `src/features/**`, `src/app/**`, `src/core/**`.
Ở ba nơi đó, 200 dòng là giới hạn cứng. Hiện có 2 file đang vi phạm —
`src/core/api/client.ts` (~246 dòng) và `src/app/router/document-title.ts`
(~238 dòng) — coi đây là nợ kỹ thuật cần tách khi đụng tới file, KHÔNG phải
tiền lệ để thêm file vi phạm mới.
### Khi file dài → cách tách

1. **JSX dài** → tách thành sub-component (kèm điều kiện §1 ngoại lệ hoặc tách file)
2. **Nhiều `useState` + `useEffect`** → extract custom hook (`use{Feature}.ts`)
3. **Logic format/transform** → utility file
4. **Many handlers** → extract action hook (`use{Feature}Actions.ts`)
5. **Conditional rendering nhiều nhánh** → tách view component per state

---

## 4. Tách trách nhiệm theo file (Single Responsibility per File)

### Cấu trúc feature chuẩn

```
src/features/{feature}/
├── api/
│   └── {feature}.api.ts          # endpoint paths
├── types/
│   └── {feature}.types.ts        # interfaces, types
├── schemas/
│   └── {feature}.schema.ts       # Zod schemas
├── constants.ts                  # PAGE_SIZE, defaults, enums
├── columns.tsx                   # table columns config
├── utils/
│   ├── format.utils.ts
│   └── validate.utils.ts
├── service/
│   └── {feature}.queries.ts      # React Query hooks
├── hooks/
│   ├── use{Feature}.ts           # combined hook
│   ├── use{Feature}Filters.ts    # filter state
│   └── use{Feature}Actions.ts    # mutation handlers
├── components/
│   ├── {Feature}Table.tsx
│   ├── {Feature}Filter.tsx
│   ├── {Feature}Form.tsx
│   └── {Feature}Card.tsx
└── pages/
    ├── {Feature}Page.tsx          # list page (compose)
    └── {Feature}DetailPage.tsx
```

### Nguyên tắc

| File | Chỉ chứa | KHÔNG chứa |
|------|---------|-----------|
| `pages/*.tsx` | Layout + compose components + lazy data fetch hook | Business logic, formatter, schema |
| `components/*.tsx` | 1 component + props interface | Business logic, fetch logic |
| `hooks/*.ts` | State logic + side effects + return shape ổn định | JSX |
| `service/*.queries.ts` | React Query hooks + queryKey | Component, schema |
| `utils/*.ts` | Pure functions (no React, no hooks) | State, side effects |
| `schemas/*.ts` | Zod schemas + inferred types | Pure logic |
| `constants.ts` | Frozen constants (`as const`) | Functions, components |
| `types/*.ts` | `interface` / `type` declarations | Runtime values |

---

## 5. KHÔNG "Mixed Export" (lý do Fast Refresh từng break)

### Quy tắc

```
File .tsx → CHỈ export component(s) (1 default + cùng lắm vài named component).
File .ts  → export constants/functions/types tùy ý.
```

### ❌ SAI — mix component + non-component trong .tsx

```tsx
// routes.tsx — TRƯỜNG HỢP THỰC SỰ TỪNG BREAK HUSKY

const HomeRedirect = () => <Navigate to="/dashboard" replace />;   // ❌ component

export const routes: RouteObject[] = [                              // ❌ non-component
  { path: "/", element: <HomeRedirect /> },
];
```

### ✅ ĐÚNG — Hoặc inline, hoặc đổi sang `.ts`

```tsx
// routes.tsx — inline JSX, không khai component cạnh constant
export const routes: RouteObject[] = [
  { path: "/", element: <Navigate to="/dashboard" replace /> },
];
```

```ts
// module-registry.ts — KHÔNG có JSX → đổi extension thành .ts
export const MODULE_REGISTRY = [...];
export const MODULE_BY_ID = Object.fromEntries(...);
```

### Decision: `.tsx` hay `.ts`?

| File chứa | Extension |
|-----------|-----------|
| Bất kỳ JSX nào (kể cả `<Navigate>` inline) | `.tsx` |
| Chỉ logic / data / types, không JSX | `.ts` |
| Component file → có Props interface + JSX | `.tsx` |
| Config object map → constants thuần | `.ts` |

---

## 6. Component Skeleton Chuẩn

```tsx
// src/features/user/components/UserCard.tsx

// 1. ─ Imports ────────────────────────────────────────────
import { memo, useCallback } from "react";
import { Button, Text } from "@/shared/ui";
import { SystemIcon } from "@/shared/ui/icons/Icons";
import type { User } from "../types/user.types";

// 2. ─ Props interface (CHỈ component này dùng) ────────────
interface UserCardProps {
  user: User;
  onEdit?: (id: string) => void;
}

// 3. ─ Component (export DUY NHẤT của file) ────────────────
export const UserCard = memo(({ user, onEdit }: UserCardProps) => {
  // 3a. hooks
  const handleEdit = useCallback(() => onEdit?.(user.id), [onEdit, user.id]);

  // 3b. early returns
  if (!user) return null;

  // 3c. JSX
  return (
    <div className="...">
      <Text>{user.name}</Text>
      <Button onClick={handleEdit}>
        <SystemIcon name="pen-bold" size={16} />
      </Button>
    </div>
  );
});

UserCard.displayName = "UserCard";
```

**KHÔNG được phép thêm vào file này:**
- Constants ngoài `UserCardProps`
- Helper functions
- Sub-components export
- Zod schema
- React Query hook
- `useState` / `useReducer` ở scope ngoài component

---

## 7. Hook Skeleton Chuẩn

```ts
// src/features/user/hooks/useUserActions.ts

// 1. ─ Imports ────────────────────────────────────────────
import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useDeleteUser } from "../service/user.queries";
import { showToast } from "@/shared/utils/toast.utils";

// 2. ─ Return type (chỉ hook này dùng) ─────────────────────
interface UserActions {
  handleDelete: (id: string) => Promise<void>;
}

// 3. ─ Hook (export DUY NHẤT) ──────────────────────────────
export const useUserActions = (): UserActions => {
  const deleteUser = useDeleteUser();
  const queryClient = useQueryClient();

  const handleDelete = useCallback(
    async (id: string) => {
      await deleteUser.mutateAsync(id);
      queryClient.invalidateQueries({ queryKey: ["user-list"] });
      showToast("success", "Đã xóa");
    },
    [deleteUser, queryClient],
  );

  return { handleDelete };
};
```

---

## 8. Anti-patterns — danh sách đen

| ❌ Sai | ✅ Đúng |
|-------|--------|
| 2 component export `.tsx` | Tách 2 file |
| Component + constants + helpers cùng file | Tách `constants.ts` + `utils/*.ts` |
| `routes.tsx` khai `HomeRedirect` cạnh `routes` const | Inline JSX hoặc `.ts` |
| `module-registry.tsx` không có JSX | Đổi tên `.ts` |
| File `.tsx` > 200 dòng | Tách sub-component / extract hook |
| Zod schema khai trong file component | `schemas/{name}.schema.ts` |
| Helper `formatXxx` trong file component | `utils/format.utils.ts` |
| Table `COLUMNS` array trong page component | `columns.tsx` riêng (vì có JSX trong cell renderer) |
| `useEffect` fetch data trong page | React Query hook trong `service/` |
| `const PAGE_SIZE = 20` ngay đầu component file | `constants.ts` |

---

## 9. Checklist trước khi commit

- [ ] File `.tsx` chỉ export **1 component** (hoặc + local memo không export)
- [ ] KHÔNG có `const`/`function`/`schema` ad-hoc ở module-scope ngoài Props interface
- [ ] File ≤ giới hạn dòng (xem §3)
- [ ] Helpers đã extract sang `utils/`
- [ ] Constants đã extract sang `constants.ts`
- [ ] Schemas đã extract sang `schemas/`
- [ ] Columns table đã extract sang `columns.tsx`
- [ ] Hook tùy biến extract sang `hooks/use{Name}.ts`
- [ ] Extension `.ts` cho file không có JSX, `.tsx` cho file có JSX
- [ ] `npx tsc --noEmit` exit 0
- [ ] Husky pre-commit (eslint `react-refresh/only-export-components`) pass

---

## 10. Cross-references

- Naming + import order → `code-style.md`
- Performance / memoization → `code-optimization.md`
- Feature folder layout → `feature-structure.md`
- API / React Query → `api-patterns.md`
- Kit2 component composition → `kit2-architecture.md` · `widget-composition.md`
