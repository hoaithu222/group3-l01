import { render } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Text } from 'react-native';

import { AppProviders } from '@/shell/providers/AppProviders';

/**
 * ⛔ Phải mock `SafeAreaProvider`, không có đường khác.
 *
 * Provider thật KHÔNG vẽ con cho tới khi đo được vùng an toàn, mà trong Jest
 * không có tầng native nào đo — nên nó chờ `onLayout` mãi mãi và cây con không
 * bao giờ dựng. Các test khác né bằng cách tự bọc `<SafeAreaProvider
 * initialMetrics={…}>`, nhưng ở đây provider do CHÍNH `AppProviders` tạo ra,
 * không có chỗ nào truyền `initialMetrics` vào.
 *
 * Vì vậy: cho nó thành lớp bọc trong suốt, và trả số đo cố định cho
 * `useSafeAreaInsets` (số của iPhone X — ca có cả tai thỏ lẫn vạch gạt ngang).
 * ⚠️ Đây là mock HẸP, chỉ đổi phần "chờ đo"; mọi provider còn lại
 * (cử chỉ, bàn phím, React Query, theme, ranh giới lỗi, toast) vẫn chạy THẬT.
 */
jest.mock('react-native-safe-area-context', () => {
  const actual = jest.requireActual('react-native-safe-area-context');
  return {
    ...actual,
    SafeAreaProvider: ({ children }: { children: ReactNode }) => children,
    useSafeAreaInsets: () => ({ bottom: 34, left: 0, right: 0, top: 44 }),
  };
});

/**
 * ⛔ Phải mock cả `useColorScheme` của NativeWind.
 *
 * `ThemeProvider` gọi `setColorScheme(preference)` trong effect, mà bản thật
 * NÉM LỖI trong Jest: *"Unable to manually set color scheme without using
 * darkMode: class"*. `tailwind.config.js` CÓ khai `darkMode: 'class'`, nhưng
 * NativeWind chỉ biết điều đó sau khi Metro biên dịch CSS — mà Jest không chạy
 * Metro (cùng gốc với luật "style của NativeWind không có trong test", xem
 * `docs/rules/testing.md`).
 *
 * ⚠️ Nghĩa là test này KHÔNG chứng minh được phần đổi sáng/tối chạy đúng —
 * việc đó phải nghiệm thu trên máy (Cài đặt → Giao diện). Nó chỉ chứng minh
 * cây provider DỰNG được.
 */
jest.mock('nativewind', () => ({
  // ⚠️ Trải bản THẬT vào: bộ component còn dùng `cssInterop` từ chính module
  // này, thay sạch cả module là `cssInterop is not a function` ở một file
  // không liên quan.
  ...jest.requireActual('nativewind'),
  useColorScheme: () => ({ colorScheme: 'light', setColorScheme: jest.fn() }),
}));

/**
 * App có DỰNG NỔI cây provider không — test rẻ nhất chặn được ca tệ nhất.
 *
 * ⛔ Ca này đã tốn hàng chục phút mò trên máy thật (2026-09-09): app chạy tới
 * `Running "main"`, in được cảnh báo cấu hình ở tầm module, rồi màn hình đứng
 * im. Không lỗi trong `logcat`, không màn đỏ — vì `SplashScreen.hideAsync()`
 * nằm trong effect, mà effect không chạy khi lượt vẽ đầu ném lỗi, nên màn hình
 * chờ của hệ điều hành che luôn cả màn báo lỗi bên dưới.
 *
 * Triệu chứng đó không phân biệt được với "đang tải" hay "Metro chưa xong".
 * Ở đây thì nó là một dòng đỏ, đọc phát ra ngay.
 */
describe('AppProviders', () => {
  it('dựng được cả cây provider mà không ném lỗi', async () => {
    const screen = await render(
      <AppProviders>
        <Text>nội dung</Text>
      </AppProviders>,
    );

    expect(screen.getByText('nội dung')).toBeOnTheScreen();
  });
});
