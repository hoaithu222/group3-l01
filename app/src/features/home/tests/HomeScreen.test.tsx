import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import { Text } from 'react-native';

import { registerHomeWidget, resetHomeWidgets } from '@/shared/home-widgets';
import { useAuthStore } from '@/shell/store/slices/auth';

import { HomeScreen } from '../screens/HomeScreen';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn() } }));

/** Cờ phân hệ + nguồn số chưa đọc + danh sách phân hệ phụ: điều khiển được từng ca. */
let mockCommunication: boolean | undefined = true;
jest.mock('@/shell/capabilities', () => ({
  useFeature: (flag: string) => (flag === 'communication' ? mockCommunication : undefined),
}));

let mockSummary: {
  data?: unknown;
  isLoading?: boolean;
  isRefetching: boolean;
  refetch: jest.Mock;
} = {
  data: undefined,
  isRefetching: false,
  refetch: jest.fn(),
};
jest.mock('@/shell/notifications', () => ({
  useTabBadges: () => ({}),
  useUnreadSummary: () => mockSummary,
}));

/** `Skeleton` chạy hoạt ảnh lặp vô hạn — Jest không bao giờ kết thúc (xem chú thích ở `Skeleton.tsx`): thay bằng chữ để kiểm. */
jest.mock('@/shared/ui/skeleton', () => {
  const { Text } = jest.requireActual('react-native');
  return { Skeleton: () => <Text>khung xương</Text> };
});

/** Khu phân hệ (hero/lưới/ghim) có test riêng ở `HomeModules.test.tsx`; ở đây không có phân hệ nào để màn gọn. */
jest.mock('@/shell/navigation/use-accessible-modules', () => ({ useAccessibleModules: () => [] }));

const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 375, height: 812 },
  insets: { top: 44, left: 0, right: 0, bottom: 34 },
};

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <SafeAreaProvider initialMetrics={METRICS}>
      <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
    </SafeAreaProvider>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCommunication = true;
  mockSummary = { data: undefined, isRefetching: false, refetch: jest.fn() };
  resetHomeWidgets();
  useAuthStore.setState({
    user: {
      email: 'an@example.com',
      id: 'u1',
      name: 'Nguyễn Văn An',
      permissions: [],
      roles: [],
    },
  });
});

