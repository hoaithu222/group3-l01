import { fireEvent, render, screen, userEvent, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { WalletHistoryScreen } from '../screens/WalletHistoryScreen';

/**
 * Lịch sử ví: "Xuất CSV" dời khỏi hàng tab lên menu "⋯" của thanh tiêu đề — hàng tab giờ chỉ có tab, và CSV vẫn theo
 * TAB ĐANG MỞ (khoản chi / thanh toán). Danh sách/bộ lọc giả (đã có test riêng), chỉ kiểm phần bố cục màn.
 */
jest.mock('react-native-keyboard-controller', () =>
  jest.requireActual('react-native-keyboard-controller/jest'),
);
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn() },
  useLocalSearchParams: () => ({ wsId: 'ws1' }),
}));
jest.mock('../hooks/useWalletGate', () => ({ useWalletGate: () => ({ denied: false }) }));
jest.mock('../hooks/useMemberDirectory', () => ({
  useMemberDirectory: () => ({ members: [], meId: 'me' }),
}));
const mockOffline = jest.fn(() => false);
jest.mock('../hooks/useIsOffline', () => ({ useIsOffline: () => mockOffline() }));
const mockRun = jest.fn();
let mockPending = false;
jest.mock('../hooks/useWalletCsvExport', () => ({
  useWalletCsvExport: () => ({ isPending: mockPending, run: mockRun }),
}));
jest.mock('../components/ExpenseFilterBar', () => ({ ExpenseFilterBar: () => null }));
jest.mock('../components/HistoryExpenseList', () => ({ HistoryExpenseList: () => null }));
jest.mock('../components/HistorySettlementList', () => ({ HistorySettlementList: () => null }));

const METRICS = {
  frame: { height: 812, width: 375, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 44 },
};
const Wrapper = ({ children }: { children: ReactNode }) => (
  <SafeAreaProvider initialMetrics={METRICS}>{children}</SafeAreaProvider>
);

const openMenu = () =>
  userEvent.press(screen.getByRole('button', { name: 'Thêm tuỳ chọn lịch sử' }));

beforeEach(() => {
  jest.clearAllMocks();
  mockOffline.mockReturnValue(false);
  mockPending = false;
});

describe('WalletHistoryScreen — "Xuất CSV" ở menu "⋯"', () => {
  it('không còn nút "Xuất CSV" cạnh hàng tab; chỉ hiện khi mở menu', async () => {
    await render(<WalletHistoryScreen />, { wrapper: Wrapper });

    expect(screen.queryByText('Xuất CSV')).toBeNull();
    await openMenu();
    expect(await screen.findByText('Xuất CSV')).toBeOnTheScreen();
  });

  it('chọn "Xuất CSV" chạy xuất theo TAB đang mở: khoản chi rồi thanh toán', async () => {
    await render(<WalletHistoryScreen />, { wrapper: Wrapper });

    await openMenu();
    await userEvent.press(await screen.findByText('Xuất CSV'));
    await waitFor(() => expect(mockRun).toHaveBeenLastCalledWith('expenses'));

    await fireEvent.press(screen.getByText('Thanh toán'));
    await openMenu();
    expect(await screen.findByText(/Toàn bộ thanh toán, không theo bộ lọc/)).toBeOnTheScreen();
    await userEvent.press(await screen.findByText('Xuất CSV'));
    await waitFor(() => expect(mockRun).toHaveBeenLastCalledWith('settlements'));
  });

  it('mất mạng ⇒ mục bị khoá kèm lý do, không chạy xuất', async () => {
    mockOffline.mockReturnValue(true);
    await render(<WalletHistoryScreen />, { wrapper: Wrapper });

    await openMenu();
    await userEvent.press(await screen.findByText('Xuất CSV'));

    expect(screen.getByText('Cần kết nối mạng')).toBeOnTheScreen();
    expect(mockRun).not.toHaveBeenCalled();
  });
});
