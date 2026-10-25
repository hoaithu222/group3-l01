# Interaction UX Rules — Modal-Lite + Smart Keyboard (BẮT BUỘC)

> Áp dụng cho **mọi màn hình CRUD** trong `src/features/**`: settings, danh mục,
> master-detail, quản lý ...
> Mục tiêu: **giảm số click / phím / khoảng nhìn giữa các dòng** — trải nghiệm
> "nhập nhanh như Excel", không ngắt luồng bằng modal khi không cần.
>
> Vi phạm các quy tắc đánh dấu **⛔** → **block merge**.

Cross-references:
- Kit2 catalog: `reuse-first.md` · `kit2-architecture.md`
- Form validation: `form-validation.md`
- URL-synced state: `api-patterns.md §URL-synced Filters`
- Navigable controls: `navigable-controls.md`

---

## 0. Nguyên tắc tối cao

```
1. INLINE-FIRST     — mọi thao tác CRUD ≤ 4 field thuần văn bản/số/dropdown → sửa TẠI CHỖ, KHÔNG modal.
2. MODAL LÀ NGOẠI LỆ — chỉ dùng khi bắt buộc (form ≥ 5 field, wizard nhiều bước, upload phức tạp, xác nhận huỷ).
3. AUTO-FOCUS        — mọi modal/form/panel mở ra PHẢI focus sẵn field/hành động đầu tiên; danh sách mount PHẢI auto-select item đầu.
4. KEYBOARD-FIRST    — Enter lưu · Esc huỷ · các shortcut chuẩn ở §5. Không ép user rời bàn phím.
5. NO SILENT LOAD    — mọi async action feedback rõ ràng (button loading state, skeleton row, toast).
```

---

## 1. ⛔ Khi nào ĐƯỢC dùng Modal — Decision Table

| Tình huống | Modal? | Thay bằng |
|-----------|--------|-----------|
| Sửa 1 field (tên, mã, ký hiệu, mô tả, đơn vị) | ❌ **CẤM** | Inline edit tại dòng (double-click hoặc click cell) |
| Sửa 2-4 field text/number/dropdown đơn giản | ❌ **CẤM** | Inline draft row / inline card edit |
| Thêm 1 item với ≤ 4 field | ❌ **CẤM** | Draft row prepend đầu bảng/danh sách |
| Xoá 1/nhiều item (cần xác nhận) | ✅ CHO PHÉP | `<ConfirmDialog variant="delete">` + hook `useDeleteWithConfirm` (`@/shared/hooks`) |
| Form ≥ 5 field HOẶC có tab / accordion / conditional field | ✅ CHO PHÉP | `<FormModal>` với auto-focus (§3) |
| Wizard nhiều bước | ✅ CHO PHÉP | `<FormStepper>` trong `<Modal>` |
| Preview ảnh / file lớn | ✅ CHO PHÉP | `<ImageLightbox>` |
| Xem chi tiết ≥ 8 field read-only | ⚠️ HẠN CHẾ | Ưu tiên side-panel / route riêng; modal chỉ khi popup quick-view |
| Chọn item từ danh sách dài (asset picker, member picker) | ✅ CHO PHÉP | `<Modal>` + list search + auto-focus search box |
| Upload file có validate size/type + preview | ✅ CHO PHÉP | `<FormModal>` |
| Chỉnh sửa rich text (mô tả dài, markdown) | ✅ CHO PHÉP | Modal / side-panel |
| Cấu hình quyền nhiều permission ma trận | ✅ CHO PHÉP | Modal / route riêng |

**Rule vàng:** trước khi mở PR có thêm `<FormModal>` hoặc `useDisclosure` mới,
tự hỏi 3 câu:
1. Form có ≤ 4 field đơn giản? → dùng inline (xem §2 skeleton)
2. User có phải rời task hiện tại để mở modal không? → nếu inline được thì đừng ép rời
3. Có thao tác tuần tự (thêm liên tiếp 5 dòng) → inline nhanh hơn modal (không phải mở/đóng)

---

## 2. ⛔ Inline pattern chuẩn

### 2.1. Bắt buộc có

- **Hook riêng** `useXxxInlineEdit(...)` chứa state `editing`, `errors`, `saving` + actions `start`, `startDraft`, `change`, `save`, `cancel`
- **Sentinel id cho draft** — `export const DRAFT_XXX_ID = -1;` (BE id > 0 nên không đụng nhau)
- **Save trả về `'created' | 'updated' | false`** — page dùng để show toast phù hợp
- **Zod validate** — reuse cùng schema với modal cũ (nếu có), thêm `.trim().min(1)`
- **Duplicate check** — case-insensitive, exclude self
- **UI feedback**:
  - Dòng đang edit: `border-2 border-primary-5 bg-primary-5/6`
  - Save button: `bg-success/12 text-success`
  - Cancel button: `bg-error/12 text-error`
  - Icon size chuẩn 14px, gap giữa 2 icon ≥ `gap-1` (KHÔNG `gap-0.5`)

