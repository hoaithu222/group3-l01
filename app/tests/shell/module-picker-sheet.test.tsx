import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import type { ReactElement } from 'react';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import { ModulePickerSheet } from '@/shell/navigation/ModulePickerSheet';
import { useModulePickerStore } from '@/shell/navigation/module-picker.store';
import { useModulePinsStore } from '@/shell/navigation/module-pins.store';
import { useModuleUsageStore } from '@/shell/navigation/module-usage.store';
import type { ModuleConfig } from '@/shell/navigation/types';
import { useAuthStore } from '@/shell/store/slices/auth';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn() } }));

let mockMenu: ModuleConfig[] = [];
jest.mock('@/shell/navigation/use-accessible-modules', () => ({
  useAccessibleModules: () => mockMenu,
}));

const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 375, height: 812 },
  insets: { top: 44, left: 0, right: 0, bottom: 34 },
};

function renderSheet(ui: ReactElement) {
  return render(<SafeAreaProvider initialMetrics={METRICS}>{ui}</SafeAreaProvider>);
}

const MEETINGS: ModuleConfig = {
  description: 'Lịch, lời mời và phòng họp',
  href: '/meetings',
  icon: 'calendar',
  id: 'meetings',
  name: 'meetings',
  placement: 'menu',
  title: 'Lịch họp',
};
const ACHIEVEMENTS: ModuleConfig = {
  description: 'Cấp độ và huy hiệu',
  href: '/me/achievements',
  icon: 'star',
  id: 'achievements',
  placement: 'menu',
  title: 'Thành tích',
};
const MESSAGES: ModuleConfig = {
  description: 'Hội thoại',
  href: '/messages',
  icon: 'chat-bubble',
  id: 'messages',
  name: 'messages',
  placement: 'bar',
  title: 'Tin nhắn',
};
const STUDY: ModuleConfig = {
  description: 'Bộ thẻ ghi nhớ',
  href: '/study',
  icon: 'book',
  id: 'study',
  placement: 'menu',
  title: 'Học',
};
/** Đủ bốn phân hệ thì Trang chủ tách tầng hero ⇒ tấm mới hiện nút ghim. */
const FOUR = [MESSAGES, STUDY, MEETINGS, ACHIEVEMENTS];

beforeEach(() => {
  jest.clearAllMocks();
  mockMenu = [MEETINGS, ACHIEVEMENTS];
  useModulePickerStore.setState({ visible: true });
  useAuthStore.setState({
    user: { email: 'an@example.com', id: 'u1', name: 'An', permissions: [], roles: [] },
  });
  useModulePinsStore.setState({ hydrated: true, ownerId: 'u1', pinned: [] });
  useModuleUsageStore.setState({ hydrated: true, ownerId: 'u1', ranking: {}, usage: {} });
});

