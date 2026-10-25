# Form Validation Rules (BẮT BUỘC)

> Quy tắc này áp dụng cho **mọi Zod schema** trong `src/` định nghĩa field bắt buộc nhập text.
> Vi phạm → whitespace-only pass validation mà không hiển thị lỗi → **block merge**.

---

## 1. ⛔ LUÔN `.trim()` trước `.min(1)` cho text field bắt buộc

**Vấn đề:** `z.string().min(1, 'Bắt buộc')` chấp nhận `"   "` (toàn khoảng trắng) vì `length > 0`.

**Giải pháp:** thêm `.trim()` trước `.min(1)` — Zod transform cắt trắng trước, rồi mới check độ dài.

```ts
// ❌ SAI — "   " vượt qua validation
code: z.string().min(1, 'Bắt buộc'),
name: z.string().min(1, 'Tên là bắt buộc').max(200),

// ✅ ĐÚNG — "   " bị trim → "" → fail min(1)
code: z.string().trim().min(1, 'Bắt buộc'),
name: z.string().trim().min(1, 'Tên là bắt buộc').max(200),
```

> **Side-effect có ích:** giá trị submit sẽ được trim tự động — không cần `values.name.trim()` ở service layer.

---

## 2. KHÔNG trim — Danh sách trường hợp ngoại lệ

| Loại field | Lý do KHÔNG trim |
|-----------|-----------------|
| `password`, `confirmPassword` | Khoảng trắng là ký tự hợp lệ trong mật khẩu |
| `token`, `refreshToken` | Giá trị programmatic — trim có thể làm hỏng |
| `unitId`, `accountId`, dropdown ID | Select/programmatic value — không phải text tự nhập |
| Date picker fields (`startDate`, `endDate`, `date`) | Giá trị từ picker, không phải text input |
| Color picker values | Giá trị từ picker |
| `timezone`, `dateFormat`, `weekStart`... | Dropdown-selected, không tự nhập |

```ts
// ✅ OK — giữ nguyên không trim
// Mật khẩu: 8–128 ký tự, khớp chính sách MỘT chỗ của BE (`newPasswordSchema`) — dùng `passwordField()`.
password: z.string().min(8, 'Mật khẩu tối thiểu 8 ký tự').max(128, 'Mật khẩu tối đa 128 ký tự'),
token: z.string().min(1, 'Token không hợp lệ'),
unitId: z.string().min(1, 'Chọn đơn vị'),
startDate: z.string().min(1, 'Chọn ngày'),
```

---

## 3. Pattern chuẩn cho từng loại field

> ✅ **Có sẵn helper — ưu tiên dùng thay vì gõ tay chuỗi `.trim().min(1)`:**
> `src/shared/utils/validation/validators.utils.ts` export
> `requiredText` · `optionalText` · `emailField` · `optionalEmailField` ·
> `phoneField` · `optionalPhoneField` · `ipv4Field` · `ipv4WithPortField` ·
> `urlField` · `passwordField` · `strongPasswordField` · `percentField` ·
> `positiveIntField` · `ensureRangeOrder` · `buildCodeSet`.
> `requiredText(msg)` = `z.string().trim().min(1, msg)`; `emailField()` dùng
> regex chặt hơn `.email()` mặc định của Zod. Các mẫu dưới đây là dạng khai
> tường minh — cùng ngữ nghĩa, dùng khi cần chuỗi bất thường.

### Text input bắt buộc
```ts
code: z.string().trim().min(1, 'Mã là bắt buộc').max(50, 'Tối đa 50 ký tự'),
name: z.string().trim().min(1, 'Tên là bắt buộc').max(200, 'Tối đa 200 ký tự'),
```

### Email input
```ts
email: z
  .string()
  .trim()
  .min(1, 'Email là bắt buộc')
  .email('Email không đúng định dạng'),
```

### Text area bắt buộc
```ts
content: z.string().trim().min(1, 'Nội dung là bắt buộc'),
summary: z.string().trim().min(1, 'Trích yếu là bắt buộc'),
```

### Text input tùy chọn (optional — trim nhưng không min)
```ts
description: z.string().trim().max(500).optional().default(''),
phoneNumber: z.string().trim().optional().default(''),
```

### KHÔNG dùng `.refine` thủ công để check whitespace
```ts
// ❌ SAI — dài dòng, không nhất quán
name: z.string().min(1, 'Bắt buộc').refine(v => v.trim().length > 0, 'Không được chỉ khoảng trắng'),

// ✅ ĐÚNG — ngắn gọn, đủ
name: z.string().trim().min(1, 'Bắt buộc'),
```

---

## 4. Check trùng mã (duplicate code) — dùng `handleConfirm` + `form.setError`

Khi cần validate trùng mã với danh sách đã có (server-side hoặc FE-side):

```tsx
// ── Trong component ──────────────────────────────────────────
const existingCodes = useMemo(
  () =>
    new Set(
      allItems
        .filter((u) => u.id !== editingItem?.id) // loại trừ chính nó khi edit
        .map((u) => u.code.trim().toUpperCase())
    ),
  [allItems, editingItem?.id]
);

const handleConfirm = async (values?: FormValues) => {
  if (!values) return;
  if (existingCodes.has(values.code.trim().toUpperCase())) {
    form.setError('code', { message: 'Mã đã được sử dụng' });
    throw new Error('duplicate_code'); // ngăn FormModal đóng
  }
  await onConfirm(values);
};
```

**Lý do throw:** trong `FormModal`, lệnh `onOpenChange?.(false)` chạy **sau**
`await onConfirm?.(data)`. Ném lỗi ở `onConfirm` là dòng đóng modal không bao
giờ tới → modal giữ nguyên, `setError` hiển thị lỗi dưới field.

---

## 5. Checklist trước khi submit schema mới

- [ ] Mọi required text field người dùng tự nhập đều có `.trim().min(1, ...)`
- [ ] Password / token / programmatic ID — KHÔNG trim
- [ ] Optional text field — dùng `.trim().optional().default('')` nếu muốn clean data
- [ ] KHÔNG dùng `.refine(v => v.trim().length > 0)` — thay bằng `.trim().min(1)`
- [ ] Check trùng mã → dùng `form.setError` + `throw` trong `handleConfirm`

---

## 6. Cross-references

- Form component kit2 → `reuse-first.md §3.7` (Form system)
- Schema location → `clean-code-standards.md §4` (feature structure)
- API patterns → `api-patterns.md`