### 2.2. Skeleton file layout

```
src/features/{feature}/
├── hooks/
│   └── use{Feature}InlineEdit.ts     ← state hook (bắt buộc)
├── components/
│   ├── {Feature}Table.tsx / {Feature}Master.tsx   ← nhận props inline
│   └── {Feature}InlineActions.tsx     ← nút ✓/✕ tái sử dụng (nếu ≥ 2 chỗ dùng)
└── pages/
    └── {Feature}Page.tsx              ← wire hook + toast + confirm delete
```

### 2.3. Nút ✓/✕ chuẩn — copy-paste

```tsx
<div className="flex shrink-0 items-center gap-1">
  <Button
    aria-label="Lưu (Enter)"
    className="bg-success/12 text-success hover:bg-success/20"
    disabled={!canSave}
    size="sm"
    title="Lưu (Enter)"
    variant="ghost"
    onClick={(e) => { e.stopPropagation(); onSave(); }}
  >
    <SystemIcon name="check-outline" size={14} />
  </Button>
  <Button
    aria-label="Huỷ (Esc)"
    className="bg-error/12 text-error hover:bg-error/20"
    size="sm"
    title="Huỷ (Esc)"
    variant="ghost"
    onClick={(e) => { e.stopPropagation(); onCancel(); }}
  >
    <SystemIcon name="xmark-outline" size={14} />
  </Button>
</div>
```

---

## 3. ⛔ Auto-focus & Auto-select — BẮT BUỘC

### 3.1. Modal

Modal mở ra → PHẢI focus:
- Field required **đầu tiên** trong form (kit2 `<TextField autoFocus>` hoặc `useEffect` + ref)
- Nếu form có sẵn dữ liệu edit → focus field **user thường sửa nhất** (name / label), KHÔNG field id/code
- Nếu là confirm dialog → focus nút cancel (không phải nút xoá — tránh nhầm)

### 3.2. List picker modal (chọn member, đơn vị, project...)

- Focus vào ô search
- Preselect item **đầu tiên** trong danh sách (highlight bằng `bg-primary-5/15`)
- ↑↓ điều hướng, Enter chọn, Esc đóng
- Search input dùng `useImeSafeSearchInput` (xem `ime-safe-input.md`)

### 3.3. Master-Detail page

Trang master-detail (danh mục, người dùng, tài liệu…) khi mount hoặc khi
danh sách master nạp xong PHẢI:
- Auto-select item **đầu tiên** trong danh sách vào detail panel
- Nếu URL có `?id=xxx` → dùng id đó thay
- Panel detail KHÔNG BAO GIỜ mở ở trạng thái "chưa chọn gì" khi danh sách không rỗng

```tsx
// ✅ ĐÚNG — auto-select first
useEffect(() => {
  if (!selectedId && items.length > 0) setSelectedId(items[0].id);
}, [items, selectedId]);
```

### 3.4. Inline edit row

- Khi bấm cell / nút pen → focus vào **đúng field vừa click**
- Khi bấm "Thêm" (draft) → focus vào field required đầu tiên (thường `code` hoặc `name`)
- Cell inline sau khi save thành công → focus quay lại **cell name** của dòng vừa lưu (để đối chiếu)

### 3.5. Callback ref pattern chuẩn

```tsx
// Module-scope — stable identity, focus 1 lần khi mount
const focusEl = (el: HTMLElement | null) => el?.focus();

// Trong cell/field
<Input ref={focusField === 'code' ? focusEl : undefined} ... />
```

---

## 4. ⛔ Auto-select item đầu tiên — Master-Detail

Cấm để trang master-detail load lên chỉ hiện danh sách với "Chưa chọn mục nào".
User đã mở trang → 99% muốn xem NGAY 1 item.

| Trạng thái | Xử lý |
|-----------|-------|
| Danh sách rỗng | EmptyState + CTA "Thêm ..." |
| Có ≥ 1 item, chưa chọn | Auto-select item **đầu** |
| URL có `?id=xxx` | Ưu tiên URL, fallback item đầu nếu id không tồn tại |
| Xoá item đang chọn | Auto-select item liền kề (item[index-1] nếu có, nếu không thì item[0]) |
| Nạp dữ liệu mới (filter/search) | Giữ item đã chọn nếu vẫn trong danh sách, không thì auto-select item đầu |

