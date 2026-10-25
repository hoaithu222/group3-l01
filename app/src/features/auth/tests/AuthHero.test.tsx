import { isHiddenFromAccessibility, render, screen } from '@testing-library/react-native';
import { useReducedMotion, withDelay, withSequence, withTiming } from 'react-native-reanimated';

import { AuthHero } from '@/features/auth/components/AuthHero';
import { AuthHeroProvider } from '@/features/auth/components/AuthHeroProvider';

/**
 * Quyển sách đầu màn xác thực. Góc xoay là style của Reanimated (không đọc được trong Jest, `docs/rules/testing.md`) ⇒ kiểm
 * HÀNH VI: khối ẩn khỏi trình đọc màn hình, trạng thái gập/mở theo provider (phản chiếu ở `accessibilityState.expanded`),
 * sao lấp lánh chỉ có mặt khi sách mở, lắc đúng MỘT lần ở sườn lên của lỗi, và nhánh "Giảm chuyển động" không chạy hiệu
 * ứng nào. (Vòng lặp trang trí — quầng, sao — cố ý không chạy trong Jest: `useLoopProgress`.)
 *
 * Jest mặc định `useReducedMotion() = false` ⇒ bọc để đổi được theo từng ca; các `with*` bọc `jest.fn(actual)` để đếm số lần
 * gọi mà vẫn chạy thật (cùng khuôn `live-quiz/tests/reduced-motion.test.tsx`).
 */
jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated');
  return {
    ...actual,
    __esModule: true,
    useReducedMotion: jest.fn(() => false),
    withDelay: jest.fn(actual.withDelay),
    withSequence: jest.fn(actual.withSequence),
    withTiming: jest.fn(actual.withTiming),
  };
});

/** Khối bị ẩn khỏi trợ năng nên truy vấn mặc định KHÔNG thấy — phải xin cả phần tử ẩn. */
const hero = () => screen.getByTestId('auth-hero', { includeHiddenElements: true });
/** Lớp sao lấp lánh — nằm trong khối đã ẩn, cũng phải xin phần tử ẩn. */
const sparkles = () => screen.queryByTestId('auth-hero-sparkles', { includeHiddenElements: true });

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useReducedMotion).mockReturnValue(false);
});

it('trang trí thuần: cả khối ẩn khỏi trình đọc màn hình (tiêu đề bên dưới mới là mốc của màn)', async () => {
  await render(<AuthHero />);

  expect(screen.queryByTestId('auth-hero')).toBeNull();
  expect(isHiddenFromAccessibility(hero())).toBe(true);
  expect(screen.queryByTestId('auth-hero-sparkles')).toBeNull();
});

it('không có provider (Đăng ký, Quên mật khẩu…) ⇒ sách MỞ, mở đầu bằng đúng một hiệu ứng có độ trễ', async () => {
  await render(<AuthHero />);

  expect(hero()).toBeExpanded();
  expect(withDelay).toHaveBeenCalledTimes(1);
});

it('provider `closed` ⇒ gập; bỏ cờ ⇒ mở lại', async () => {
  const view = await render(
    <AuthHeroProvider closed>
      <AuthHero />
    </AuthHeroProvider>,
  );
  expect(hero()).toBeCollapsed();

  await view.rerender(
    <AuthHeroProvider closed={false}>
      <AuthHero />
    </AuthHeroProvider>,
  );
  expect(hero()).toBeExpanded();
});

it('sao lấp lánh CHỈ có mặt khi sách MỞ: gập (ô mật khẩu) ⇒ tháo; mở lại ⇒ quay về', async () => {
  const view = await render(
    <AuthHeroProvider>
      <AuthHero />
    </AuthHeroProvider>,
  );
  expect(sparkles()).toBeOnTheScreen();

  await view.rerender(
    <AuthHeroProvider closed>
      <AuthHero />
    </AuthHeroProvider>,
  );
  expect(sparkles()).toBeNull();

  await view.rerender(
    <AuthHeroProvider closed={false}>
      <AuthHero />
    </AuthHeroProvider>,
  );
  expect(sparkles()).toBeOnTheScreen();
});

it('lỗi hiện ra ⇒ lắc MỘT lần; lỗi còn đứng yên (vẽ lại, gập sách) thì không lắc lại', async () => {
  const view = await render(
    <AuthHeroProvider>
      <AuthHero />
    </AuthHeroProvider>,
  );
  expect(withSequence).not.toHaveBeenCalled();

  await view.rerender(
    <AuthHeroProvider hasError>
      <AuthHero />
    </AuthHeroProvider>,
  );
  expect(withSequence).toHaveBeenCalledTimes(1);

  await view.rerender(
    <AuthHeroProvider closed hasError>
      <AuthHero />
    </AuthHeroProvider>,
  );
  expect(withSequence).toHaveBeenCalledTimes(1);
});

describe('"Giảm chuyển động" bật', () => {
  beforeEach(() => {
    jest.mocked(useReducedMotion).mockReturnValue(true);
  });

  it('sách vẽ MỞ sẵn ngay từ đầu — không hiệu ứng nào chạy', async () => {
    await render(<AuthHero />);

    expect(hero()).toBeExpanded();
    expect(withDelay).not.toHaveBeenCalled();
    expect(withTiming).not.toHaveBeenCalled();
  });

  it('sách ĐỨNG YÊN: bỏ qua cờ gập của ô mật khẩu, lỗi không lắc', async () => {
    const view = await render(
      <AuthHeroProvider>
        <AuthHero />
      </AuthHeroProvider>,
    );

    await view.rerender(
      <AuthHeroProvider closed hasError>
        <AuthHero />
      </AuthHeroProvider>,
    );

    // Gập "tức thì" vẫn là cả mảng hình đổi đột ngột mỗi lần chạm ô — tuỳ chọn này muốn tránh đúng điều đó.
    expect(hero()).toBeExpanded();
    // Sách không gập ⇒ sao cũng không bật/tắt theo ô mật khẩu: vẫn đó, đứng yên (nhịp lấp lánh tự dừng).
    expect(sparkles()).toBeOnTheScreen();
    expect(withTiming).not.toHaveBeenCalled();
    expect(withSequence).not.toHaveBeenCalled();
  });
});
