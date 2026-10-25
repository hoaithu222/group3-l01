# Keyboard Navigation — Đi giữa các ô nhập bằng bàn phím (BẮT BUỘC)

> Áp dụng cho **mọi form nhập liệu nhiều ô** trong `src/features/**`: inline edit
> trong bảng, thẻ draft/edit, form thêm nhanh, master-detail.
> Mục tiêu: nhập liệu **không rời bàn phím** — gõ xong ô này sang ngay ô kế,
> đúng hướng mắt đang nhìn, không phải với chuột.
>
> Bổ sung cho `interaction-ux.md` (§5 shortcuts) — file đó nói *có những phím
> nào*, file này nói *cài đặt ra sao cho đúng*.
>
> Vi phạm các mục đánh dấu **⛔** → **block merge**.

---

## 0. Nguyên tắc tối cao

```
1. HÌNH HỌC, KHÔNG PHẢI THỨ TỰ — ↓ đi tới ô NẰM DƯỚI trên màn hình, → đi tới
   ô NẰM BÊN PHẢI. Không suy ra từ thứ tự khai báo trong JSX.
2. KHÔNG CƯỚP PHÍM — còn sửa được chữ thì trả phím cho trình duyệt.
3. MỘT BẢN GHI = MỘT PHẠM VI — mũi tên không trượt sang dòng khác của bảng.
4. DÙNG CHUNG 1 HOOK — không tự viết lại logic điều hướng ở từng màn.
```

---

## 1. ⛔ Dùng `useArrowFieldNav` — KHÔNG tự viết

| Thứ cần | Dùng | Ở đâu |
|---------|------|-------|
| Điều hướng mũi tên giữa các ô | `useArrowFieldNav()` | `@/shared/hooks` |
| Hàm thuần: tìm ô theo hướng, đọc con trỏ | `field-nav.utils.ts` | `@/shared/utils/browser/field-nav.utils` |

```tsx
import { useArrowFieldNav } from '@/shared/hooks';

const [navRef, onNavKey] = useArrowFieldNav<HTMLDivElement>();

<div ref={navRef} onKeyDown={onNavKey}>
  <Input value={values.code} onChange={…} />
  <Input value={values.name} onChange={…} />
  <Dropdown value={values.unitId} onValueChange={…} />
</div>
```

**Quy tắc cứng:**

- `ref` và `onKeyDown` gắn vào **CÙNG một phần tử bọc ngoài** cụm ô nhập.
- Hook trả **tuple** `[ref, onKeyDown]`, KHÔNG phải object — lint rule
  `react-hooks/refs` chặn việc đọc property của object chứa ref lúc render.
  Cùng quy ước với `useElementSize`. Đặt tên khi destructure: `navRef` / `onNavKey`.
- **KHÔNG** gắn `onKeyDown` vào từng `<Input>`. Phím nổi lên (bubble) qua
  cell/row tới container, nên một handler là đủ và không phải sửa chữ ký ô nào.
- **KHÔNG** truyền thêm prop `onArrowKey`, `nextFieldRef`… xuống component con.

---

## 2. ⛔ Chọn phần tử bọc ngoài cho đúng

| Dạng form | Bọc vào | Lý do |
|-----------|---------|-------|
| Thẻ draft/edit (ô xếp DỌC) | Root div của thẻ | Cụm ô đúng bằng cái thẻ |
| Dòng bảng inline edit (ô xếp NGANG) | Div bọc riêng `<Table>` | Xem cảnh báo bên dưới |
| Form thêm nhanh 1 hàng | Chính div của hàng đó | — |

**⛔ Bọc bảng thì KHÔNG được trùm cả phân trang.** `<Pagination>` có dropdown
cỡ trang (`role="combobox"`) — trùm vào là mũi tên ↓ từ ô cuối bảng rơi xuống
đó. Tách một div riêng ôm đúng `<Table>`:

```tsx
// ✅ ĐÚNG
<div className="flex h-full flex-col">
  <div ref={navRef} className="flex min-h-0 flex-1 flex-col" onKeyDown={onNavKey}>
    <Table className="min-h-0 flex-1" … />
  </div>
  <div className="shrink-0 border-t border-divider-1">
    <Pagination … />
  </div>
</div>

// ❌ SAI — ref trùm cả Pagination
<div ref={navRef} className="flex h-full flex-col" onKeyDown={onNavKey}>
  <Table … />
  <Pagination … />
</div>
```

---

## 3. Luật điều hướng (hook lo sẵn — nắm để không sửa nhầm)

### 3.1. Ô nào tham gia?

