import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import { useAuthStore } from '@/shell/store/slices/auth';

import { WalletDashboardScreen } from '../screens/WalletDashboardScreen';
import { PENDING_FOR_ME, mockWorld } from './wallet-dashboard.fixtures';

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn() },
  useLocalSearchParams: () => ({ wsId: 'ws1' }),
}));
jest.mock('@/shell/capabilities', () => ({ useFeature: () => true }));
jest.mock('@/core/socket', () => ({ useConnectionState: () => 'connected' }));
jest.mock('@/core/uploads/use-asset-url', () => ({
  useAssetUrl: () => ({ data: undefined, isPending: true, refetch: jest.fn() }),
}));
jest.mock('@/core/api/client', () => ({
  apiClient: {
    delete: jest.fn(),
    get: jest.fn(),
    patch: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
  },
}));

const METRICS: Metrics = {
  frame: { height: 812, width: 375, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 44 },
};

async function renderDashboard() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { gcTime: 0, retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <SafeAreaProvider initialMetrics={METRICS}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </SafeAreaProvider>
  );
  await render(<WalletDashboardScreen />, { wrapper });
}

/**
 * Chạy MÀN THẬT qua service THẬT (chỉ `apiClient` bị giả) với phong bì đúng hình BE — kiểm hợp đồng
 * parse (zod), thứ tự hook, hàng rào GUEST và các nhánh hiển thị chính của dashboard.
 */
describe('WalletDashboardScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuthStore.setState({ status: 'authenticated', user: { id: 'binh' } as never });
  });

  it('hiện số dư của TÔI bằng chữ, gợi ý thanh toán liên quan tôi có nút "Trả", và khoản chi gần đây', async () => {
    mockWorld();
    await renderDashboard();

    expect(await screen.findByText('Bạn đang nợ 37.500 VND')).toBeOnTheScreen();
    expect(screen.getByLabelText('Bạn chuyển cho An 37.500 VND')).toBeOnTheScreen();
    expect(screen.getByText('Ăn trưa nhóm')).toBeOnTheScreen();
    expect(screen.getByText('Bạn nợ 37.500 VND')).toBeOnTheScreen();
    expect(screen.getByText('Tháng này cả nhóm đã chi 150.000 VND')).toBeOnTheScreen();
  });

  it('bấm "Trả" mở màn Trả nợ với người nhận + số tiền gợi ý điền sẵn', async () => {
    mockWorld();
    await renderDashboard();

    await fireEvent.press(await screen.findByRole('button', { name: /^Trả .* cho / }));

    expect(router.push).toHaveBeenCalledWith({
      params: { amount: '37500', toId: 'an', wsId: 'ws1' },
      pathname: '/workspaces/[wsId]/wallet/settle',
    });
  });

  it('số dư thành viên: số âm nói "nợ", không có dấu trừ', async () => {
    mockWorld();
    await renderDashboard();

    expect(await screen.findByLabelText('Bình, bạn, nợ 37.500 VND')).toBeOnTheScreen();
    expect(screen.getByLabelText('An, được nợ 37.500 VND')).toBeOnTheScreen();
    expect(screen.queryByText(/-37/)).toBeNull();
  });

  it('GUEST (cố vấn) ⇒ "không xem được ví nhóm này", KHÔNG lộ số dư', async () => {
    mockWorld({ myRole: 'GUEST' });
    await renderDashboard();

    expect(await screen.findByText('Bạn không xem được ví nhóm này')).toBeOnTheScreen();
    expect(screen.queryByText(/nợ 37\.500/)).toBeNull();
  });

  it('BE trả 404 (không phải thành viên / cờ tắt) ⇒ cùng màn "không xem được"', async () => {
    mockWorld({ walletHttpError: 404 });
    await renderDashboard();

    expect(await screen.findByText('Bạn không xem được ví nhóm này')).toBeOnTheScreen();
  });

  it('settlement PENDING gửi TỚI TÔI ⇒ hiện thẻ xác nhận; khoản tôi là người nhận thì có "Đã nhận"', async () => {
    useAuthStore.setState({ user: { id: 'an' } as never });
    mockWorld({ pending: [PENDING_FOR_ME] });
    await renderDashboard();

    expect(await screen.findByText('Bình báo đã trả bạn 20.000 VND')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: /^Đã nhận / })).toBeOnTheScreen();
  });

  it('settlement PENDING tôi là người GỬI ⇒ chỉ có "Huỷ", không có nút xác nhận', async () => {
    mockWorld({ pending: [PENDING_FOR_ME] });
    await renderDashboard();

    expect(await screen.findByText('Chờ An xác nhận 20.000 VND')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /^Đã nhận / })).toBeNull();
    expect(screen.getByRole('button', { name: /^Huỷ khoản báo chuyển / })).toBeOnTheScreen();
  });

  it('chưa có khoản chi nào ⇒ trạng thái rỗng có lối "Thêm khoản chi"', async () => {
    mockWorld({ expenses: [] });
    await renderDashboard();

    expect(await screen.findByText('Chưa có khoản chi nào')).toBeOnTheScreen();
  });

  it('nút cài đặt chỉ hiện với OWNER/ADMIN (myActions.canManageSettings)', async () => {
    mockWorld();
    await renderDashboard();
    await screen.findByText('Bạn đang nợ 37.500 VND');
    expect(screen.queryByRole('button', { name: 'Cài đặt ví' })).toBeNull();
  });

  it('OWNER/ADMIN thấy nút cài đặt ví', async () => {
    mockWorld({ settings: { myActions: { canManageSettings: true, canRemind: true } } });
    await renderDashboard();
    expect(await screen.findByRole('button', { name: 'Cài đặt ví' })).toBeOnTheScreen();
  });

  it('BE trả số dư SỐ THỰC ⇒ không hiện số sai lên màn (parse từ chối, có nút thử lại)', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockWorld({ summary: { myBalance: -37500.5 } });
    await renderDashboard();

    expect(await screen.findByText('Thử lại')).toBeOnTheScreen();
    expect(screen.queryByText(/37\.500,5|37\.501/)).toBeNull();
  });
});
