import { render, screen, userEvent } from '@testing-library/react-native';
import { router } from 'expo-router';
import { Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { FeatureRouteGuard } from '@/shell/capabilities/FeatureRouteGuard';
import { useCapabilities } from '@/shell/capabilities/use-capabilities';

/**
 * p0-07 `app.md` §8 (CFG-10): cờ tắt + có dữ liệu → "Tính năng này hiện chưa được bật"; đang tải KHÔNG cache → khung chờ (không
 * kết luận "tắt" khi chưa biết); lỗi không cache → cho vào (fail-open, BE vẫn chặn bằng CFG_005).
 */

jest.mock('expo-router', () => ({ router: { replace: jest.fn() } }));
jest.mock('@/shell/capabilities/use-capabilities', () => ({ useCapabilities: jest.fn() }));

const METRICS = {
  frame: { height: 812, width: 375, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 44 },
};

function capabilitiesAre(result: object) {
  jest.mocked(useCapabilities).mockReturnValue(result as never);
}

async function renderGuard() {
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <FeatureRouteGuard flag="communication">
        <Text>Nội dung phân hệ</Text>
      </FeatureRouteGuard>
    </SafeAreaProvider>,
  );
}

const flags = (enabled: boolean) => ({
  data: { features: { communication: { available: true, enabled } } },
  isLoading: false,
});

beforeEach(() => jest.mocked(router.replace).mockClear());

describe('FeatureRouteGuard', () => {
  it('cờ BẬT → vẽ nội dung', async () => {
    capabilitiesAre(flags(true));
    await renderGuard();
    expect(screen.getByText('Nội dung phân hệ')).toBeOnTheScreen();
  });

  it('cờ TẮT (đã biết chắc) → "Tính năng này hiện chưa được bật", KHÔNG lộ tên cờ kỹ thuật, không vẽ nội dung', async () => {
    capabilitiesAre(flags(false));
    await renderGuard();

    expect(screen.getByText('Tính năng này hiện chưa được bật')).toBeOnTheScreen();
    expect(screen.queryByText('Nội dung phân hệ')).toBeNull();
    expect(screen.queryByText(/communication/i)).toBeNull();
  });

  it('cờ không có trong danh sách (BE chưa biết phân hệ) → coi là tắt', async () => {
    capabilitiesAre({ data: { features: {} }, isLoading: false });
    await renderGuard();
    expect(screen.getByText('Tính năng này hiện chưa được bật')).toBeOnTheScreen();
  });

  it('đang tải lần đầu và CHƯA có cache → khung chờ, không kết luận "tắt"', async () => {
    capabilitiesAre({ data: undefined, isLoading: true });
    await renderGuard();

    expect(screen.queryByText('Tính năng này hiện chưa được bật')).toBeNull();
    expect(screen.queryByText('Nội dung phân hệ')).toBeNull();
  });

  it('lỗi tải và không có cache → cho vào (fail-open như thanh tab)', async () => {
    capabilitiesAre({ data: undefined, isLoading: false });
    await renderGuard();
    expect(screen.getByText('Nội dung phân hệ')).toBeOnTheScreen();
  });

  it('có bản cache (offline) nhưng đang tải lại → dùng bản cache, không nháy khung chờ', async () => {
    capabilitiesAre({ ...flags(true), isLoading: true });
    await renderGuard();
    expect(screen.getByText('Nội dung phân hệ')).toBeOnTheScreen();
  });

  it('nút "Về trang chính" đi tới Trang chủ (không phải Nhóm — Nhóm cũng đang tắt)', async () => {
    capabilitiesAre(flags(false));
    await renderGuard();
    await userEvent.press(screen.getByRole('button', { name: 'Về trang chính' }));
    expect(router.replace).toHaveBeenCalledWith('/');
  });
});