| Loại | Tham gia | Ghi chú |
|------|----------|---------|
| `<Input>` / `<Textarea>` | ✅ | Ô dữ liệu |
| `<Dropdown>` / `<MultiSelect>` (`role="combobox"`) | ✅ | Trigger là điểm dừng |
| `<Checkbox>` / `<Radio>` | ❌ | Kit2 render thành `button role="checkbox"` — không phải dữ liệu của form |
| Nút ✓ / ✕ / xoá / chọn ký tự | ❌ | Vẫn tới được bằng **Tab** |
| `input[type=hidden]` / ô `disabled` / ô đang ẩn | ❌ | — |

Mũi tên chỉ chạy giữa **ô dữ liệu**; nút bấm là địa hạt của Tab. Đừng thêm
`<button>` thường vào selector — sẽ biến mũi tên thành Tab thứ hai.

### 3.2. Phạm vi tìm ô đích

```
Ô đang đứng nằm trong <tr>  →  chỉ tìm trong <tr> đó
Ngược lại                    →  tìm trong phần tử bọc ngoài
```

Một dòng bảng là **một bản ghi = một form**. Mỗi lúc chỉ một dòng đang sửa nên
không có ô nào ở dòng trên/dưới để đi tới — ↓/↑ trong bảng **cố ý không làm gì**.

### 3.3. ⛔ Khi nào KHÔNG cướp phím

| Tình huống | Xử lý | Vì sao |
|-----------|-------|--------|
| `e.nativeEvent.isComposing` | Trả phím | IME tiếng Việt/Nhật dùng mũi tên chọn gợi ý — cướp là mất dấu |
| Có `Ctrl` / `Alt` / `Meta` / `Shift` | Trả phím | `Ctrl+→` nhảy từ, `Shift+→` bôi đen — tổ hợp hệ thống |
| ←/→ mà con trỏ còn giữa chữ | Trả phím | Vẫn phải sửa được chữ giữa dòng |
| Đang bôi đen (selection ≠ collapsed) | Trả phím | Native xử lý thu gọn vùng chọn |
| Dropdown đang mở (`aria-expanded="true"`) | Trả phím | Mũi tên để chọn option |
| Không có ô nào về phía vừa nhấn | Trả phím | ↓ ở ô cuối thẻ → Radix tự mở dropdown |
| Target nằm ngoài DOM container (portal) | Trả phím | Popup Radix portal ra `body` nhưng event React vẫn bubble tới |

### 3.4. Luật con trỏ

| Phím | Rời ô khi | Vào ô mới ở |
|------|-----------|-------------|
| `→` | Con trỏ ở **cuối** ô, không bôi đen | Đầu ô |
| `←` | Con trỏ ở **đầu** ô, không bôi đen | Cuối ô |
| `↓` | Luôn (input 1 dòng không có dòng dưới) · `<textarea>`: đang ở dòng cuối | Đầu ô |
| `↑` | Luôn · `<textarea>`: đang ở dòng đầu | Cuối ô |

Con trỏ vào ở **mép đối diện hướng đi** để mạch gõ chạy liên tục và lần nhấn kế
tiếp không bật ngược lại ô cũ. **KHÔNG** bôi đen toàn bộ khi vào ô: user chọn ←/→
theo mép chính là để giữ khả năng sửa chữ, bôi đen sẵn sẽ phá điều đó.

### 3.5. `<Dropdown>` — đánh đổi có chủ ý

Radix Select mở danh sách bằng ↑/↓ trên trigger. Vì hook chỉ chặn khi **có** ô
theo hướng đó, hành vi thành:

| Vị trí dropdown trong form | ↓ trên trigger | ↑ trên trigger |
|---------------------------|----------------|----------------|
| Ô cuối (không có ô dưới) | Mở danh sách (Radix) | Về ô trên |
| Ở giữa | Xuống ô dưới | Về ô trên |

Mất cách "↑ để mở danh sách" — vẫn mở được bằng `Enter` / `Space` / click.
Đây là đánh đổi đã chấp nhận, **KHÔNG** phải bug.

---

## 4. Bàn phím trong form nhập liệu — bảng tổng

| Phím | Hành động | Cài ở đâu |
|------|-----------|-----------|
| `↑` `↓` `←` `→` | Đi giữa các ô | `useArrowFieldNav` |
| `Tab` / `Shift+Tab` | Đi giữa **mọi** phần tử focus được (kể cả nút ✓/✕) | Native — KHÔNG override |
| `Enter` | Lưu | Key handler của màn (`makeKeyHandler`) |
| `Shift+Enter` | Xuống dòng trong `<textarea>` — KHÔNG lưu | `makeKeyHandler` |
| `Esc` | Huỷ | `makeKeyHandler` |
| `Ctrl+→` / `Ctrl+←` | Nhảy từ trong chữ | Native — KHÔNG override |
| `Shift+→` / `Shift+←` | Bôi đen | Native — KHÔNG override |
| `Home` / `End` | Đầu/cuối ô | Native — KHÔNG override |

⛔ **`makeKeyHandler` BẮT BUỘC check `e.nativeEvent.isComposing`** trước khi
nhận `Enter` — nếu không, dấu tiếng Việt cuối câu bị nuốt (xem `interaction-ux.md §5.5`).

