import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import { useToastStore } from '@/shared/ui/feedback/toast-store';
import { useModulePinsStore } from '@/shell/navigation/module-pins.store';
import { useModuleUsageStore } from '@/shell/navigation/module-usage.store';
import type { ModuleConfig } from '@/shell/navigation/types';
import { useAuthStore } from '@/shell/store/slices/auth';

import { HomeModules } from '../components/HomeModules';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn() } }));

let mockModules: ModuleConfig[] = [];
jest.mock('@/shell/navigation/use-accessible-modules', () => ({
  useAccessibleModules: () => mockModules,
}));
jest.mock('@/shell/notifications', () => ({ useTabBadges: () => ({}) }));
jest.mock('@/shared/ui/skeleton', () => {
  const { Text } = jest.requireActual('react-native');
  return { Skeleton: () => <Text>khung xương</Text> };
});

const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 375, height: 812 },
  insets: { top: 44, left: 0, right: 0, bottom: 34 },
};

function Wrapper({ children }: { children: ReactNode }) {
  return <SafeAreaProvider initialMetrics={METRICS}>{children}</SafeAreaProvider>;
}

const make = (id: string, title: string): ModuleConfig => ({
  description: `Mô tả ${title}`,
  href: '/study',
  icon: 'book',
  id,
  placement: 'menu',
  title,
});

const A = make('a', 'Mục A');
const B = make('b', 'Mục B');
const C = make('c', 'Mục C');
const D = make('d', 'Mục D');

const setPins = (pinned: string[]) =>
  useModulePinsStore.setState({ hydrated: true, ownerId: 'u1', pinned });
const toastMessages = () => useToastStore.getState().toasts.map((toast) => toast.message);

beforeEach(() => {
  jest.clearAllMocks();
  mockModules = [A, B, C, D];
  useAuthStore.setState({
    user: { email: 'an@example.com', id: 'u1', name: 'An', permissions: [], roles: [] },
  });
  setPins([]);
  useModuleUsageStore.setState({ hydrated: true, ownerId: 'u1', ranking: {}, usage: {} });
});

afterEach(() => useToastStore.getState().clear());

describe('HomeModules — ghim bằng nhấn giữ', () => {
  it('nhấn giữ một ô lưới thì ghim lên hero và báo bằng toast', async () => {
    await render(<HomeModules />, { wrapper: Wrapper });

    await fireEvent(screen.getByRole('button', { name: 'Mục C' }), 'longPress');

    expect(useModulePinsStore.getState().pinned).toEqual(['c']);
    expect(toastMessages()).toContain('Đã ghim Mục C lên đầu Trang chủ');
    // Ghim không cần chờ lần mở sau: thẻ nhảy lên hero ngay và rời lưới.
    expect(screen.getByRole('button', { name: 'Mục C. Mô tả Mục C, đã ghim' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Mục C' })).not.toBeOnTheScreen();
  });

  it('nhấn giữ thẻ đã ghim thì bỏ ghim', async () => {
    setPins(['c']);
    await render(<HomeModules />, { wrapper: Wrapper });

    await fireEvent(screen.getByRole('button', { name: 'Mục C. Mô tả Mục C, đã ghim' }), 'longPress');

    expect(useModulePinsStore.getState().pinned).toEqual([]);
    expect(toastMessages()).toContain('Đã bỏ ghim Mục C');
  });

  it('đủ hai ô ghim thì CHẶN ghim thứ ba kèm toast, không âm thầm đẩy ghim cũ ra', async () => {
    setPins(['a', 'b']);
    await render(<HomeModules />, { wrapper: Wrapper });

    await fireEvent(screen.getByRole('button', { name: 'Mục C' }), 'longPress');

    expect(useModulePinsStore.getState().pinned).toEqual(['a', 'b']);
    expect(toastMessages()).toContain(
      'Chỉ ghim được 2 phân hệ lên đầu Trang chủ. Bỏ ghim bớt rồi thử lại.',
    );
  });

  it('nhấn giữ là cử chỉ ẨN nên có hành động trợ năng "togglePin" thay thế (nhãn đổi theo trạng thái)', async () => {
    await render(<HomeModules />, { wrapper: Wrapper });

    const tile = screen.getByRole('button', { name: 'Mục C' });
    expect(tile.props.accessibilityActions).toEqual([
      { label: 'Ghim lên đầu Trang chủ', name: 'togglePin' },
    ]);
    await fireEvent(tile, 'accessibilityAction', { nativeEvent: { actionName: 'togglePin' } });
    expect(useModulePinsStore.getState().pinned).toEqual(['c']);

    const hero = screen.getByRole('button', { name: 'Mục C. Mô tả Mục C, đã ghim' });
    expect(hero.props.accessibilityActions).toEqual([{ label: 'Bỏ ghim', name: 'togglePin' }]);
  });

  it('ghim của phân hệ đã mất quyền không chiếm ô hero và không tính vào trần', async () => {
    setPins(['gone', 'a']);
    await render(<HomeModules />, { wrapper: Wrapper });

    // 'gone' không còn trong danh sách được vào: hero = A (đã ghim) + B (mặc định); ghim thêm C vẫn được.
    expect(screen.getByRole('button', { name: 'Mục A. Mô tả Mục A, đã ghim' })).toBeOnTheScreen();
    await fireEvent(screen.getByRole('button', { name: 'Mục C' }), 'longPress');
    expect(useModulePinsStore.getState().pinned).toEqual(['a', 'c']);
  });
});
