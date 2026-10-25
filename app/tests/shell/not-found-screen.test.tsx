import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import { PATHS } from '@/shell/config';
import { NotFoundScreen } from '@/shell/navigation/NotFoundScreen';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn() } }));

/**
 * Màn "không tìm thấy" (deep link cũ, thông báo đẩy sai đường dẫn): phải luôn có
 * ĐƯỜNG RA. Nút "Về trang chủ" dùng `replace` — màn này không được nằm lại trong
 * ngăn xếp, nếu không Back từ trang chủ quay về "Không tìm thấy".
 */
const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 375, height: 812 },
  insets: { top: 44, left: 0, right: 0, bottom: 34 },
};

const renderScreen = () =>
  render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <NotFoundScreen />
    </SafeAreaProvider>,
  );

beforeEach(() => jest.clearAllMocks());

describe('NotFoundScreen', () => {
  it('nói rõ không tìm thấy màn hình và gợi ý nguyên nhân', async () => {
    await renderScreen();

    expect(screen.getByText('Không tìm thấy màn hình này')).toBeOnTheScreen();
    expect(
      screen.getByText('Liên kết có thể đã cũ hoặc màn hình đã được đổi tên.'),
    ).toBeOnTheScreen();
  });

  it('đường ra là một NÚT (vai button, đủ vùng chạm) — bấm thì về trang chủ bằng replace', async () => {
    await renderScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Về trang chủ' }));

    expect(router.replace).toHaveBeenCalledWith(PATHS.HOME);
    expect(router.push).not.toHaveBeenCalled();
  });
});
