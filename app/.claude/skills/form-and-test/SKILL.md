---
name: form-and-test
description: Làm FORM (React Hook Form + Zod 4) và VIẾT TEST (Jest + Testing Library) trong base React Native này. Dùng khi người dùng nói "làm form…", "thêm ô nhập có kiểm dữ liệu", "validate…", "viết test cho…", "test bị đỏ", hoặc khi thêm schema Zod. Chứa luật hiện lỗi đúng nhịp trên di động và ba cái bẫy khiến test đỏ nhầm hoặc xanh giả.
---

# Form và test

Đọc `base-rules` trước. Tài liệu nền: `docs/rules/form-validation.md` ·
`docs/rules/testing.md`. Mẫu hoàn chỉnh: `src/features/auth/`.

---

# Phần 1 — Form

```tsx
const form = useZodForm(loginSchema, { defaultValues: { email: '', password: '' } });
const submit = form.handleSubmit((values) => login(values));

<FormInput control={form.control} label="Email" name="email" />;
```

Kiểu của form **suy ra từ schema** — thêm một trường vào schema là TypeScript
đòi xử lý nó ngay, không có chỗ để hai bên lệch nhau.

## Bốn luật, mỗi luật đều đã hỏng thật

1. **`mode: 'onTouched'` đã đặt sẵn — đừng đổi tuỳ tiện.** `onChange` báo lỗi
   từ ký tự đầu tiên (đọc ra như bị mắng); `onSubmit` bắt gõ hết form rồi mới
   nói ô đầu sai, mà lúc đó ô đó đã cuộn khuất. `onTouched` báo khi RỜI ô.

2. **`.trim()` trên MỌI trường chuỗi.** Bàn phím di động tự chèn một dấu cách
   sau khi người dùng nhận gợi ý tự động hoàn thành. Không cắt thì `"a@b.com "`
   trượt kiểm định dạng, mà nhìn ô nhập vẫn thấy đúng y nguyên.

3. **Mật khẩu ĐĂNG NHẬP chỉ kiểm "đã nhập chưa".** ⛔ Đừng áp luật độ mạnh ở
   màn đăng nhập: người dùng cũ có mật khẩu đặt từ trước khi luật ra đời, chặn ở
   client là họ không vào được chính tài khoản của mình và không có cách tự thoát.

4. **Gắn lỗi vào ĐÚNG trường** bằng `path: ['confirmPassword']`. Lỗi ở tầng form
   nổi lên đầu màn hình — nơi bàn phím đang che — nên người dùng không thấy gì và
   tưởng nút bấm hỏng.

## Lỗi máy chủ hiện TRONG form, không phải toast

Sai mật khẩu, tài khoản bị khoá, e-mail đã tồn tại: phải còn nguyên trên màn
hình trong lúc người dùng sửa. Toast tự tắt sau 4 giây. Vì vậy service bật
`skipErrorToast` và hook trả `errorMessage` đã dịch — xem `LoginScreen.tsx`.

## Thông báo tiếng Việt

`configureZodLocale()` gọi MỘT lần ở `AppProviders`, trước mọi lượt `parse`.
⛔ Đừng chuyển vào `useEffect`: effect chạy sau lần vẽ đầu, lỗi ĐẦU TIÊN người
dùng thấy sẽ là tiếng Anh còn các lỗi sau mới tiếng Việt — loại sai "chỉ lần
đầu" khó tái hiện nhất.

Chỉ viết `message` cho luật RIÊNG của nghiệp vụ; phần còn lại đã có bản dịch.

---

# Phần 2 — Test

```bash
npm test                      # tất cả
npx jest tests/ui/button      # một file
```

## Ba cái bẫy

1. **`render()` là BẤT ĐỒNG BỘ (RNTL 14) — phải `await`.** Quên thì mọi truy vấn
   báo _"`render` function has not been called"_, một thông báo chỉ sai hướng
   hoàn toàn.

2. **⛔ `toHaveStyle` luôn đỏ.** Biên dịch Tailwind là việc của Metro, Jest
   không chạy Metro ⇒ `style` của element **rỗng**. Test HÀNH VI: bấm được
   không, khoá đúng lúc không, có nhãn cho trình đọc màn hình không, callback có
   được gọi đúng một lần không.

3. **Component gọi `useSafeAreaInsets()` phải bọc `SafeAreaProvider` kèm
   `initialMetrics`.** Thiếu `initialMetrics` thì trong Jest không có tầng
   native nào đo được và provider chờ `onLayout` mãi mãi. Mẫu:
   `tests/ui/bottom-nav.test.tsx`.

⚠️ Bản 14 đã BỎ `toHaveAccessibilityState` — dùng `toBeBusy()`, `toBeDisabled()`,
`toBeSelected()`.

## Nên test cái gì

Ưu tiên chỗ **sai thì im lặng**: ba nhánh refresh token · nơi cất refresh token ·
so khớp bỏ dấu tiếng Việt · giải UTF-8 trong JWT · bẫy múi giờ khi gửi ngày ·
`PATHS` khớp file route · ngưỡng lineHeight cho dấu tiếng Việt.

⛔ Đừng test lại thứ TypeScript đã bảo đảm.
⛔ Đừng snapshot cả màn hình — nó đỏ ở mọi thay đổi chữ nghĩa, rồi người ta `-u`
cho qua và test mất luôn tác dụng.

## Hai cấu hình đừng đụng nếu chưa hiểu

- `resolver: 'react-native-worklets/jest/resolver'` — thiếu là MỌI suite chết
  ngay lúc nạp với `Cannot read properties of undefined (reading 'loadUnpackers')`.
- `transform` phải TRẢI `expoPreset.transform` vào: khai `transform` sẽ GHI ĐÈ
  chứ không gộp.

## Xong việc

```bash
npm run check
```
