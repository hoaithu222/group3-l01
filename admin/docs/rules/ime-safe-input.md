# IME-Safe Search Input (BẮT BUỘC)

> Áp dụng cho **mọi `<Input>` dùng làm ô tìm kiếm** (có `placeholder="Tìm…"`
> hoặc nhận giá trị text tự do từ user). Mục tiêu: gõ tiếng Việt (Telex/VNI),
> tiếng Nhật/Hàn/Trung không bị mất dấu / lặp ký tự.
>
> Vi phạm các quy tắc đánh dấu **⛔** → **block merge**.

---

## 0. Root cause — tại sao controlled input phá IME

React **controlled input** (`value` prop): mỗi keystroke →
`onChange` → `setState` → re-render → React ghi `value` xuống DOM →
**cắt ngang composition sequence** → dấu tiếng Việt bị mất / lặp.

```
Gõ "d" + "d" (Telex → "đ"):
  Browser composition: [d] → [dd] → commit "đ"
  React (controlled): onChange("d") → setState("d") → value="d" ghi DOM
                   → onChange("dd") → setState("dd") → value="dd" ghi DOM
                   → BREAK COMPOSITION → mất "đ", nhận "dd"
```

React **uncontrolled input** (`defaultValue`, không có `value`): React
KHÔNG đụng DOM value trong re-render → IME chạy tự nhiên.

---

## 0.5. ⛔ Rào chắn tự động — ESLint CHẶN CỨNG

Rule này **không còn chỉ là tài liệu**. `eslint.config.js` có 3 selector
`no-restricted-syntax` (severity `error`) chặn đúng 3 anti-pattern gốc:

| Selector chặn | Bắt được |
|---------------|---------|
| `<Input debounce>` | Prop `debounce` (tạo controlled state nội bộ) |
| `<Input\|input>` vừa có `placeholder` chứa `Tìm`/`Search` vừa có `value` | Ô tìm kiếm controlled (placeholder literal) |
| `<Input\|input value={search\|query\|keyword\|…}>` | Ô tìm kiếm controlled (biến tên search, placeholder động) |

**Hệ quả:**
- `npm run lint` → exit ≠ 0 nếu tái phạm.
- Husky `lint-staged` chạy `eslint --fix` khi commit → **không commit được** file vi phạm.
- Scope: toàn bộ `src/**/*.{ts,tsx}` — không có thư mục nào được miễn.

> ⚠️ 3 selector này khai **chung một block `no-restricted-syntax`** với selector
> bỏ dấu tìm kiếm của `search-matching.md`. ESLint flat config **ghi đè** (không
> gộp) options của cùng một rule khi nhiều block cùng khớp file — tách ra là mất
> nhóm selector khai trước.

**KHÔNG được vô hiệu hoá bằng `// eslint-disable-next-line no-restricted-syntax`.**
Nếu thật sự cần ngoại lệ → sửa rule ở `eslint.config.js` kèm lý do trong PR,
không disable rải rác từng dòng.

Kiểm tra nhanh:
```bash
npx eslint src            # phải 0 lỗi no-restricted-syntax
```

---

## 1. ⛔ Quy tắc BẮT BUỘC

### 1.1. KHÔNG controlled `<Input>` cho text search field

```tsx
// ❌ SAI — controlled: setState mỗi keystroke → phá IME
<Input
  value={search}
  onChange={(e) => setSearch(e.target.value)}
  placeholder="Tìm…"
/>

// ❌ SAI — debounce prop cũng tạo internal controlled input → cùng bug
<Input
  debounce
  value={search}
  onChange={(e) => setSearch(e.target.value)}
  placeholder="Tìm…"
/>
```

### 1.2. LUÔN dùng `useImeSafeSearchInput` cho mọi search text field

```tsx
import { useImeSafeSearchInput, useDebounce } from '@/shared/hooks';

// ✅ ĐÚNG — uncontrolled + composition tracking
const [search, setSearch] = useState('');
const { inputProps, clear } = useImeSafeSearchInput(search, setSearch);
const debouncedSearch = useDebounce(search, 300); // dùng cho API/filter

<Input
  {...inputProps}                   // ← spread trước các prop khác
  placeholder="Tìm theo tên…"
  startIcon={<SystemIcon name="magnifying-glass-outline" size={14} />}
/>

{/* Clear button — gọi clear() từ hook hoặc setSearch('') */}
{search && (
  <button type="button" onClick={clear}>
    <SystemIcon name="xmark-outline" size={12} />
  </button>
)}
```

---

## 2. `useImeSafeSearchInput` — API

```ts
import { useImeSafeSearchInput } from '@/shared/hooks';

const { inputProps, clear } = useImeSafeSearchInput(
  value,     // string — current search value (from useState / useQueryParams)
  onChange,  // (next: string) => void — setter
);
```

| Trả về | Ý nghĩa |
|--------|---------|
| `inputProps.ref` | Ref tới DOM `<input>` — bắt buộc forward |
| `inputProps.defaultValue` | Initial value (uncontrolled) |
| `inputProps.onChange` | Filtered onChange: bỏ qua khi composing |
| `inputProps.onCompositionStart` | Đánh dấu bắt đầu IME compose |
| `inputProps.onCompositionEnd` | Commit value sau khi IME xong |
| `clear()` | Reset DOM value + gọi onChange('') |

---

## 3. KHÔNG dùng `debounce` prop trên `<Input>` cho search

Prop `debounce` trên kit2 `<Input>` làm input thành **controlled** với
internal `display` state → **cũng phá IME**.

Debounce cho search: dùng `useDebounce` hook ở tầng query/filter:

