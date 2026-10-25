# Navigable Controls — MỌI control ĐI TỚI TRANG phải là LIÊN KẾT THẬT (BẮT BUỘC)

> Áp dụng cho **mọi control bấm được mà kết quả là đổi trang / đổi tab / đổi URL**:
> chip nav trên thanh header, nút quay lại, tile module, item thông báo, logo,
> chip điều hướng trên header, nút "Cài đặt" mở trang cài đặt, dòng trong bảng dẫn sang trang chi
> tiết…
>
> Vi phạm các mục đánh dấu **⛔** → **block merge**.

---

## 0. Nguyên tắc tối cao

```
ĐIỀU HƯỚNG  →  <Link to="...">   (có href THẬT)
LỆNH TẠI CHỖ →  <button>          (mở modal, bật/tắt, xuất file, phóng to…)
```

Câu hỏi quyết định — **"Có một URL nào tả được màn hình sau khi bấm không?"**

| Trả lời | Phần tử | Ví dụ |
|---------|---------|-------|
| CÓ | `<Link>` + `href` | tab `?tab=data`, `/users/12/detail`, `/settings/general` |
| KHÔNG | `<button>` | mở modal Cài đặt, phóng to toàn màn, đổi theme, xoá bản ghi |

---

## 1. ⛔ Vì sao `<button>` + `navigate()` là SAI cho điều hướng

`<button onClick={() => navigate('/x')}>` chạy đúng khi bấm chuột trái — và **hỏng
toàn bộ phần còn lại** vì trình duyệt không biết đó là liên kết:

| Thao tác user | `<button>` + navigate | `<Link to>` |
|---------------|----------------------|-------------|
| Chuột PHẢI → "Mở liên kết trong tab mới" | ❌ không có mục này trong menu | ✅ |
| Ctrl/⌘ + click | ❌ đổi tab tại chỗ | ✅ tab mới |
| Chuột GIỮA | ❌ không có gì | ✅ tab mới |
| Shift + click | ❌ | ✅ cửa sổ mới |
| Hover → xem URL ở thanh trạng thái | ❌ | ✅ |
| Chuột phải → "Sao chép địa chỉ liên kết" | ❌ | ✅ |
| Ctrl + Enter khi focus bằng bàn phím | ❌ | ✅ tab mới |
| Trình đọc màn hình đọc ra | "nút" (sai vai) | "liên kết" |

Đây là lỗi ĐÃ GẶP trên thanh header: user muốn mở tab "Dữ liệu" ở cửa sổ mới để
đối chiếu với tab "Mặt bằng" đang xem, nhưng chuột phải không có lựa chọn nào.

---

## 2. ⛔ Khuôn chuẩn — giữ SPA cho click thường, nhường trình duyệt cho phần còn lại

```tsx
import { Link } from 'react-router-dom';
import { isModifiedClick } from '@/shared/utils/browser/link.utils';

const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
  // ⛔ PHẢI return SỚM — đừng preventDefault, đừng navigate.
  if (isModifiedClick(e)) return;
  e.preventDefault();
  onSelect(key);            // logic hiện có của trang: đổi state, replace URL, guard quyền…
};

<Link to={href} onClick={handleClick}>…</Link>
```

`isModifiedClick` = ⌘/Ctrl · Shift · Alt · nút chuột ≠ trái.

**Vì sao vẫn giữ `onSelect` thay vì để `<Link>` tự điều hướng:** nhiều trang cần
side-effect kèm theo (dọn query param của tab cũ, `replace: true` để không phá
history, đóng popover, chặn khi đang trình chiếu). Nhường hẳn cho `<Link>` là mất
những thứ đó. Click có phím bổ trợ thì KHÔNG chạy `onSelect` — tab mới sẽ tự dựng
lại state từ chính URL.

---

## 3. ⛔ `href` phải TRÙNG đích mà click trái đi tới

Chip hiện URL này ở thanh trạng thái mà bấm vào lại ra màn khác là **nói dối user**.

```tsx
// ❌ SAI — href rỗng/giả để "cho có"
<Link to="#" onClick={handle}>Dữ liệu</Link>

// ❌ SAI — tự nối chuỗi, XOÁ SẠCH query param khác (bộ lọc, phân trang đang đặt)
href={`${pathname}?tab=${key}`}

// ✅ ĐÚNG — giữ nguyên param khác, chỉ đổi cái cần đổi
const buildHref = useNavHref();
href={buildHref({ tab: key })}
```

Đích là ROUTE thì lấy từ CÙNG một hằng số mà `navigate()` dùng, đừng chép tay:

```tsx
const SETTINGS_PATH = '/settings/general';
const handleOpenSettings = useCallback(() => navigate(SETTINGS_PATH), [navigate]);
// …
{ key: 'settings', label: 'Cài đặt', icon: 'gear-outline',
  href: SETTINGS_PATH, onSelect: handleOpenSettings }
```

---

## 4. API sẵn có — dùng lại, đừng viết lại

| Thứ cần | Dùng | Ở đâu |
|---------|------|-------|
| Nhận biết click "mở nơi khác" | `isModifiedClick(e)` | `@/shared/utils/browser/link.utils` |
| Thuộc tính mở tab mới an toàn | `NEW_TAB_LINK_PROPS` (`target="_blank"` + `rel="noopener noreferrer"`) | `@/shared/utils/browser/link.utils` |
| Mở tab mới BẰNG CODE (không có phần tử để bấm) | `openInNewTab(href)` | `@/shared/utils/browser/link.utils` |
| Dựng URL cho tab `?tab=` (giữ param khác) | `useNavHref()` | `@/shared/hooks` |
| Chip header thành `<a>` hay `<button>` | `href` trên `PageHeaderNavItem` / `PageHeaderNavAction` / `PageHeaderChipProps` | `@/shared/widgets/header` |
| Nút quay lại của `<PageHeader>` | `backHref` | `@/shared/widgets/header` |

