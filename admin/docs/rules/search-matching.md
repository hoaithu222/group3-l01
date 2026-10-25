# Search Matching & Search-box Focus (BẮT BUỘC)

> Áp dụng cho **mọi chỗ lọc dữ liệu theo từ khoá người dùng gõ**: ô tìm kiếm của
> trang, filter bar, `<Dropdown searchable>`, `<MultiSelect searchable>`, `<Tree
> searchTerm>`, popover chọn người dùng / mục danh mục, command palette…
>
> Hai lỗi bị cấm ở đây đều đã xảy ra thật:
> 1. Gõ **"met khoi"** hoặc **"CAI"** ra "Không có kết quả" (chỉ `toLowerCase()`).
> 2. Gõ được **1 chữ rồi mất focus**, không gõ tiếp được (panel cướp focus).
>
> Vi phạm các mục đánh dấu **⛔** → **block merge**.

Liên quan: `ime-safe-input.md` (gõ tiếng Việt không mất dấu) · `reuse-first.md`
(catalog kit2) · `interaction-ux.md` (auto-focus, phím tắt).

---

## 0. Nguyên tắc tối cao

```
1. BỎ DẤU      — người Việt gõ tìm kiếm KHÔNG bỏ dấu. "met khoi" phải ra "Mét khối".
2. KHÔNG PHÂN BIỆT HOA/THƯỜNG — "CAI", "Cái", "cai" là một.
3. CHUẨN HOÁ CẢ HAI VẾ — cả từ khoá lẫn dữ liệu, bằng CÙNG một hàm.
4. KHỚP MỌI THỨ NGƯỜI DÙNG NHÌN THẤY — tên, MÃ, ký hiệu, text phụ.
5. GÕ TỚI ĐÂU CÒN FOCUS TỚI ĐÓ — ô tìm kiếm không được mất focus giữa chừng.
```

---

## 1. ⛔ Hàm dùng chung — `@/shared/utils/format/string.utils`

| Hàm | Khi dùng |
|-----|---------|
| `normalizeSearch(value)` | Chuẩn hoá 1 chuỗi (bỏ dấu → thường → gộp khoảng trắng). Dùng để chuẩn hoá **từ khoá một lần** trước vòng lặp |
| `includesSearch(haystack, needle)` | So khớp 1 trường với từ khoá **thô** (tự chuẩn hoá 2 vế) |
| `includesNormalized(haystack, normalizedNeedle)` | Như trên nhưng từ khoá **đã** `normalizeSearch()` — dùng trong vòng lặp lớn |
| `matchesSearch([f1, f2, …], needle)` | Khớp từ khoá trên **nhiều trường** của cùng một bản ghi |

Tính chất bắt buộc nhớ:
- Từ khoá **rỗng → luôn khớp** (không lọc). Không cần tự viết `if (!q) return all`
  bên trong callback, nhưng vẫn nên `if (!q) return items` để khỏi duyệt vô ích.
- `haystack` `null`/`undefined` an toàn — trả `false` (trừ khi từ khoá rỗng).

```ts
import { includesNormalized, matchesSearch, normalizeSearch } from '@/shared/utils/format/string.utils';

// ✅ ĐÚNG — chuẩn hoá từ khoá 1 lần, lọc bằng includesNormalized
const filtered = useMemo(() => {
  const needle = normalizeSearch(debouncedSearch);
  if (!needle) return items;
  return items.filter((item) => includesNormalized(`${item.code} ${item.name}`, needle));
}, [items, debouncedSearch]);

// ✅ ĐÚNG — nhiều trường rời rạc
const filtered = items.filter((item) => matchesSearch([item.code, item.name, item.description], search));
```

---

## 2. ⛔ BAN LIST — ESLint chặn cứng

`eslint.config.js` (`no-restricted-syntax`) báo **error** cho
`x.toLowerCase().includes(y)` trên toàn bộ `src/**` — không thư mục nào được miễn.
`npm run lint` fail → husky `lint-staged` không cho commit.

