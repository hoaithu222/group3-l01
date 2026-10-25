# Test

`jest-expo` + `@testing-library/react-native`. Chạy: `npm test`.

## ⚠️ `render()` là BẤT ĐỒNG BỘ (RNTL 14)

```tsx
const screen = await render(<Button label="Gửi" onPress={fn} />);  // ✅
const screen = render(<Button … />);                               // ❌
```

Quên `await` thì mọi truy vấn báo **"`render` function has not been called"** —
một thông báo chỉ sai hướng hoàn toàn, và rất tốn thời gian để lần ra.

Bản 14 cũng đã BỎ `toHaveAccessibilityState`. Dùng `toBeBusy()`,
`toBeDisabled()`, `toBeSelected()`.

## ⛔ Style của NativeWind KHÔNG có trong test

Biên dịch Tailwind là việc của Metro, mà Jest không chạy Metro. Element render
ra có `style` **rỗng**.

```tsx
expect(el).toHaveStyle({ padding: 16 }); // ❌ luôn đỏ
```

Test **hành vi** thay vì hình thức: bấm được không, khoá đúng lúc không, có nhãn
cho trình đọc màn hình không, gọi đúng callback không. Đó cũng là những thứ hay
hỏng thật; còn màu và khoảng cách thì nhìn bằng mắt trên máy nhanh hơn và chắc
hơn.

Hệ token được kiểm riêng ở `tests/theme/tokens.test.ts` (đối chiếu với file JSON
nguồn và với số đo font), và ở lượt biên dịch Tailwind lúc build.

## Nên test cái gì

Ưu tiên những chỗ **sai thì im lặng**:

| Vùng                                                      | Ví dụ có sẵn                        |
| --------------------------------------------------------- | ----------------------------------- |
| Ba nhánh của refresh token                                | `tests/core/session.test.ts`        |
| Nơi cất refresh token (kho khoá, không phải AsyncStorage) | cùng file                           |
| So khớp bỏ dấu tiếng Việt                                 | `tests/shared/string.utils.test.ts` |
| Giải UTF-8 trong JWT (tên có dấu)                         | `tests/shared/jwt.utils.test.ts`    |
| Bẫy múi giờ khi gửi ngày lên backend                      | `tests/shared/date.utils.test.ts`   |
| `PATHS` khớp file route                                   | `tests/project-structure.test.ts`   |
| `src/app/` không tồn tại (cướp cây route)                 | cùng file                           |
| Ngưỡng lineHeight cho dấu tiếng Việt                      | `tests/theme/tokens.test.ts`        |

⛔ Đừng test lại thứ TypeScript đã bảo đảm (một hàm nhận đúng kiểu tham số).
⛔ Đừng snapshot cả màn hình — nó đỏ ở mọi thay đổi chữ nghĩa và người ta sẽ
`-u` cho qua, tức là mất luôn tác dụng.

## Mock có sẵn

`jest.setup.js` đã mock `expo-secure-store` (Map trong bộ nhớ) và `AsyncStorage`.
Nhờ vậy test luồng phiên chạy **thật** chứ không phải bỏ qua.

Gói native thêm 2026-09-26 cũng đã mock toàn cục (file ở `__mocks__/`, cách dùng ở đầu từng file):
`react-native-webview`, `@shopify/react-native-skia`, `@rnmapbox/maps`, `expo-location`,
`expo-screen-orientation`, `@react-native-firebase/messaging` (chỉ API modular). `yjs`, `y-protocols`,
`@hocuspocus/provider` chạy **thật** (nhờ `moduleNameMapper` cho `isomorphic-webcrypto`). Ví dụ chạy được:
`tests/native-libs-mocks.test.tsx`; danh sách gói + lý do: `docs/native-libraries.md`.

## Hai cấu hình dễ hỏng, đừng đụng nếu không hiểu

- `resolver: 'react-native-worklets/jest/resolver'` — thiếu là MỌI suite chết
  ngay lúc nạp với `Cannot read properties of undefined (reading 'loadUnpackers')`,
  kể cả test thuần TypeScript.
- `transform` phải TRẢI `expoPreset.transform` vào. Khai `transform` sẽ GHI ĐÈ
  (không gộp) transform của preset — mất nó thì mọi test chết.
