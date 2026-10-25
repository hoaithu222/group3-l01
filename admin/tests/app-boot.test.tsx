/**
 * Smoke khởi động app — mount THẬT cả cây provider + router trong jsdom.
 *
 * Đây là bài kiểm bắt được thứ mà `tsc` không thấy: import vòng, thiếu
 * provider, guard chuyển hướng sai, barrel trỏ vào file rỗng. Không có nó thì
 * "typecheck sạch + build xong" vẫn có thể ra màn hình trắng.
 *
 * Kiểm CẢ HAI chế độ của `appConfig.authEnabled`, vì hai chế độ dựng ra hai cây
 * route khác nhau và base xuất xưởng ở chế độ TẮT:
 *   - TẮT (mặc định base) → vào thẳng trang chủ, KHÔNG đá ra đăng nhập.
 *   - BẬT (dự án thật)    → chưa đăng nhập thì `AuthGuard` đưa về trang đăng nhập.
 */

import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/core/api/auth', () => ({
  authService: {
    // Không có BE trong test — refresh hỏng đúng như khi người dùng chưa đăng nhập.
    refresh: vi.fn().mockRejectedValue(new Error('no session')),
    me: vi.fn(),
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn().mockResolvedValue({ data: null }),
    forgotPassword: vi.fn(),
    resetPassword: vi.fn(),
  },
}));

/**
 * `appConfig` đọc `import.meta.env` MỘT LẦN lúc nạp module, nên không đổi được
 * bằng cách gán biến môi trường trong test. Thay hẳn module là cách duy nhất
 * kiểm được cả hai chế độ.
 */
async function renderApp(authEnabled: boolean) {
  vi.resetModules();
  const actual = await vi.importActual<typeof import('@/core/config')>('@/core/config');
  vi.doMock('@/core/config', () => ({
    ...actual,
    appConfig: { ...actual.appConfig, authEnabled },
  }));

  const { AppProvider } = await import('@/app/providers');
  const { AppRouter } = await import('@/app/router');

  render(
    <AppProvider>
      <AppRouter />
    </AppProvider>,
  );
}

// Ngưỡng của TỪNG test phải ≥ `waitFor` bên trong (15 s): bản cũ chỉ nới `waitFor` còn `it()` giữ 5 s mặc định nên
// bài đỏ vì hết giờ (~5,0 s) khi chạy chung cả bộ dù không có gì treo thật (riêng file này xong trong ~3 s).
describe('khởi động app', { timeout: 20_000 }, () => {
  beforeEach(() => {
    vi.resetModules();
    window.history.replaceState({}, '', '/');
  });

  it('tắt kiểm đăng nhập (mặc định base) → vào thẳng trang chủ', async () => {
    await renderApp(false);

    // Timeout rộng hơn mặc định: bài này mount THẬT cả cây app qua
    // `vi.resetModules()` + `import()` lại toàn bộ registry — chạy CHUNG với
    // cả bộ test (nhiều worker tranh CPU/transform) có thể mất hơn 5s dù
    // không có gì treo thật (chạy riêng file này xong trong ~3s).
    await waitFor(
      () => {
        expect(screen.getByRole('heading', { name: 'Tổng quan' })).toBeInTheDocument();
      },
      { timeout: 15000 },
    );
  });

  it('bật kiểm đăng nhập, chưa có phiên → về trang đăng nhập', async () => {
    await renderApp(true);

    await waitFor(
      () => {
        expect(screen.getByRole('button', { name: 'Đăng nhập' })).toBeInTheDocument();
      },
      { timeout: 15000 },
    );

    // Tìm ô nhập BẰNG NHÃN — đúng con đường của trình đọc màn hình. Regex vì
    // nhãn của field bắt buộc còn kèm dấu `*` phía sau.
    expect(screen.getByLabelText(/Email/i)).toBeInTheDocument();
  });
});