describe('ModulePickerSheet', () => {
  it('liệt kê các phân hệ phụ kèm mô tả', async () => {
    await renderSheet(<ModulePickerSheet />);

    expect(screen.getByText('Chọn phân hệ')).toBeOnTheScreen();
    expect(screen.getByText('Lịch họp')).toBeOnTheScreen();
    expect(screen.getByText('Lịch, lời mời và phòng họp')).toBeOnTheScreen();
    expect(screen.getByText('Thành tích')).toBeOnTheScreen();
  });

  it('chọn một phân hệ thì đóng tấm rồi điều hướng tới đường dẫn của nó', async () => {
    await renderSheet(<ModulePickerSheet />);

    await fireEvent.press(screen.getByText('Thành tích'));

    expect(router.push).toHaveBeenCalledWith('/me/achievements');
    expect(useModulePickerStore.getState().visible).toBe(false);
  });

  it('không có phân hệ phụ nào được bật thì nói rõ thay vì hiện tấm trống', async () => {
    mockMenu = [];
    await renderSheet(<ModulePickerSheet />);

    expect(screen.getByText('Chưa có phân hệ nào được bật.')).toBeOnTheScreen();
  });

  it('liệt kê CẢ phân hệ chính lẫn phụ — "Tất cả (N)" ở Trang chủ phải mở ra đúng N mục', async () => {
    mockMenu = FOUR;
    await renderSheet(<ModulePickerSheet />);

    for (const title of ['Tin nhắn', 'Học', 'Lịch họp', 'Thành tích']) {
      expect(screen.getByText(title)).toBeOnTheScreen();
    }
  });

  it('chọn một phân hệ thì ghi lượt mở để thứ hạng hero học theo', async () => {
    await renderSheet(<ModulePickerSheet />);

    await fireEvent.press(screen.getByText('Lịch họp'));

    expect(useModuleUsageStore.getState().usage.meetings?.count).toBe(1);
  });

  it('có nút ghim cho từng dòng; chạm thì ghim/bỏ ghim và đổi nhãn đọc', async () => {
    mockMenu = FOUR;
    await renderSheet(<ModulePickerSheet />);

    await fireEvent.press(screen.getByRole('button', { name: 'Ghim Học lên đầu Trang chủ' }));

    expect(useModulePinsStore.getState().pinned).toEqual(['study']);
    // Chạm nút ghim KHÔNG mở phân hệ và không đóng tấm.
    expect(router.push).not.toHaveBeenCalled();
    expect(useModulePickerStore.getState().visible).toBe(true);

    await fireEvent.press(screen.getByRole('button', { name: 'Bỏ ghim Học' }));
    expect(useModulePinsStore.getState().pinned).toEqual([]);
  });

  it('đủ hai ô ghim thì KHOÁ nút ghim thứ ba và nói lý do NGAY TRONG TẤM (toast bị `<Modal>` che)', async () => {
    mockMenu = FOUR;
    useModulePinsStore.setState({ pinned: ['messages', 'study'] });
    await renderSheet(<ModulePickerSheet />);

    const third = screen.getByRole('button', { name: 'Ghim Lịch họp lên đầu Trang chủ' });
    expect(third).toBeDisabled();
    await fireEvent.press(third);

    expect(useModulePinsStore.getState().pinned).toEqual(['messages', 'study']);
    // ⛔ Chạm nút khoá KHÔNG được lọt xuống hàng (mở phân hệ + đóng tấm) — lỗi thật khi nút mang `disabled` của `Pressable`.
    expect(router.push).not.toHaveBeenCalled();
    expect(
      screen.getByText('Đã ghim đủ 2/2 · bỏ ghim một phân hệ để ghim phân hệ khác'),
    ).toBeOnTheScreen();
    // Bỏ ghim vẫn làm được — đó là lối ra khỏi trạng thái khoá.
    expect(screen.getByRole('button', { name: 'Bỏ ghim Học' })).toBeEnabled();
  });

  it('chia hai nhóm có tiêu đề (mốc cho trình đọc màn hình); nút ghim báo trạng thái đã ghim', async () => {
    mockMenu = FOUR;
    useModulePinsStore.setState({ pinned: ['study'] });
    await renderSheet(<ModulePickerSheet />);

    expect(screen.getByRole('header', { name: 'Phân hệ chính' })).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Phân hệ khác' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Bỏ ghim Học' })).toBeSelected();
    expect(
      screen.getByRole('button', { name: 'Ghim Tin nhắn lên đầu Trang chủ' }),
    ).not.toBeSelected();
    expect(
      screen.getByText('Ghim tối đa 2 phân hệ lên đầu Trang chủ · đã ghim 1/2'),
    ).toBeOnTheScreen();
  });

  it('ít hơn bốn phân hệ (Trang chủ không tách hero) thì ẩn nút ghim — ghim không có chỗ hiện', async () => {
    await renderSheet(<ModulePickerSheet />);

    expect(screen.queryByRole('button', { name: /^Ghim / })).not.toBeOnTheScreen();
  });

  it('`visible=false` thì không vẽ gì', async () => {
    useModulePickerStore.setState({ visible: false });
    await renderSheet(<ModulePickerSheet />);

    expect(screen.queryByText('Chọn phân hệ')).not.toBeOnTheScreen();
  });
});