describe('HomeScreen', () => {
  it('chào theo buổi và đúng tên người đăng nhập', async () => {
    await render(<HomeScreen />, { wrapper: Wrapper });

    expect(screen.getByText(/^Chào buổi (sáng|trưa|chiều|tối)$/)).toBeOnTheScreen();
    expect(screen.getByText('Nguyễn Văn An')).toBeOnTheScreen();
  });

  it('vẽ các widget thống kê đã đăng ký ở khe dưới cùng; không đăng ký gì thì màn vẫn gọn', async () => {
    await render(<HomeScreen />, { wrapper: Wrapper });
    expect(screen.queryByText('Hoạt động trong tuần')).not.toBeOnTheScreen();

    registerHomeWidget('test-week', () => <Text>Hoạt động trong tuần</Text>);
    await render(<HomeScreen />, { wrapper: Wrapper });
    expect(screen.getByText('Hoạt động trong tuần')).toBeOnTheScreen();
  });

  it('đang tải lần đầu thì hiện khung xương giữ chỗ, không hiện "–" hay số 0', async () => {
    mockSummary = { data: undefined, isLoading: true, isRefetching: false, refetch: jest.fn() };
    await render(<HomeScreen />, { wrapper: Wrapper });

    expect(screen.getAllByText('khung xương')).toHaveLength(2);
    expect(screen.queryByText('–')).not.toBeOnTheScreen();
  });

  it('tải xong mà chưa có số (mất mạng lần đầu) thì hiện "–" chứ không bịa số 0', async () => {
    await render(<HomeScreen />, { wrapper: Wrapper });

    expect(screen.getAllByText('–')).toHaveLength(2);
  });

  it('hiện số chưa đọc của tin nhắn và hoạt động; chạm ô thì sang đúng tab', async () => {
    mockSummary = {
      data: { activity: { unread: 7 }, conversations: { unreadConversations: 3 } },
      isRefetching: false,
      refetch: jest.fn(),
    };
    await render(<HomeScreen />, { wrapper: Wrapper });

    expect(screen.getByText('3')).toBeOnTheScreen();
    expect(screen.getByText('7')).toBeOnTheScreen();

    await fireEvent.press(screen.getByText('Tin nhắn chưa đọc'));
    expect(router.push).toHaveBeenCalledWith('/messages');
    await fireEvent.press(screen.getByText('Hoạt động mới'));
    expect(router.push).toHaveBeenCalledWith('/activity');
  });

  it('tải xong và cả hai đều bằng 0 thì gọn về MỘT dòng, không hiện hai chữ số 0', async () => {
    mockSummary = {
      data: { activity: { unread: 0 }, conversations: { unreadConversations: 0 } },
      isRefetching: false,
      refetch: jest.fn(),
    };
    await render(<HomeScreen />, { wrapper: Wrapper });

    expect(screen.getByText(/không có tin nhắn hay hoạt động nào chưa đọc/)).toBeOnTheScreen();
    expect(screen.queryByText('0')).not.toBeOnTheScreen();
    expect(screen.queryByText('Tin nhắn chưa đọc')).not.toBeOnTheScreen();
  });

  it('chỉ MỘT bên bằng 0 thì vẫn hiện đủ hai ô (số 0 của bên kia là thông tin thật)', async () => {
    mockSummary = {
      data: { activity: { unread: 2 }, conversations: { unreadConversations: 0 } },
      isRefetching: false,
      refetch: jest.fn(),
    };
    await render(<HomeScreen />, { wrapper: Wrapper });

    expect(screen.getByText('0')).toBeOnTheScreen();
    expect(screen.getByText('2')).toBeOnTheScreen();
  });

  it('cờ `communication` TẮT thì không hiện ô chưa đọc (route đó cũng đang tắt ở backend)', async () => {
    mockCommunication = false;
    await render(<HomeScreen />, { wrapper: Wrapper });

    expect(screen.queryByText('Tin nhắn chưa đọc')).not.toBeOnTheScreen();
    expect(screen.queryByText('Hoạt động mới')).not.toBeOnTheScreen();
  });

  it('không còn phân hệ nào (cờ tắt hết) thì ẩn cả khu "Phân hệ" — màn vẫn có lời chào', async () => {
    await render(<HomeScreen />, { wrapper: Wrapper });

    expect(screen.queryByText('Phân hệ')).not.toBeOnTheScreen();
    expect(screen.queryByText(/^Tất cả/)).not.toBeOnTheScreen();
    expect(screen.getByText('Nguyễn Văn An')).toBeOnTheScreen();
  });
});

describe('HomeScreen — lời chào dạng hero', () => {
  afterEach(() => jest.restoreAllMocks());

  it('lời chào vẫn là MỘT nút đọc (buổi + tên + ngày); cảnh trời theo giờ là trang trí, ẩn khỏi trình đọc màn hình', async () => {
    // 20h ⇒ "Chào buổi tối" + cảnh tối (trăng khuyết + sao). Chỉ giả `getHours` — ngày vẫn là ngày thật.
    jest.spyOn(Date.prototype, 'getHours').mockReturnValue(20);
    await render(<HomeScreen />, { wrapper: Wrapper });

    const greeting = screen.getByLabelText(/^Chào buổi tối, Nguyễn Văn An\. /);
    expect(greeting.props.accessible).toBe(true);
    // Ba dòng chữ nằm TRONG nút đó — không phải ba điểm dừng rời của trình đọc màn hình.
    expect(within(greeting).getByText('Chào buổi tối')).toBeOnTheScreen();
    expect(within(greeting).getByText('Nguyễn Văn An')).toBeOnTheScreen();

    const scene = screen.getByTestId('greeting-illustration-evening', {
      includeHiddenElements: true,
    });
    expect(scene.props.accessibilityElementsHidden).toBe(true);
    expect(scene.props.importantForAccessibility).toBe('no-hide-descendants');
  });
});
