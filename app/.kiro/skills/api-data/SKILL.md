---
name: api-data
description: Gọi API và quản lý dữ liệu máy chủ trong base React Native này — axios + React Query 5. Dùng khi người dùng nói "gọi API…", "lấy dữ liệu…", "kết nối backend", khi thêm endpoint hay hook query/mutation, khi đụng tới xác thực 401/refresh token, hoặc khi lỗi API hiển thị sai chỗ (toast hai lần, hoặc không hiện gì). Chứa ba tầng bắt buộc và các cạm bẫy của interceptor.
---

# Gọi API

Đọc `base-rules` trước. Tài liệu nền: `docs/rules/api-patterns.md`.
Mẫu hoàn chỉnh để chép cấu trúc: `src/core/api/auth/`.

## Ba tầng, không được rút gọn

```
{ten}.api.ts       hằng số đường dẫn — grep một lần là thấy hết mặt tiếp xúc backend
{ten}.service.ts   async, bọc apiClient, CHUẨN HOÁ tên trường của backend
{ten}.queries.ts   hook React Query: cache · trạng thái tải · thử lại · làm mới
```

Lý do tách: backend đổi tên trường (`access_token` → `accessToken` — đã xảy ra)
thì **chỉ `service.ts` phải sửa**.

⛔ Component không gọi `apiClient` trực tiếp. Luôn đi qua hook trong `queries/`.

## Interceptor đã làm sẵn — ⛔ đừng làm lại

`src/core/api/client.ts` lo tập trung:

- gắn `Authorization` từ access token trong bộ nhớ;
- xoá `Content-Type` khi body là `FormData` (thiếu là upload hỏng);
- serialize mảng thành `key=a&key=b` (model binder .NET không nhận `key[]=`, và
  nó trả danh sách RỖNG chứ không báo lỗi);
- bắt **lỗi nghiệp vụ kèm HTTP 2xx** (`{ status: false }`) rồi reject;
- làm mới token khi 401, **có xếp hàng** để 5 request cùng 401 chỉ sinh MỘT lượt refresh;
- toast lỗi **đúng một lần**, câu tiếng Việt map từ mã lỗi backend.

Viết lại mấy việc trên ở tầng feature là nguồn của lỗi "toast hiện hai lần".

## Ba cờ cho từng request

```ts
apiClient.get(url, { skipErrorToast: true }); // caller tự hiện lỗi (form!)
apiClient.post(url, body, { skipAuthRefresh: true }); // ⛔ BẮT BUỘC cho login/refresh
apiClient.get(url, { skipBusinessErrorHandling: true }); // caller tự xử lý status:false
```

⛔ `skipAuthRefresh` cho lượt **đăng nhập** là bắt buộc. Sai mật khẩu trả 401;
thiếu cờ thì interceptor tưởng phiên hết hạn và đi làm mới token — trong khi
chưa hề có phiên nào.

## Lỗi: ai hiện, hiện ở đâu

| Loại lỗi                                            | Hiện ở đâu                                      |
| --------------------------------------------------- | ----------------------------------------------- |
| Lỗi chung (mạng, 500, 403)                          | Toast — interceptor đã lo, feature KHÔNG làm gì |
| Lỗi thuộc về FORM (sai mật khẩu, e-mail đã tồn tại) | **Trong form**, `skipErrorToast: true`          |

Toast tự tắt sau 4 giây; lỗi mà người dùng cần nhìn trong lúc sửa lại thì không
được đặt vào toast.

```ts
onError: (error) => {
  if (isErrorHandled(error)) return; // interceptor đã toast
  showToast('error', toErrorMessage(error));
};
```

⛔ Đừng ép `as AxiosError` ở tầng màn hình: ép sai thì đọc `error.response` trên
một `TypeError` sẽ ném lỗi MỚI ngay giữa lúc đang hiển thị lỗi cũ.
`toErrorMessage(unknown)` nhận mọi loại lỗi.

## queryKey

Đưa **mọi tham số ảnh hưởng tới kết quả** vào key:

```ts
queryKey: ['reports', { projectId, status, page }];
```

Thiếu một tham số thì đổi bộ lọc mà dữ liệu không đổi — người dùng đọc ra là
"bộ lọc hỏng", không ai báo là lỗi cache.

## Phiên đăng nhập — ba trạng thái, ⛔ không phải hai

`src/core/api/session.ts`:

| Kết quả refresh   | Nghĩa                               | Phải làm gì                               |
| ----------------- | ----------------------------------- | ----------------------------------------- |
| `refreshed`       | có token mới                        | chạy tiếp request                         |
| `unauthenticated` | phiên CHẾT                          | dọn store, guard tự đẩy về đăng nhập      |
| `unavailable`     | **mất sóng / server không trả lời** | ⛔ KHÔNG đăng xuất, để người dùng thử lại |

⛔ Gộp `unavailable` vào `unauthenticated` = người dùng đi thang máy mất sóng
một nhịp và bị **đá ra khỏi phiên**, mất hết dữ liệu đang nhập dở.

⛔ Refresh token chỉ được nằm trong `expo-secure-store`, không phải
`AsyncStorage` — `AsyncStorage` trên Android là SQLite đọc được bằng `adb` khi
máy đã root, còn kho khoá thì có phần cứng bảo vệ.

## Xong việc

```bash
npm run check
```

Test cho vùng này: `tests/core/session.test.ts` là mẫu — nó chạy THẬT trên kho
khoá đã mock, không bỏ qua luồng phiên.
