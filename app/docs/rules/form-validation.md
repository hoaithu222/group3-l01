# Form và kiểm dữ liệu

React Hook Form + Zod, nối bằng `useZodForm` (`@/shared/form/useZodForm`).

```tsx
const form = useZodForm(loginSchema, {
  defaultValues: { email: '', password: '' },
});

const submit = form.handleSubmit((values) => login(values));
```

Kiểu của form **suy ra từ schema**, nên không có chỗ nào để hai bên lệch nhau:
thêm một trường vào schema là TypeScript đòi xử lý nó ở form ngay.

## `mode: 'onTouched'` — đã đặt sẵn, đừng đổi tuỳ tiện

Trên di động, **thời điểm** hiện lỗi quan trọng hơn hẳn trên web:

| Chế độ          | Vấn đề                                                                                      |
| --------------- | ------------------------------------------------------------------------------------------- |
| `onChange`      | Báo "Email không đúng định dạng" từ ký tự đầu tiên, lúc còn đang gõ dở. Đọc ra như bị mắng. |
| `onSubmit`      | Gõ hết form, bấm gửi, rồi mới biết ô đầu sai — mà ô đó có thể đã cuộn khuất.                |
| **`onTouched`** | Báo khi RỜI ô. Đúng nhịp: đã gõ xong ô đó và đang chuyển sang ô kế.                         |

`reValidateMode: 'onChange'` để lỗi đã hiện biến mất NGAY lúc sửa đúng.

## Thông báo lỗi tiếng Việt

`configureZodLocale()` gọi một lần ở `AppProviders`, TRƯỚC khi bất kỳ schema nào
được `parse`. ⛔ Đừng chuyển nó vào `useEffect`: effect chạy sau lần vẽ đầu, mà
màn đăng nhập đã kịp kiểm dữ liệu — lỗi ĐẦU TIÊN người dùng thấy sẽ là tiếng
Anh, các lỗi sau mới tiếng Việt. Sai kiểu "chỉ lần đầu" là loại khó tái hiện nhất.

Chỉ viết `message` cho luật RIÊNG của nghiệp vụ; phần còn lại đã có bản dịch.

## `.trim()` trên mọi trường chuỗi

⛔ Bàn phím di động **tự chèn một dấu cách** sau khi người dùng nhận gợi ý tự
động hoàn thành — hành vi mặc định trên cả iOS lẫn Android. Không cắt thì
`"a@b.com "` trượt kiểm định dạng, và người dùng nhìn ô nhập thấy đúng y nguyên
nên không hiểu vì sao báo sai.

## Mật khẩu: ĐĂNG NHẬP và ĐẶT MỚI có luật khác nhau

```ts
const loginPassword = z.string().min(1);              // chỉ kiểm "đã nhập chưa"
const newPassword = z.string().min(8).regex(...);     // luật độ mạnh
```

⛔ Đừng áp luật độ mạnh ở màn ĐĂNG NHẬP. Người dùng cũ có thể có mật khẩu đặt
từ trước khi luật hiện tại ra đời; chặn ở client là họ **không đăng nhập được
vào chính tài khoản của mình**, và không có cách nào tự thoát.

## Gắn lỗi vào ĐÚNG trường

```ts
.refine((v) => v.password === v.confirmPassword, {
  message: 'Mật khẩu nhập lại không khớp',
  path: ['confirmPassword'],        // ⛔ không bỏ dòng này
});
```

Lỗi ở tầng form nổi lên đầu màn hình, mà lúc đó bàn phím đang che mất — người
dùng không thấy gì và tưởng nút bấm hỏng.

## Lỗi từ máy chủ hiện TRONG form, không phải toast

Sai mật khẩu, tài khoản bị khoá, e-mail đã tồn tại — đó là lỗi thuộc về form và
phải còn nguyên trên màn hình trong lúc người dùng sửa lại. Toast tự tắt sau 4
giây. Vì vậy `authService.login` bật `skipErrorToast` và hook trả về
`errorMessage` dạng chuỗi đã dịch. Xem `LoginScreen.tsx`.