```tsx
// ❌ SAI — debounce prop → controlled → IME bug
<Input debounce value={search} onChange={(e) => setSearch(e.target.value)} />

// ✅ ĐÚNG — uncontrolled + debounce tách ra
const { inputProps } = useImeSafeSearchInput(search, setSearch);
const debouncedSearch = useDebounce(search, 300); // cho API params

<Input {...inputProps} placeholder="Tìm…" />
// debouncedSearch dùng trong queryParams
```

---

## 4. `clearable` prop — vẫn OK với uncontrolled

Kit2 `<Input clearable>` dispatch native `input` event → React nhận →
`onChange` → `useImeSafeSearchInput.handleChange` → `onChange("")`.
Không ảnh hưởng tới IME khi user click clear.

```tsx
// ✅ OK — clearable hoạt động bình thường với useImeSafeSearchInput
<Input
  {...inputProps}
  clearable
  placeholder="Tìm…"
/>
```

---

## 5. Trường hợp nào KHÔNG cần `useImeSafeSearchInput`

| Tình huống | Lý do |
|-----------|-------|
| Form field tích hợp RHF (`<TextField>`) | RHF tự xử lý — KHÔNG thêm hook nữa |
| `<Dropdown>` / `<MultiSelect>` search-box nội bộ | Kit2 đã xử lý nội bộ |
| Filter `<Input>` chỉ nhận số / code ASCII (không có dấu) | Không bị IME bug — nhưng vẫn khuyến nghị |
| `<Input>` trong modal tạm thời chỉ nhập ASCII | Không bắt buộc |

---

## 6. Checklist trước khi commit

- [ ] Mọi `<Input>` có `placeholder` dạng "Tìm…" / "Search…" đã dùng `useImeSafeSearchInput`?
- [ ] KHÔNG còn `value={search} onChange={(e) => setState(e.target.value)}` cho text search?
- [ ] KHÔNG có `debounce` prop trên `<Input>` dùng cho search?
- [ ] Debounce đã chuyển sang `useDebounce(search, 300)` ở tầng query/filter?
- [ ] `{...inputProps}` đặt **đầu tiên** trong props — các prop sau override an toàn?
- [ ] Clear button gọi `clear()` từ hook hoặc `setState('')` (cả 2 đều hoạt động)?
- [ ] `npx tsc --noEmit` exit 0?

---

## 7. Anti-patterns — danh sách đen

| ❌ Sai | ✅ Đúng |
|-------|--------|
| `<Input value={search} onChange={…}>` cho search | `<Input {...inputProps}>` từ `useImeSafeSearchInput` |
| `<Input debounce value={search} onChange={…}>` | `useImeSafeSearchInput` + `useDebounce` tách |
| `onChange={(e) => setSearch(e.target.value)}` cho text search | Không dùng trực tiếp — hook tự xử lý |
| `handleSearchChange = useCallback((e) => setState(e.target.value), [])` | Xóa đi, hook thay thế |
| `<Input clearable debounce value={…}>` | `<Input {...inputProps} clearable>` (bỏ `debounce`) |
| Kit2 core (`Dropdown`/`MultiSelect`/`DropdownTreeSelect`/`AsyncSelectField`) dùng `<input value onChange>` cho search-box nội bộ | `{...searchInputProps}` từ `useImeSafeSearchInput` |
| Raw `<input>` tự dựng cho ô tìm kiếm (viewer, command palette, cell editor) | `<Input {...inputProps}>` — kit2, không raw HTML |
| Local component `SearchInput` tự định nghĩa trong file, controlled | Dùng thẳng `<Input>` + hook |
| `ref={someRef}` để `focus()` sau khi clear | Xoá `useRef`, dùng `inputProps.ref` từ hook |
| Component arrow-body `({...}) => (<div>…)` khi cần gọi hook | Chuyển sang function body `({...}) => { const hook = …; return (…); }` |
| 2 `<Input>` share cùng `search` state, cả 2 controlled | 1 hook call, spread `{...inputProps}` trên cả 2 |
| `search` nằm trên URL (`useQueryParams`) + controlled `<Input>` | Vẫn dùng hook — mỗi keystroke không được navigate |

---

## 8. Phạm vi áp dụng

Quy tắc này áp cho **mọi ô tìm kiếm trong dự án**, không có ngoại lệ theo thư mục:

- **Kit2 core** (`src/shared/ui/**`) — mỗi search-box nội bộ sửa 1 lần là toàn bộ
  consumer tự động IME-safe. Đây là chỗ ưu tiên nhất: `<Dropdown searchable>`,
  `<MultiSelect>`, `<DropdownTreeSelect>`, `<AsyncSelectField>` đã xử lý sẵn →
  caller **KHÔNG** cần fix thêm.
- **Feature code** (`src/features/**`) — mọi filter bar, modal picker, tree
  select, panel tìm kiếm mới.
- **Mockup / prototype** — vẫn phải IME-safe. Code mockup hay bị copy sang thật.

**Bài học:** review bằng mắt / grep **KHÔNG đủ** — 3 selector ESLint ở §0.5 mới là
guard rail thật. Thêm ô tìm kiếm mới → chạy `npx eslint src` trước khi commit.

---

## 9. Cross-references

- So khớp từ khoá (bỏ dấu / hoa-thường) + giữ focus ô tìm kiếm → **`search-matching.md`**
- Hook source: `src/shared/hooks/input/useImeSafeSearchInput.ts`
- URL-synced filters: `api-patterns.md` (§ URL-synced Filters)
- Kit2 Input component: `reuse-first.md §3.1`
- Form fields (RHF): `reuse-first.md §3.7` — KHÔNG dùng hook này trong form