| ❌ Sai | ✅ Đúng |
|-------|--------|
| `item.name.toLowerCase().includes(q)` | `includesNormalized(item.name, q)` |
| `stripDiacritics(x).toLowerCase().includes(q)` | `includesNormalized(x, q)` — hàm đã lo cả hai bước |
| `const q = search.trim().toLowerCase()` | `const q = normalizeSearch(search)` |
| `stripDiacritics(a).toLowerCase() === stripDiacritics(b).toLowerCase()` | `normalizeSearch(a) === normalizeSearch(b)` |
| Chuẩn hoá **haystack** mà quên **needle** (hoặc ngược lại) | Luôn qua `includes*` / `matchesSearch` |
| Mỗi feature tự viết `normalize()` cục bộ | Import từ `@/shared/utils/format/string.utils` |

**KHÔNG được tắt bằng `// eslint-disable-next-line no-restricted-syntax`.** Cần
ngoại lệ thật (so khớp mã ASCII sinh tự động, so path…) thì dùng
`x === y` / `x.startsWith(y)` cho rõ ý, hoặc sửa rule ở `eslint.config.js` kèm lý
do trong PR.

> ⚠️ `no-restricted-syntax` khai ở **MỘT block duy nhất** trong `eslint.config.js`
> (chung với nhóm selector của `ime-safe-input.md`). Flat config **ghi đè**, không
> gộp, options của cùng một rule khi nhiều block cùng khớp file — tách ra là mất
> nhóm selector khai trước.

---

## 3. ⛔ Khớp trên MỌI trường người dùng nhìn thấy

Danh mục trong hệ này gần như luôn hiện **mã** cạnh **tên** (`ADMIN · Quản trị
viên`, `VN · Việt Nam`, `DRAFT · Bản nháp`). Người dùng thạo việc gõ **mã**,
không gõ tên. Lọc chỉ theo `label` là hỏng một nửa nhu cầu.

`<Dropdown searchable>` khớp sẵn **3 trường người dùng NHÌN THẤY**: `label` ·
`badge` (pill mã) · `meta` (text phụ căn phải). ⛔ **KHÔNG** khớp `option.value`
— nó thường là id kỹ thuật (`"12"`), gõ "1" sẽ trúng bừa hàng loạt dòng chẳng
liên quan. Vì vậy:

```tsx
// ❌ SAI — nhét mã vào label cho "tìm được"; ô đã chọn thành dài loằng ngoằng
options={roles.map((u) => ({ value: String(u.id), label: `${u.name} (${u.code})` }))}

// ✅ ĐÚNG — mã ở `badge`: danh sách hiện tên đầy đủ, ô đã chọn hiện mã ngắn,
//            và gõ mã vẫn tìm ra
options={roles.map((u) => ({ value: String(u.id), label: u.name, badge: u.code }))}
triggerDisplay="badge"
```

Với bảng/danh sách tự lọc: gộp các trường vào một chuỗi (`\`${code} ${name}\``)
hoặc dùng `matchesSearch([...])`.

---

## 4. ⛔ Ô tìm kiếm trong panel nổi KHÔNG được mất focus

Radix Select là **listbox**: mỗi lần tập item đổi hoặc panel được đặt vị trí
xong, nó gọi `focusSelectedItem()` → giành focus về item. Ngoài ra hành vi mặc
định "focus phần tử vừa bấm" của trình duyệt chạy ở `mousedown` — tức **sau**
`useEffect` mở panel. Chỉ gọi `input.focus()` một lần là **không đủ**: người dùng
gõ được chữ đầu (hoặc không gõ được chữ nào) rồi con trỏ biến mất.

`<Dropdown searchable>` (kit2) đã cài đủ 3 lớp — **KHÔNG gỡ, KHÔNG fork**:

| Lớp | Làm gì | Vì sao cần |
|-----|--------|-----------|
| Effect mở panel + đòi lại ở macrotask kế tiếp | `input.focus()`, rồi kiểm lại sau `setTimeout(0)` nếu con trỏ không nằm trong panel | Chặn cú `mousedown` của trigger giành lại focus |
| `onFocus` trên `Content` | Focus rơi vào **chính panel** → luôn kéo về ô tìm kiếm; rơi vào **item** → kéo về đúng MỘT lần rồi trả quyền cho Radix | Đường lùi của `focusFirst()` không bao giờ là thao tác của người dùng; còn hover/mũi tên thì phải để yên |
| `onKeyDownCapture` trên `Content` | Con trỏ đang ở item mà gõ ký tự / Backspace → chuyển hướng về ô tìm kiếm, `preventDefault()` | Không có nó, ký tự chảy vào **typeahead** của Radix (và `Space` còn CHỌN item, đóng panel) |

Ràng buộc kèm theo:

- ⛔ Option **không khớp từ khoá KHÔNG được unmount** — chỉ `hidden` + `disabled`.
  Unmount item đang chọn làm Radix `setSelectedItem(null)` → `focusSelectedItem`
  chạy lại → focus giật khỏi ô tìm kiếm giữa lúc gõ.
- ⛔ `onKeyDownCapture` phải ở **pha capture**. Để ở pha bubble là handler của
  `SelectItem` chạy trước → `Space` chọn item và đóng panel.
- ⛔ Phải bỏ qua khi `event.nativeEvent.isComposing` (xem `ime-safe-input.md`).
- ⛔ Ô tìm kiếm dùng `useImeSafeSearchInput` (uncontrolled) — không được controlled.

⛔ Sửa `Dropdown.tsx` mà đụng vào 3 lớp trên → **BẮT BUỘC** kèm regression test
(mở panel, gõ liền 5-6 ký tự, khẳng định `document.activeElement` vẫn là ô tìm
kiếm). Không có test thì không merge.

---

## 5. Dropdown trong ô bảng — ⛔ `min-w-0`

Trigger của `<Dropdown>` / `<MultiSelect>` có `min-w-[180px]` mặc định (hợp lý
cho field đứng riêng). Trong `<Table layout="fixed">` với cột hẹp hơn 180px, nó
**phình ô ra**, đẩy các cột sau (thường là cụm ✓/✕) tràn khỏi bảng.

```tsx
// ❌ SAI — cột `width: 160` mà trigger đòi tối thiểu 180 → vỡ bố cục bảng
<Dropdown className="border-none bg-transparent p-0" options={statusOptions} searchable />

// ✅ ĐÚNG
<Dropdown className="min-w-0 border-none bg-transparent p-0" options={statusOptions} searchable />
// + cột hẹp thì hạ padding ô: cellClassName: 'px-1'
```

---

## 6. Checklist trước khi commit màn có tìm kiếm

- [ ] Không còn `.toLowerCase().includes(` — `npx eslint src` 0 error
- [ ] Từ khoá chuẩn hoá **một lần** bằng `normalizeSearch`, lọc bằng `includesNormalized`
- [ ] Lọc trên **cả mã lẫn tên** (hoặc `badge`/`meta` với Dropdown)
- [ ] Ô tìm kiếm dùng `useImeSafeSearchInput` + `useDebounce` ở tầng lọc
- [ ] Dropdown trong ô bảng hẹp có `min-w-0`
- [ ] Thử tay: gõ **không dấu** ra kết quả · gõ **CHỮ HOA** ra kết quả · gõ **mã** ra kết quả
- [ ] Thử tay: gõ liền 5-6 ký tự trong panel Dropdown — con trỏ **không** rời ô
- [ ] `npx tsc --noEmit` exit 0

---

## 7. Khi vi phạm

- `.toLowerCase().includes()` cho lọc văn bản → **block merge** (ESLint error)
- `// eslint-disable` để lách rule này → **revert**
- Chuẩn hoá một vế, quên vế kia → **revert** (lọc sai âm thầm)
- Nhét mã vào `label` thay vì `badge` để "tìm được" → fail review
- Gỡ bất kỳ lớp giữ focus nào ở `Dropdown.tsx` (§4) → **block merge**
- Unmount option không khớp từ khoá trong `Dropdown` → **revert**
- Dropdown trong ô bảng `layout="fixed"` thiếu `min-w-0` → fail review
- Feature tự viết `normalize()` / `stripDiacritics().toLowerCase()` cục bộ → **revert**
