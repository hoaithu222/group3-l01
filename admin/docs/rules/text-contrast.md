# Text Contrast & Readability Rules (BẮT BUỘC)

> Áp dụng cho **mọi text element** (`<p>`, `<span>`, `<h1>..<h6>`, `<Text>`, `<Heading>`,
> `<Label>`, cell text trong `<Table>`, form field text...) trong `src/`.
> Mục tiêu: text **nét, dễ đọc, hierarchy rõ** trên cả dark theme (chính) và light theme.
>
> Vi phạm các quy tắc đánh dấu **⛔** → **block merge**.

---

## 0. Nguyên tắc tối cao

```
1. SEMANTIC first — dùng `text-fg-{1..5}` (auto flip light/dark theme).
2. HIERARCHY rõ  — 3 cấp: primary (fg-1), secondary (fg-2/3), muted (fg-4/5).
3. NEVER raw     — cấm `text-slate-*`, `text-gray-*`, `text-zinc-*`, `text-[#hex]`;
                   `text-neutral-*` CHỈ được khi nền cùng dòng là màu đặc (§2.1).
4. TYPOGRAPHY    — luôn dùng `text-{scale}-{weight}` từ font tokens.
```

Kèm rule về padding/border → xem `visual-hierarchy.md`.
Kèm rule về màu bg → xem `color-system.md`.

---

## 1. ⛔ Token stack — chỉ dùng các bước này

### 1.1. Text foreground (dark mode)

| Token | Hex (dark) | Luminance | Ngữ cảnh dùng |
|-------|-----------|-----------|--------------|
| `text-fg-1` | `#FFFFFF` | 100% | Heading chính · KPI value · label PRIMARY |
| `text-fg-2` | `#EDF2F8` | ~95% | Sub-heading · label SECONDARY quan trọng |
| `text-fg-3` | `#D8E1EE` | ~85% | Body text · description dễ đọc |
| `text-fg-4` | `#BCC8DC` | ~78% | Muted · hint · placeholder · metadata thứ cấp |
| `text-fg-5` | `#96A6BE` | ~68% | Very muted · disabled · caption phụ · axis chart |

**KHÔNG dùng** `fg-4` cho body text chính — dùng `fg-3` (dễ đọc hơn 10lv).
**KHÔNG dùng** `fg-5` cho label form — dùng `fg-3` hoặc `fg-2`.

### 1.2. Text on colored surfaces

| Token | Ngữ cảnh |
|-------|---------|
| `text-fg-on-nav` | Text đặt trong header/nav có gradient green (cả light+dark mode) |
| `text-fg-on-nav-muted` | Muted trong header/nav |
| `text-fg-on-nav-subtle` | Subtle trong header/nav |
| `text-fg-on-nav-accent` | Nhấn (link / mục đang chọn) trong header/nav |
| `text-fg-on-popup` | Text trong popover/tooltip |
| `text-fg-on-popup-muted` | Muted trong popover |
| `text-fg-on-dialog` | Text trong modal/dialog |
| `text-fg-on-dialog-muted` | Muted trong modal |

### 1.3. Semantic status text

| Token | Dùng cho |
|-------|---------|
| `text-link` | Hyperlink · action tương tự link |
| `text-success` | Status success · pass · approved |
| `text-warning` | Status warning · pending · deadline gần |
| `text-error` | Status error · overdue · failed |
| `text-fg-5` | Text disabled (form field disabled…) — ⛔ KHÔNG có token `text-disabled`; `disabled-1` / `disabled-2` là màu NỀN |

---

## 2. ⛔ BAN LIST — cấm tuyệt đối

### 2.1. Raw Tailwind palette cho text — REVERT nếu thấy

```tsx
// ❌ SAI — bypass semantic layer, dark/light không flip đúng
<p className="text-neutral-5">Mô tả</p>
<span className="text-slate-6">Label</span>
<h4 className="text-gray-4">Tiêu đề</h4>
<label className="text-zinc-5">Trường</label>

// ✅ ĐÚNG — semantic token, tự flip
<p className="text-fg-4">Mô tả</p>
<span className="text-fg-4">Label</span>
<h4 className="text-fg-2">Tiêu đề</h4>
<label className="text-fg-3">Trường</label>
```

#### Ngoại lệ DUY NHẤT — chữ nằm trên nền màu ĐẶC

Luật trên nói về chữ đặt trên NỀN CỦA TRANG (`bg-base`, `bg-1`…), thứ lật màu
khi đổi theme. Chữ nằm trên một mảng màu ĐẶC thì khác: nền đó **không lật**, nên
chữ cũng KHÔNG được lật.

```tsx
// ✅ ĐÚNG — nút primary xanh đặc ở CẢ hai theme ⇒ chữ luôn trắng
'border border-primary-6 bg-primary-6 text-neutral-0'

// ❌ SAI — `fg-1` là ĐEN ở theme sáng ⇒ chữ đen trên nút xanh đậm
'bg-primary-6 text-fg-1'
```

Áp dụng cho: nút `variant="primary"`, `<Badge variant="solid">`, đoạn
`SegmentToggle` đang chọn, chữ trong khối gem của `SummaryCard`. Dấu hiệu nhận
biết: **cùng dòng class đã có một `bg-{màu}-{bậc}` đặc.** Không có nó thì không
phải ngoại lệ.

⚠️ Đây KHÔNG phải giấy phép dùng `text-slate-*` / `text-gray-*` / `text-zinc-*`:
những họ đó không có trong bảng token của hệ, chúng là màu mặc định của Tailwind.

### 2.2. Hardcoded hex/rgb text — CẤM

```tsx
// ❌ SAI
<p className="text-[#94A3B8]">Hint</p>
<span style={{ color: '#666' }}>Metadata</span>
<div style={{ color: 'rgba(255,255,255,0.7)' }}>Sub</div>

// ✅ ĐÚNG
<p className="text-fg-4">Hint</p>
<span className="text-fg-5">Metadata</span>
<div className="text-fg-3">Sub</div>
```

### 2.3. Semantic bên trong component ưu tiên `<Text skin>`

```tsx
// ❌ SAI — className trực tiếp khi có thể dùng skin prop
<Text className="text-fg-4">Muted</Text>

// ✅ ĐÚNG — skin prop truyền ý định rõ hơn
<Text skin="muted">Muted</Text>
<Text skin="disabled">Disabled</Text>
<Text skin="error">Lỗi</Text>
```

### 2.4. `<Text>` skin → fg-* mapping (BẮT BUỘC ghi nhớ)

| skin prop | fg-* token | Dùng cho |
|-----------|-----------|---------|
| `standard` (default) | `text-fg-1` | Text mặc định |
| `muted` | `text-fg-4` | Muted / hint |
| `disabled` | `text-fg-5` | Disabled |
| `primary` | `text-link` | Link |
| `success` | `text-success` | Success |
| `warning` | `text-warning` | Warning |
| `error` | `text-error` | Error |

---

## 3. Migration table — replace raw palette

Khi tìm thấy `text-neutral-{n}` / `text-slate-{n}` / `text-gray-{n}` / `text-zinc-{n}` trong text:

| From (raw scale) | To (semantic) | Ý nghĩa |
|-----------------|--------------|---------|
| `text-*-1` / `-2` | `text-fg-1` | Highlight / heading |
| `text-*-3` | `text-fg-2` | Secondary label |
| `text-*-4` | `text-fg-3` | Body text |
| `text-*-5` | `text-fg-4` | Muted (default) |
| `text-*-6` | `text-fg-4` | Muted (default) |
| `text-*-7` | `text-fg-5` | Very muted |
| `text-*-8` / `-9` / `-10` | `text-fg-5` | Extra muted |

**Ngoại lệ hợp lệ (được giữ nguyên `text-neutral-*`):**
- Text trên gem/gradient container **cố định màu** (vd `<SystemIcon>` bên trong `<GemIcon>` luôn dùng `text-neutral-0` → correct)
- Icon fill trong gem container cố định light/dark
- Text placeholder trong toast của kit2 (đã tính)

---

## 4. Hierarchy 3 cấp trong 1 khối text

Trong 1 card/panel/section, luôn có 3 cấp text đọc từ đầu → chi tiết:

```tsx
// ✅ ĐÚNG — 3 cấp rõ
<div className="p-2">
  <Heading size="tiny" className="text-fg-1">                {/* PRIMARY */}
    Tiêu đề chính
  </Heading>
  <Text size="small" weight="medium" className="text-fg-2">  {/* SECONDARY */}
    Sub-label quan trọng
  </Text>
  <Text size="tiny" skin="muted">                             {/* TERTIARY */}
    Metadata / mô tả phụ
  </Text>
</div>

// ❌ SAI — cùng 1 tone → mất hierarchy
<div className="p-2">
  <p className="text-fg-4">Tiêu đề</p>
  <p className="text-fg-4">Sub-label</p>
  <p className="text-fg-4">Metadata</p>
</div>

// ❌ SAI — cấp CHÍNH mà dùng muted → user không thấy quan trọng
<Heading className="text-fg-4">Tổng dự án</Heading>
```

### 4.1. Bảng chọn font-weight kết hợp fg-*

| Vai trò | Font | Skin/fg |
|---------|------|---------|
| KPI value (số nổi bật) | `text-h3-medium` hoặc `text-h4-medium` | `text-fg-1` + tone accent (green-5/blue-5...) |
| Label header panel | `text-body-14-medium` | `text-fg-1` |
| Body text | `text-body-14` | `text-fg-3` (KHÔNG fg-4) |
| Description dưới label | `text-caption-12` | `text-fg-3` hoặc `text-fg-4` (tùy density) |
| Hint / helper | `text-caption-12` | `text-fg-4` |
| Metadata uppercase (badge label...) | `text-caption-10-medium uppercase tracking-wider` | `text-fg-4` |
| Disabled input text | `text-body-14` | `text-fg-5` |

---

## 5. Form-specific text (label / hint / error)

```tsx
// ✅ ĐÚNG
<FormItem>
  <label className="text-body-14-medium text-fg-2">        {/* Label required */}
    Tên đăng nhập <span className="text-error">*</span>
  </label>
  <Input placeholder="..." />
  <p className="text-caption-12 text-fg-4">                 {/* Hint text */}
    3-20 ký tự, không dấu
  </p>
  {error && (
    <p className="text-caption-12 text-error">              {/* Error message */}
      {error.message}
    </p>
  )}
</FormItem>
```

**Quy tắc form:**
- Label field: `text-body-14-medium` + `text-fg-2` (không dùng `fg-3` cho label — quá mờ)
- Required indicator `*`: `text-error`
- Hint dưới field: `text-caption-12` + `text-fg-4`
- Error message: `text-caption-12` + `text-error`
- Placeholder (kit2 Input tự xử lý) — mặc định `fg-5`

---

## 6. Table cell text — density-aware

```tsx
// ✅ Cell chính (data value) — nét, đọc thẳng
<td className="text-body-14 text-fg-1 tabular-nums px-2 py-1.5">
  {value.toLocaleString()}
</td>

// ✅ Cell metadata (updatedAt, createdBy) — muted
<td className="text-caption-12 text-fg-4 px-2 py-1.5">
  {formatDate(row.updatedAt)}
</td>

// ✅ Header cell — bold, secondary tone (không PRIMARY để cell value nổi hơn)
<th className="text-caption-12-medium text-fg-2 uppercase tracking-wide px-2 py-2">
  Tên
</th>
```

---

## 7. Popover / Modal / Dialog — dùng `on-*` variants

```tsx
// ✅ ĐÚNG — text trong overlay dùng fg-on-* để đảm bảo contrast với bg-popup/bg-dialog
<Popover>
  <p className="text-fg-on-popup">Nội dung chính</p>
  <p className="text-fg-on-popup-muted">Mô tả phụ</p>
</Popover>

<Modal>
  <h2 className="text-fg-on-dialog">Tiêu đề modal</h2>
  <p className="text-fg-on-dialog-muted">Description</p>
</Modal>
```

---

## 8. Checklist trước khi commit

- [ ] KHÔNG còn `text-neutral-*` / `text-slate-*` / `text-gray-*` / `text-zinc-*` trên text (chỉ được phép trên non-text: icon fixed color, border...)
- [ ] KHÔNG còn `text-[#...]` / `style={{ color: '#...' }}`
- [ ] Body text chính dùng `text-fg-3` (không fg-4)
- [ ] Form label dùng `text-fg-2` (không fg-3/fg-4)
- [ ] Muted / hint dùng `text-fg-4` (không fg-5)
- [ ] Disabled dùng `text-fg-5` hoặc `<Text skin="disabled">`
- [ ] Text trong Popover/Modal dùng `text-fg-on-popup`/`text-fg-on-dialog` (không `fg-*` thường)
- [ ] Font-weight khớp bảng §4.1 (label/heading → medium; body/hint → normal)
- [ ] Hierarchy 3 cấp rõ trong mỗi khối text
- [ ] `npx tsc --noEmit` exit 0

---

## 9. Anti-patterns — danh sách đen

| ❌ Sai | ✅ Đúng |
|-------|--------|
| `<p className="text-neutral-6">Mô tả</p>` | `<p className="text-fg-4">Mô tả</p>` |
| `<span className="text-slate-4">Label</span>` | `<span className="text-fg-3">Label</span>` |
| `<label className="text-gray-5">Trường</label>` | `<label className="text-body-14-medium text-fg-2">Trường</label>` |
| `<Text className="text-fg-4">Muted</Text>` | `<Text skin="muted">Muted</Text>` |
| `<h3 className="text-fg-4">Tổng dự án</h3>` (heading muted) | `<h3 className="text-fg-1">Tổng dự án</h3>` |
| Body text dùng `text-fg-4` (quá mờ) | Dùng `text-fg-3` |
| Placeholder tự viết `text-fg-5` (kit2 xử lý) | Chỉ dùng `<Input placeholder="..." />` |
| Modal có `<p className="text-fg-4">` | `<p className="text-fg-on-dialog-muted">` |
| `style={{ color: '#94A3B8' }}` | `className="text-fg-4"` |
| `text-white` ép text luôn trắng dù theme flip | `text-fg-1` (auto flip) |

---

## 10. Khi cần thêm tone text mới

1. Đề xuất trong PR — luminance thuộc range nào?
2. Thêm vào `src/styles/theme/colors-theme.json` (cả `light` và `dark`)
3. Chạy `npm run generate:colors`
4. **KHÔNG** thêm hex tay vào CSS/TSX
5. Cập nhật rule này (bảng §1.1)

---

## 11. Cross-references

- Color tokens & bg → `color-system.md`
- Font scale (`text-{scale}-{weight}`) → `font-system.md`
- Hierarchy padding/border → `visual-hierarchy.md`
- Kit2 `<Text>` / `<Heading>` API → `reuse-first.md §3.1`
- Chart axis / label text → `chart-conventions.md`

---

## 12. Khi vi phạm

- Raw `text-neutral-*` / `text-slate-*` / `text-gray-*` trên text element → **block merge**
- `text-[#...]` / `style={{ color: '#...' }}` → **revert**
- Body text dùng `text-fg-5` (near-invisible trên navy) → fail review
- Modal có `text-fg-4` (chưa dùng `on-dialog-muted`) → fail review
- Heading dùng `text-fg-4`/`text-fg-5` (mất focus) → **revert**