---

## 5. Sổ đăng ký màn đã bọc hook (cập nhật khi thêm màn mới)

Mỗi khi bọc `useArrowFieldNav` cho một màn, thêm một dòng vào bảng này. Bảng để
người sau biết chỗ nào đã có, hướng đi là dọc hay ngang, mà không phải grep.

| Màn | File | Hướng ô | Phím chạy |
|-----|------|---------|-----------|
| _(chưa có — base project)_ | — | — | — |

**Không cần bọc:** form chỉ có **một** ô nhập thì không có gì để đi. Thêm ô thứ
hai vào form đó thì mới bọc hook.

---

## 6. Anti-patterns — DANH SÁCH ĐEN

| ❌ Sai | ✅ Đúng |
|-------|--------|
| `onKeyDown` bắt mũi tên gắn trên từng `<Input>` | Một handler ở phần tử bọc ngoài |
| Tự lưu mảng `useRef` các ô rồi `refs[i+1].current.focus()` | `useArrowFieldNav` — tìm theo toạ độ |
| Điều hướng theo thứ tự khai báo JSX | Theo toạ độ thật (`findFieldInDirection`) |
| `const nav = useArrowFieldNav(); <div ref={nav.ref}>` | `const [navRef, onNavKey] = …` (lint `react-hooks/refs`) |
| `→` luôn nhảy ô, bất kể con trỏ ở đâu | Chỉ nhảy khi con trỏ ở mép ô |
| Bôi đen toàn bộ chữ khi vào ô mới | Đặt con trỏ ở mép đối diện hướng đi |
| Quên `isComposing` → gõ tiếng Việt bị nhảy ô | Check `e.nativeEvent.isComposing` (hook đã lo) |
| Chặn cả `Shift+→` / `Ctrl+→` | Có phím bổ trợ → trả phím cho native |
| Cướp mũi tên khi dropdown đang mở | Check `aria-expanded="true"` |
| `ref` container trùm cả `<Pagination>` | Div riêng ôm đúng `<Table>` (§2) |
| Thêm `<button>` thường vào `FIELD_SELECTOR` | Nút thuộc về `Tab`, không thuộc mũi tên |
| Override `Tab` để "đi cho giống mũi tên" | Tab là native — KHÔNG đụng |

---

## 7. Checklist khi thêm form nhập liệu mới

- [ ] Form có **≥ 2 ô nhập**? (1 ô thì bỏ qua hook này)
- [ ] `const [navRef, onNavKey] = useArrowFieldNav<HTMLDivElement>()`
- [ ] `ref` + `onKeyDown` gắn CÙNG một phần tử bọc ngoài
- [ ] Phần tử bọc **không** trùm phân trang / thanh lọc / ô tìm kiếm
- [ ] Ô xếp dọc → thử `↑` `↓`; ô xếp ngang → thử `←` `→`
- [ ] Gõ tiếng Việt có dấu (Telex) trong ô → **không** nhảy ô giữa chừng
- [ ] `Shift+→` vẫn bôi đen được; `Ctrl+→` vẫn nhảy từ được
- [ ] Con trỏ giữa chữ, nhấn `→` → con trỏ dời trong chữ, **không** nhảy ô
- [ ] Dropdown mở, nhấn `↓` → chạy trong danh sách, **không** nhảy ô
- [ ] `Tab` vẫn tới được nút ✓ / ✕
- [ ] Cập nhật bảng **§5** của file này
- [ ] `npx tsc --noEmit` exit 0 · `npx eslint {đường-dẫn}` 0 error

---

## 8. Khi vi phạm

- Tự viết logic điều hướng thay vì dùng `useArrowFieldNav` → **revert**
- Gắn handler mũi tên lên từng `<Input>` → **revert**
- Bỏ check `isComposing` (gõ tiếng Việt nhảy ô) → **block merge**
- Chặn `Shift+→` / `Ctrl+→` / `Tab` → **block merge**
- `ref` container trùm `<Pagination>` → fail review
- Destructure kiểu `nav.ref` thay vì tuple (lint `react-hooks/refs` đỏ) → **block merge**
- Thêm form nhập liệu mới ≥ 2 ô mà không bọc hook → fail review
- Không cập nhật bảng §5 khi thêm màn → fail review

---

## 9. Cross-references

- Shortcut tổng quát (Enter/Esc/N/E/Del), auto-focus, inline-first → `interaction-ux.md`
- IME an toàn cho ô tìm kiếm → `ime-safe-input.md`
- Kit2 `<Input>` / `<Dropdown>` API → `reuse-first.md §3`
- Hook thuần & giới hạn dòng file → `clean-code-standards.md`
- Nguồn: `src/shared/hooks/input/useArrowFieldNav.ts` · `src/shared/utils/browser/field-nav.utils.ts`
