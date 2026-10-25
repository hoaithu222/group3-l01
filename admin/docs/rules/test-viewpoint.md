# Test Viewpoint — Bảo mật & Non-functional (BẮT BUỘC check trước khi ship)

> Biến checklist QA thành luật code ngay từ đầu — rẻ hơn nhiều so với để QA
> tìm ra sau. Bổ sung `form-validation.md` (validate) và `api-patterns.md`
> (URL-synced state) — file này tập trung phần BẢO MẬT/NON-FUNCTIONAL chưa
> có rule riêng.

## 1. Validate ở biên — Zod cho MỌI input người dùng

Mọi form field bắt buộc dùng Zod schema (`docs/rules/form-validation.md`).
Không tin dữ liệu từ URL query param / localStorage / postMessage mà không
validate lại — đây đều là biên mà người dùng (hoặc extension độc hại) có thể
thao túng trực tiếp.

## 2. Upload — guard TRƯỚC khi gửi lên server

```ts
import { validateFileStrict } from '@/shared/utils/validation/upload-guards';
```

Kiểm kích thước/loại file/độ dài tên/phần mở rộng nguy hiểm TRƯỚC khi gọi
API upload — không dựa hoàn toàn vào validate phía server (UX tệ khi phải
chờ round-trip mới biết file sai, và server có thể không tồn tại trong 1 base
template). `validateImageDimensions` cho case cần giới hạn kích thước ảnh.

## 3. XSS — không có `dangerouslySetInnerHTML` không kiểm soát

Hiện codebase **chưa dùng** `dangerouslySetInnerHTML` ở đâu — giữ nguyên như
vậy. Nếu bắt buộc phải render HTML động (rich text, nội dung từ API bên thứ
3...), PHẢI sanitize qua thư viện chuyên dụng (vd. DOMPurify) trước khi render,
không render thẳng chuỗi HTML từ API.

## 4. Token/phiên đăng nhập — đã đúng chuẩn, đừng đổi ngược

Refresh token đã lưu qua **cookie HttpOnly** (`src/core/api/session.ts`) —
JS phía client KHÔNG đọc/ghi trực tiếp được, chống XSS đánh cắp token. Access
token ngắn hạn (nếu có) mới ở bộ nhớ client. **KHÔNG** chuyển refresh token
sang `localStorage`/`sessionStorage` dù để "tiện debug" — đây là hồi quy bảo
mật thật, không phải style choice.

## 5. Thông báo lỗi — không để lộ thông tin giúp dò user/email

Khi có tính năng đăng nhập/quên mật khẩu: thông báo sai username/password
PHẢI đồng nhất ("sai tài khoản hoặc mật khẩu", không phân biệt "user không
tồn tại" vs "sai mật khẩu"). Tương tự "quên mật khẩu": luôn trả lời kiểu "nếu
email tồn tại, chúng tôi đã gửi link" — không tiết lộ email có tồn tại trong
hệ thống hay không.

## 6. Console log — chỉ bật ở dev, không log token/PII

```ts
if (import.meta.env.DEV) console.log(...);
```

KHÔNG log token, mật khẩu, thông tin cá nhân nhạy cảm ra console dù chỉ ở
dev — dễ vô tình lọt vào screenshot/screen-share/bug report.

## 7. Multi-tab & offline — đừng để user "fail âm thầm"

- Đăng xuất ở 1 tab → đồng bộ sang các tab khác (`useMultiTabSync` có sẵn ở
  `@/shared/hooks/dom`), không để tab khác tưởng vẫn còn phiên hợp lệ.
- Mất mạng khi đang thao tác → báo rõ (`useNetworkStatus` có `wasOffline`),
  không để form "gửi mà không biết có thành công hay không".
- Rời trang khi form đang dở (dirty) → `useBeforeUnload`/`useDirtyGuard`
  cảnh báo trước khi mất dữ liệu chưa lưu.

## 8. Checklist theo hành động nút bấm

| Hành động | Bắt buộc |
|---|---|
| Thêm/Sửa | Check trùng dữ liệu TRƯỚC khi gọi API mutate nếu có ràng buộc unique |
| Xoá | `ConfirmDialog variant="delete"`, KHÔNG `window.confirm()`. Autofocus **Cancel**, không autofocus nút xoá |
| Đóng modal khi đang dở form | `useDirtyGuard()` — hỏi xác nhận trước khi đóng nếu có thay đổi chưa lưu |
| Export file | Đặt tên file có timestamp, tránh ghi đè export cũ |
| Download file có tên tiếng Việt/ký tự đặc biệt | Encode UTF-8 đúng chuẩn `Content-Disposition` (nếu tự dựng response header) |

## 9. Trước khi coi 1 PR là xong — rà nhanh

- [ ] Input tự do đã qua Zod `.trim().min()` đúng (`form-validation.md`)
- [ ] Upload (nếu có) đã qua `validateFileStrict`
- [ ] Không `dangerouslySetInnerHTML` không sanitize
- [ ] Không token/secret log ra console ở production build
- [ ] Filter/search/pagination sống trên URL (`api-patterns.md`), không
  `useState` cục bộ
- [ ] Xoá/hành động phá huỷ có `ConfirmDialog`, autofocus Cancel
- [ ] Rời trang/đóng modal khi dữ liệu chưa lưu có cảnh báo

## Liên quan

`form-validation.md` · `api-patterns.md` · `ime-safe-input.md` ·
`search-matching.md` · skill `fix` (quy trình sửa khi phát hiện lỗ hổng) ·
agent `code-reviewer` (review theo checklist này).
