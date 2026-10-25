import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import { useToastStore } from '@/shared/ui/feedback/toast-store';
import { useModulePickerStore } from '@/shell/navigation/module-picker.store';
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

let mockBadges: Record<string, number> = {};
jest.mock('@/shell/notifications', () => ({ useTabBadges: () => mockBadges }));

/** `Skeleton` chạy hoạt ảnh lặp vô hạn — Jest không bao giờ kết thúc: thay bằng chữ để đếm. */
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

const make = (
  id: string,
  title: string,
  description: string,
  extra: Partial<ModuleConfig> = {},
): ModuleConfig =>
  ({
    description,
    // ⚠️ `as unknown as`: một chuỗi mẫu `/${id}` ép thẳng sang `Href` (union typed-routes) là TS2590 "too complex".
    href: ('/' + id) as unknown as ModuleConfig['href'],
    icon: 'book',
    id,
    placement: 'menu',
    title,
    ...extra,
  }) as ModuleConfig;

const MESSAGES = make('messages', 'Tin nhắn', 'Hội thoại và cuộc gọi', {
  badge: 'unreadConversations',
  name: 'messages',
  placement: 'bar',
});
const STUDY = make('study', 'Học', 'Bộ thẻ ghi nhớ');
const CALLS = make('calls', 'Cuộc gọi', 'Lịch sử cuộc gọi');
const MEETINGS = make('meetings', 'Lịch họp', 'Lịch và phòng họp');
const MENTOR = make('mentor', 'Tìm cố vấn', 'Nhóm tìm cố vấn');

const setPins = (pinned: string[]) =>
  useModulePinsStore.setState({ hydrated: true, ownerId: 'u1', pinned });

beforeEach(() => {
  jest.clearAllMocks();
  mockModules = [MESSAGES, STUDY, CALLS, MEETINGS, MENTOR];
  mockBadges = {};
  useAuthStore.setState({
    user: { email: 'an@example.com', id: 'u1', name: 'An', permissions: [], roles: [] },
  });
  setPins([]);
  useModuleUsageStore.setState({ hydrated: true, ownerId: 'u1', ranking: {}, usage: {} });
  useModulePickerStore.setState({ visible: false });
});

afterEach(() => useToastStore.getState().clear());

describe('HomeModules — bố cục hai tầng', () => {
  it('chưa ghim thì hero là hai phân hệ đầu registry (thẻ lớn có mô tả), phần còn lại vào lưới — mỗi mục một chỗ', async () => {
    await render(<HomeModules />, { wrapper: Wrapper });

    expect(screen.getByRole('button', { name: 'Tin nhắn. Hội thoại và cuộc gọi' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Học. Bộ thẻ ghi nhớ' })).toBeOnTheScreen();
    // Ô lưới chỉ có TÊN (không mô tả) — và phân hệ đã lên hero không lặp lại ở lưới.
    expect(screen.getByRole('button', { name: 'Cuộc gọi' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Lịch họp' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Tìm cố vấn' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Học' })).not.toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Tin nhắn' })).not.toBeOnTheScreen();
  });

  it('phân hệ đã GHIM lên hero theo thứ tự ghim, kèm dấu ghim trong nhãn đọc', async () => {
    setPins(['mentor', 'calls']);
    await render(<HomeModules />, { wrapper: Wrapper });

    expect(screen.getByRole('button', { name: 'Tìm cố vấn. Nhóm tìm cố vấn, đã ghim' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Cuộc gọi. Lịch sử cuộc gọi, đã ghim' })).toBeOnTheScreen();
    // Hai thẻ mặc định bị đẩy xuống lưới.
    expect(screen.getByRole('button', { name: 'Tin nhắn' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Học' })).toBeOnTheScreen();
  });

  it('phân hệ mở từ ba lượt (ảnh chụp đóng băng) được điền vào ô hero CHƯA ghim', async () => {
    useModuleUsageStore.setState({ ranking: { meetings: { count: 5, lastAt: 10 } } });
    setPins(['study']);
    await render(<HomeModules />, { wrapper: Wrapper });

    expect(screen.getByRole('button', { name: 'Học. Bộ thẻ ghi nhớ, đã ghim' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Lịch họp. Lịch và phòng họp' })).toBeOnTheScreen();
  });

  it('ít hơn bốn phân hệ thì KHÔNG tách hero, và nhấn giữ không ghim (ghim không có chỗ hiện)', async () => {
    mockModules = [STUDY, CALLS, MEETINGS];
    await render(<HomeModules />, { wrapper: Wrapper });

    expect(screen.getByRole('button', { name: 'Học' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Học. Bộ thẻ ghi nhớ' })).not.toBeOnTheScreen();

    await fireEvent(screen.getByRole('button', { name: 'Học' }), 'longPress');
    expect(useModulePinsStore.getState().pinned).toEqual([]);
  });

  it('lưới chỉ hiện tối đa 8 ô; phần dư nằm ở "Tất cả (N)" — nút mở tấm chọn phân hệ', async () => {
    mockModules = Array.from({ length: 13 }, (_, i) => make(`m${String(i)}`, `Mục ${String(i)}`, `Mô tả ${String(i)}`));
    await render(<HomeModules />, { wrapper: Wrapper });

    // 2 hero (m0, m1) + 8 ô lưới (m2..m9); m10..m12 chỉ có trong tấm.
    expect(screen.getByRole('button', { name: 'Mục 9' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Mục 10' })).not.toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Mở danh sách tất cả 13 phân hệ' }));
    expect(useModulePickerStore.getState().visible).toBe(true);
  });

  it('số chưa đọc hiện trong nhãn đọc của thẻ hero và ô lưới', async () => {
    mockModules = [make('a', 'A', 'a', { badge: 'unread', name: 'activity' }), STUDY, CALLS, MEETINGS, MENTOR];
    mockBadges = { activity: 4 };
    await render(<HomeModules />, { wrapper: Wrapper });

    expect(screen.getByRole('button', { name: 'A. a, 4 chưa đọc' })).toBeOnTheScreen();
  });

  it('chưa nạp xong ghim/lượt mở thì hiện khung xương, KHÔNG vẽ thứ tự tạm rồi để ô nhảy', async () => {
    // Đang nạp cho đúng người này (chủ đã đặt, chưa xong): `hydrate` bỏ qua nên trạng thái đứng yên.
    useModulePinsStore.setState({ hydrated: false, ownerId: 'u1', pinned: [] });
    await render(<HomeModules />, { wrapper: Wrapper });

    expect(screen.getAllByText('khung xương')).toHaveLength(3);
    expect(screen.queryByRole('button', { name: 'Học' })).not.toBeOnTheScreen();
  });

  it('không có phân hệ nào thì ẩn cả khu', async () => {
    mockModules = [];
    await render(<HomeModules />, { wrapper: Wrapper });

    expect(screen.queryByText('Phân hệ')).not.toBeOnTheScreen();
  });

  it('chạm một ô thì mở đúng đường dẫn và ghi lượt mở', async () => {
    await render(<HomeModules />, { wrapper: Wrapper });

    await fireEvent.press(screen.getByRole('button', { name: 'Lịch họp' }));

    expect(router.push).toHaveBeenCalledWith('/meetings');
    expect(useModuleUsageStore.getState().usage.meetings?.count).toBe(1);
  });
});
