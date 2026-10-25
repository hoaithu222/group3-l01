import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { apiClient } from '@/core/api/client';
import { useAuthStore } from '@/shell/store/slices/auth';

import { AddExpenseScreen } from '../screens/AddExpenseScreen';
import { CREATED, METRICS, apiFailure, mockReads, ok, sentHeaders } from './add-expense.fixtures';

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({ wsId: 'ws1' }),
}));
jest.mock('@/shell/capabilities', () => ({ useFeature: () => true }));
jest.mock('@/core/socket', () => ({ useConnectionState: () => 'connected' }));
jest.mock('../hooks/useReceiptUpload', () => ({
  useReceiptUpload: () => ({
    assetId: undefined,
    failed: false,
    items: [],
    pending: false,
    pickFromLibrary: jest.fn(),
    remove: jest.fn(),
    retry: jest.fn(),
    takePhoto: jest.fn(),
  }),
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

async function renderScreen() {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { gcTime: 0, retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <SafeAreaProvider initialMetrics={METRICS}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </SafeAreaProvider>
  );
  await render(<AddExpenseScreen />, { wrapper });
}

async function fillValidForm() {
  await fireEvent.changeText(await screen.findByLabelText('Số tiền, bắt buộc'), '150000');
  await fireEvent.changeText(screen.getByLabelText('Mô tả, bắt buộc'), 'Ăn trưa');
}

/** Luồng THÊM khoản chi trên MÀN THẬT (chỉ `apiClient` giả): payload đúng hợp đồng BE, khoá idempotency đúng nhịp. */
describe('AddExpenseScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuthStore.setState({ status: 'authenticated', user: { id: 'binh' } as never });
    mockReads();
  });

  it('nút Lưu KHOÁ tới khi có số tiền + mô tả; mọi thành viên (trừ khách) được chọn sẵn', async () => {
    await renderScreen();

    const save = await screen.findByRole('button', { name: 'Lưu khoản chi' });
    expect(save).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'An' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Bình (Bạn), người trả' })).toBeChecked();
    // GUEST không được tham gia khoản chi (WALLET_001) nên không có trong danh sách chọn
    expect(screen.queryByRole('checkbox', { name: 'Khách' })).toBeNull();

    await fillValidForm();
    expect(screen.getByRole('button', { name: 'Lưu khoản chi' })).toBeEnabled();
  });

  it('lưu ⇒ POST đúng hợp đồng BE (EQUAL không kèm amount/bps, số nguyên, người trả mặc định là tôi) + Idempotency-Key', async () => {
    jest.mocked(apiClient.post).mockResolvedValue(ok(CREATED, 201));
    await renderScreen();
    await fillValidForm();

    await fireEvent.press(screen.getByRole('button', { name: 'Lưu khoản chi' }));

    await waitFor(() => expect(apiClient.post).toHaveBeenCalledTimes(1));
    const [url, payload] = jest.mocked(apiClient.post).mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(url).toBe('/workspaces/ws1/expenses');
    expect(payload).toMatchObject({
      amount: 150000,
      category: 'FOOD',
      description: 'Ăn trưa',
      paidBy: 'binh',
      participants: [{ userId: 'an' }, { userId: 'binh' }],
      splitType: 'EQUAL',
    });
    expect(Number.isNaN(Date.parse(String(payload.occurredAt)))).toBe(false);
    expect('receiptAssetId' in payload).toBe(false);
    expect(sentHeaders(0)['Idempotency-Key']?.length ?? 0).toBeGreaterThanOrEqual(8);
    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith({
        params: { expenseId: 'new-expense', wsId: 'ws1' },
        pathname: '/workspaces/[wsId]/wallet/expenses/[expenseId]',
      }),
    );
  });

  it('BE từ chối 4xx (WALLET_002) ⇒ lỗi hiện TRONG form bằng câu tiếng Việt, và bấm lại dùng khoá idempotency MỚI', async () => {
    jest.mocked(apiClient.post).mockRejectedValue(apiFailure(400, 'WALLET_002'));
    await renderScreen();
    await fillValidForm();

    await fireEvent.press(screen.getByRole('button', { name: 'Lưu khoản chi' }));
    expect(
      await screen.findByText('Tổng số tiền chia chưa khớp với số tiền khoản chi'),
    ).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Lưu khoản chi' }));
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledTimes(2));
    // BE cache CẢ phản hồi 4xx theo khoá 24 giờ — gửi lại cùng khoá là nhận nguyên câu lỗi cũ dù body đã sửa
    expect(sentHeaders(1)['Idempotency-Key']).not.toBe(sentHeaders(0)['Idempotency-Key']);
  });

  it('lỗi MẠNG (không có phản hồi) ⇒ bấm lại giữ NGUYÊN khoá — BE gộp thành một bản ghi nếu lượt đầu thực ra đã tới', async () => {
    jest.mocked(apiClient.post).mockRejectedValue(new Error('Network Error'));
    await renderScreen();
    await fillValidForm();

    await fireEvent.press(screen.getByRole('button', { name: 'Lưu khoản chi' }));
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledTimes(1));
    await fireEvent.press(screen.getByRole('button', { name: 'Lưu khoản chi' }));
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledTimes(2));

    expect(sentHeaders(1)['Idempotency-Key']).toBe(sentHeaders(0)['Idempotency-Key']);
  });

  it('sửa dữ liệu sau lỗi ⇒ khoá đổi theo chữ ký body (không gửi lại body mới với khoá cũ)', async () => {
    jest.mocked(apiClient.post).mockRejectedValue(new Error('Network Error'));
    await renderScreen();
    await fillValidForm();

    await fireEvent.press(screen.getByRole('button', { name: 'Lưu khoản chi' }));
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledTimes(1));
    await fireEvent.changeText(screen.getByLabelText('Số tiền, bắt buộc'), '160000');
    await fireEvent.press(screen.getByRole('button', { name: 'Lưu khoản chi' }));
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledTimes(2));

    expect(sentHeaders(1)['Idempotency-Key']).not.toBe(sentHeaders(0)['Idempotency-Key']);
  });

  it('WALLET_001 kèm invalidUserIds ⇒ đánh dấu ĐÚNG người trong danh sách chia', async () => {
    jest.mocked(apiClient.post).mockRejectedValue(
      Object.assign(apiFailure(400, 'WALLET_001'), {
        response: {
          data: { error: { code: 'WALLET_001', details: { invalidUserIds: ['an'] } } },
          status: 400,
        },
      }),
    );
    await renderScreen();
    await fillValidForm();

    await fireEvent.press(screen.getByRole('button', { name: 'Lưu khoản chi' }));

    expect(
      await screen.findByText('Người này không còn trong nhóm — hãy bỏ chọn'),
    ).toBeOnTheScreen();
  });

  it('chia TUỲ CHỈNH thiếu tiền ⇒ nút Lưu khoá và KHÔNG gọi API', async () => {
    await renderScreen();
    await fillValidForm();

    await fireEvent.press(screen.getByText('Tuỳ chỉnh'));
    await fireEvent.changeText(screen.getByLabelText('Số tiền của An'), '50000');

    expect(screen.getByText('Còn thiếu 100.000 VND')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Lưu khoản chi' })).toBeDisabled();
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('GUEST mở thẳng đường dẫn ⇒ "không xem được", không dựng form', async () => {
    jest.mocked(apiClient.get).mockImplementation(async (url: string) => {
      if (url === '/workspaces/ws1')
        return ok({ myRole: 'GUEST', name: 'Nhóm A', status: 'ACTIVE' });
      throw Object.assign(new Error('404'), {
        isAxiosError: true,
        response: { data: {}, status: 404 },
      });
    });
    await renderScreen();

    expect(await screen.findByText('Bạn không xem được ví nhóm này')).toBeOnTheScreen();
    expect(screen.queryByLabelText('Số tiền, bắt buộc')).toBeNull();
  });
});
