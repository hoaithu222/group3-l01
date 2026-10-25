import { render } from '@testing-library/react-native';
import { Text } from 'react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import { captureException } from '@/core/monitoring';
import { ErrorBoundary } from '@/shell/providers/ErrorBoundary';

jest.mock('@/core/monitoring', () => ({ captureException: jest.fn() }));

/**
 * p0-11 OPS-02: lỗi render bắt được ở `ErrorBoundary` được báo lên monitoring (Sentry, đã lọc) kèm component stack — điểm nối DUY NHẤT của ranh giới lỗi.
 * `initialMetrics` bắt buộc: màn lỗi dùng `Screen` → `useSafeAreaInsets()` (xem `tests/shell/error-boundary.test.tsx`).
 */
const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 375, height: 812 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function Boom(): never {
  throw new Error('lỗi render thử');
}

describe('ErrorBoundary → monitoring', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    (captureException as jest.Mock).mockClear();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => consoleErrorSpy.mockRestore());

  it('gọi captureException với lỗi gốc và componentStack', async () => {
    await render(
      <SafeAreaProvider initialMetrics={METRICS}>
        <ErrorBoundary>
          <Boom />
        </ErrorBoundary>
      </SafeAreaProvider>,
    );

    expect(captureException).toHaveBeenCalledTimes(1);
    const [error, context] = (captureException as jest.Mock).mock.calls[0] as [Error, { componentStack: string }];
    expect(error.message).toBe('lỗi render thử');
    expect(context.componentStack).toContain('Boom');
  });

  it('không lỗi → không báo gì', async () => {
    await render(
      <SafeAreaProvider initialMetrics={METRICS}>
        <ErrorBoundary>
          <Text>ổn</Text>
        </ErrorBoundary>
      </SafeAreaProvider>,
    );
    expect(captureException).not.toHaveBeenCalled();
  });
});