`ChipElement` (`page-header/chip-element.tsx`) là **nơi DUY NHẤT** quyết định chip
header render `<a>` hay `<button>`. Thêm loại chip mới thì đi qua nó, đừng tự dựng
lại nhánh `<Link>`/`<button>`.

---

## 5. Thanh header — bảng tra nhanh

| Control | Phần tử | Ghi chú |
|---------|---------|---------|
| Chip tab của module (`PageHeaderNav`) | `<a>` khi có `href` | Route riêng → path; `?tab=` → `useNavHref()` |
| `nav.actions` (vd "Cài đặt") | `<a>` nếu ĐI TỚI TRANG · `<button>` nếu mở modal | Xem §0 |
| Nút quay lại (`PageHeaderBack`) | `<a>` khi truyền `backHref` | `navigate(-1)` thì KHÔNG có href — lịch sử không phải URL |
| `Logo` | `<a href="/">` | Về trang chủ |
| Tile / card module trong trang danh sách module | `<a>` | Người dùng hay mở nhiều module ở nhiều tab |
| Dòng bảng dẫn sang trang chi tiết | `<a>` bọc cell đầu (hoặc cả row) | Chuột giữa để mở nền là thao tác rất hay dùng |
| Item thông báo trỏ tới một bản ghi | `<a>` | Ca hay cần mở tab mới nhất |
| `UserMenuTrigger` và mọi trigger popover khác | `<button>` | Mở panel, không đổi URL |
| Phóng to · đổi theme · ẩn Dock · bật TV mode | `<button>` | Lệnh tại chỗ |

---

## 6. ⛔ Tab sống ngoài URL thì KHÔNG thể có href

Chip chỉ linkable khi tab tái lập được từ URL. Tab giữ trong `useState` / Zustand
thì **không có URL nào để mở ở tab mới** — và đó cũng đã là vi phạm
`api-patterns.md §URL-synced Filters` ("tab navigation → BẮT BUỘC đẩy lên URL").

Cách sửa là **đẩy state lên URL** (`useQueryParams`), KHÔNG phải bịa một href.

Sổ nợ (tab nằm ngoài URL → chip buộc phải là `<button>`). Thêm dòng khi phát
hiện, xoá dòng khi đã đẩy lên URL:

| Màn | State tab đang ở | Cần làm |
|-----|------------------|---------|
| _(chưa có — base project)_ | — | — |

---

## 7. Anti-patterns — danh sách đen

| ❌ Sai | ✅ Đúng |
|-------|--------|
| `<button onClick={() => navigate(path)}>` cho control đi tới trang | `<Link to={path} onClick={handleClick}>` |
| `<a href="#" onClick={…}>` | `<Link to={urlThật}>` |
| `onClick={() => window.open(href)}` cho control bấm được | `<Link to={href} {...NEW_TAB_LINK_PROPS}>` |
| `target="_blank"` mà thiếu `rel="noopener noreferrer"` | `NEW_TAB_LINK_PROPS` |
| Tự khai lại `isModifiedClick` trong từng component | Import từ `@/shared/utils/browser/link.utils` |
| `e.preventDefault()` rồi mới kiểm tra phím bổ trợ | Kiểm tra TRƯỚC, `return` sớm |
| `href={`${pathname}?tab=${key}`}` (mất param khác) | `buildHref({ tab: key })` |
| Đặt `href` trên chip đang `disabled` | `<button disabled>` — `<a>` không có disabled, bàn phím vẫn đi được |
| href trỏ một đường, `onSelect` đi một nẻo | Cùng một hằng số path / cùng một builder |
| Bọc `<Link>` bằng `<button>` (hoặc ngược lại) | Một phần tử duy nhất |

---

## 8. Checklist trước khi commit

- [ ] Mọi control mới mà bấm vào ĐỔI URL đều là `<Link>`, không phải `<button>`
- [ ] `href` trùng chính xác đích của click trái (cùng path constant / cùng builder)
- [ ] Handler `return` sớm khi `isModifiedClick(e)` — TRƯỚC `preventDefault()`
- [ ] Tab `?tab=` dựng href bằng `useNavHref()` (giữ nguyên param lọc khác)
- [ ] Chip `disabled` KHÔNG có href
- [ ] `target="_blank"` luôn kèm `rel="noopener noreferrer"` (dùng `NEW_TAB_LINK_PROPS`)
- [ ] `<PageHeader onBack>` trỏ path cố định → đã truyền `backHref`
- [ ] Thử tay: chuột phải · Ctrl+click · chuột giữa trên chip → ra tab mới ĐÚNG màn
- [ ] `npx tsc --noEmit` exit 0 · `npx eslint` không thêm error mới

---

## 9. Khi vi phạm

- Control điều hướng render `<button>` + `navigate()` → **block merge**
- `<a href="#">` / `href` giả → **revert**
- `href` khác đích của `onSelect` → **revert** (chip nói dối user)
- `target="_blank"` thiếu `rel="noopener noreferrer"` → **block merge** (tabnabbing)
- Khai lại `isModifiedClick` cục bộ thay vì dùng shared util → fail review
- Thêm tab mới mà state để trong `useState`/Zustand thay vì URL → **block merge**
  (đồng thời vi phạm `api-patterns.md`)

---

## 10. Cross-references

- URL-synced filters / tab → `api-patterns.md`
- Chip header (hình khối, recipe) → `widget-composition.md` · `.../header/header.theme.ts`
- Reuse kit2 · KHÔNG raw HTML → `reuse-first.md`
- Clean code (1 file = 1 component, giới hạn dòng) → `clean-code-standards.md`