---

## 5. ⛔ Keyboard shortcuts chuẩn

### 5.1. Global (trong bảng / danh sách)

| Phím | Hành động | Ghi chú |
|------|-----------|---------|
| `N` | Thêm mới (start draft) | Chỉ khi list focused và không đang edit |
| `E` | Sửa item đang chọn | |
| `Delete` | Xoá (mở confirm dialog) | Không xoá thẳng |
| `↑ / ↓` | Điều hướng item trước / sau | Loop khi đến biên |
| `Enter` | Xem chi tiết / mở panel detail (nếu master-detail) | |
| `/` hoặc `Ctrl+K` | Focus search box | |
| `Esc` | Bỏ chọn / đóng panel phụ | |

### 5.2. Inline edit

| Phím | Hành động |
|------|-----------|
| `Enter` | Save (không có Shift, không đang IME compose) |
| `Shift+Enter` | Xuống dòng trong textarea (KHÔNG save) |
| `Esc` | Cancel |
| `Tab` | Sang field kế tiếp trong cùng dòng |
| `Shift+Tab` | Về field trước |
| `Ctrl+Enter` | Save + start draft dòng mới (batch-add, tuỳ tính năng) |

### 5.3. Modal

| Phím | Hành động |
|------|-----------|
| `Enter` | Submit form (nếu trong text field) hoặc trigger primary button |
| `Esc` | Đóng modal (trigger `onOpenChange(false)`) |
| `Ctrl+Enter` | Submit form (từ textarea) |
| `Ctrl/⌘+S` | Lưu — dùng hook `useSaveShortcut(onSave)` từ `@/shared/hooks` |
| `Tab` | Focus trap trong modal — Radix Dialog xử lý sẵn |

### 5.4. Confirm dialog

| Phím | Hành động |
|------|-----------|
| `Enter` | Confirm | ⚠️ RỦI RO — chỉ enable khi confirm KHÔNG destructive. Với delete → focus vào Cancel, user phải Tab qua Confirm rồi Enter |
| `Esc` | Cancel |

### 5.5. Skeleton code — key handler

```ts
// hooks/useInlineKeyHandler.ts (dùng chung — tạo shared khi lặp lại ≥ 2 nơi)
export const makeInlineKeyHandler =
  (onSave: () => void, onCancel: () => void) =>
  (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
      return;
    }
    if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return;
    e.preventDefault();
    onSave();
  };
```

**⛔ Quan trọng:** LUÔN check `e.nativeEvent.isComposing` — Vietnamese IME
(Telex/VNI) dùng Enter để xác nhận dấu; nếu save luôn → mất dấu cuối.

---

## 6. Modal ĐÃ CẦN — checklist thiết kế UX

Khi buộc phải dùng modal:

- [ ] `<FormModal>` (kit2) — không tự dựng dialog
- [ ] Title mô tả rõ hành động: "Thêm nhóm người dùng" thay vì "Nhóm mới"
- [ ] `size` phù hợp: 1-2 col field → `sm`; 2-3 col + nhiều field → `md`; wizard → `lg`
- [ ] Field đầu **required** có `autoFocus`
- [ ] Submit button label rõ: "Lưu thay đổi" / "Thêm nhóm" (KHÔNG chỉ "Lưu" / "OK")
- [ ] Cancel label: "Huỷ bỏ" (KHÔNG "Đóng")
- [ ] Enter → submit (kit2 FormModal handle sẵn)
- [ ] Esc → close (kit2 handle sẵn, KHÔNG override)
- [ ] Nếu form dirty + user close → `useDirtyGuard` (`@/shared/ui` form hooks) cảnh báo trước khi mất dữ liệu
  - `<Form dirtyGuard>` chỉ mount blocker khi bật, và chỉ chặn khi ĐỔI PATHNAME (đổi `?tab=`/`?page=` không bị chặn).
    Router chỉ hỗ trợ MỘT blocker (đăng ký sau cùng thắng) — đừng bật `dirtyGuard` cho nhiều form cùng một trang.
- [ ] Duplicate check bằng `form.setError` + `throw` (KHÔNG close modal khi lỗi)
- [ ] Loading state khi submit — disable form + button spinner
- [ ] Error inline dưới từng field (Zod message), KHÔNG chỉ toast

---

## 7. Anti-patterns — DANH SÁCH ĐEN

| ❌ Sai | ✅ Đúng |
|-------|--------|
| Modal cho sửa 1 field "đổi tên nhóm" | Inline edit tại dòng (double-click → input) |
| Modal 2 field code+name cho "Thêm nhóm" | Draft row prepend đầu list |
| Master-detail load xong hiển thị "Chưa chọn item nào" | Auto-select item[0] |
| Modal mở KHÔNG focus field nào | `<TextField autoFocus>` hoặc ref+useEffect |
| Confirm delete auto-focus nút "Xoá" | Focus nút "Huỷ" — user phải Tab để confirm destructive |
| Inline save fire Enter luôn mà không check `isComposing` | Check `e.nativeEvent.isComposing` trước |
| Icon action `gap-0.5` (2px) giữa pen + trash | `gap-1` (4px) tối thiểu |
| Nút ✓/✕ inline không có tooltip/aria-label | `title="Lưu (Enter)"` + `aria-label="Lưu"` |
| Nút xoá + Enter phím tắt cho save cùng dòng cell | Tách rõ: Enter = save cell, Delete = xoá row (chỉ khi row focused, không phải cell) |
| Enter trong textarea inline lại submit form | `Shift+Enter` xuống dòng, `Ctrl+Enter` submit; Enter alone chỉ xuống dòng |
| Modal picker list mount mà không preselect item[0] | Preselect + highlight item đầu |
| Modal search field không focus khi mở | Auto-focus search |
| Bảng master không hỗ trợ ↑↓ điều hướng | Bind arrow keys → `setSelectedId` |
| Xoá item xong danh sách rỗng còn để trắng | EmptyState + CTA thêm mới |

---

## 8. Checklist trước khi commit trang CRUD mới

### Inline / Modal decision
- [ ] Đã đọc §1 decision table — nếu là modal, có justify trong PR không?
- [ ] Form ≤ 4 field → dùng inline hook `useXxxInlineEdit`
- [ ] Không có `<FormModal>` cho create/edit đơn giản

### Auto-focus / Auto-select
- [ ] Master list auto-select item[0] khi mount (nếu không rỗng)
- [ ] Modal mở → focus field required đầu tiên
- [ ] Confirm dialog delete → focus nút Cancel
- [ ] Draft row → focus field đầu tiên (`code` hoặc `name`)
- [ ] Click cell / pen → focus đúng field click

### Keyboard
- [ ] Inline: Enter save, Esc cancel — check `isComposing` cho IME
- [ ] Modal: Enter submit, Esc close
- [ ] Master list: ↑↓ điều hướng nếu là danh sách chính của trang
- [ ] Textarea inline: Shift+Enter xuống dòng (không submit)

### Visual feedback
- [ ] Dòng đang edit: `border-2 border-primary-5 bg-primary-5/6`
- [ ] Save button: `bg-success/12 text-success`, Cancel: `bg-error/12 text-error`
- [ ] Icon action gap ≥ `gap-1` (4px), KHÔNG `gap-0.5`
- [ ] Loading state khi save/delete — spinner hoặc disabled + label change

### Verification
- [ ] `npx tsc --noEmit` exit 0
- [ ] `npx eslint {feature-path}` — 0 errors
- [ ] Thử tay: gõ tiếng Việt trong ô inline → dấu không mất
- [ ] Thử tay: F5 khi đang edit → không mất data (nếu spec yêu cầu draft-persist, thêm `useFormDraft`)

---

## 9. Khi vi phạm

- Form ≤ 4 field mới đưa vào `<FormModal>` mà KHÔNG justify → **revert**, chuyển inline
- Master-detail không auto-select item[0] → **block merge**
- Modal mở không auto-focus field → fail review
- Inline save không check `isComposing` (mất dấu tiếng Việt) → **block merge**
- Icon action `gap-0.5` (dưới 4px) → fail review
- Confirm delete auto-focus nút "Xoá" → **block merge** (nguy hiểm, dễ Enter nhầm)
- Master list KHÔNG hỗ trợ ↑↓ khi là bảng chính của trang → fail review

---

## 10. Migration path cho page hiện có

Khi refactor 1 trang từ modal → inline:

1. **Đọc §2 skeleton + §5 bàn phím** — pattern reference
2. **Tạo `useXxxInlineEdit.ts`** — theo cấu trúc ở §2.1
3. **Rewrite table/master** — thêm props `editingId`/`editValues`/`editErrors`/`editSaving`/callbacks
4. **Cell → editable div** — click → gọi `onCellEdit(row, field)`
5. **Prepend draft row** — khi `editingId === DRAFT_XXX_ID`
6. **Xoá modal component + import** — sạch codebase
7. **Verify tsc + eslint 0 error**

Ngưỡng "modal → inline" đáng chuyển:
- Form ≤ 4 field VÀ ≤ 1 dropdown VÀ không có file upload
- User thao tác lặp lại nhiều lần (thêm 10 items một lần) → inline lợi hơn hẳn
