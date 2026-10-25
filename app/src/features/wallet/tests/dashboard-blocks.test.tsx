import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';

import { showToast } from '@/shared/utils/toast.utils';

import { CopyRow } from '../components/CopyRow';
import { DashboardBalanceColumn } from '../components/DashboardBalanceColumn';
import { DashboardExpensesColumn } from '../components/DashboardExpensesColumn';
import type { MemberDirectory } from '../hooks/useMemberDirectory';

/** Các khối của dashboard sau đợt gọn bố cục: số dư thành viên bị chặn số dòng, trạng thái rỗng không lặp CTA, số tiền QR có định dạng. */
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true) }));
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));
jest.mock('@/core/uploads/use-asset-url', () => ({
  useAssetUrl: () => ({ data: undefined, isPending: true, refetch: jest.fn() }),
}));

const NAMES = ['An', 'Bình', 'Cường', 'Dung', 'Em', 'Phúc', 'Giang', 'Hà'];
const IDS = NAMES.map((_, index) => `u${index}`);
const directory = (meId: string): MemberDirectory =>
  ({
    isError: false,
    isLoading: false,
    isMe: (id: string) => id === meId,
    meId,
    memberOf: () => undefined,
    members: [],
    nameOf: (id: string) => NAMES[IDS.indexOf(id)] ?? 'Người đã rời nhóm',
    refetch: jest.fn(),
  }) as unknown as MemberDirectory;

// Sắp theo `balance` tăng dần trong component: u0 nợ nhiều nhất … u7 được nợ nhiều nhất.
const SUMMARY = {
  balances: IDS.map((userId, index) => ({ balance: (index - 4) * 10000, userId })),
  currency: 'VND',
  myBalance: 0,
  suggestions: [],
  totals: { expensesThisMonth: 0, outstanding: 0 },
  walletVersion: 1,
};

const renderBalances = (meId: string) =>
  render(
    <DashboardBalanceColumn
      busy={false}
      directory={directory(meId)}
      pending={[]}
      summary={SUMMARY as never}
      summaryError={false}
      onCancel={jest.fn()}
      onConfirm={jest.fn()}
      onPay={jest.fn()}
      onReject={jest.fn()}
      onRetry={jest.fn()}
    />,
  );

describe('DashboardBalanceColumn — chặn số dòng "Số dư thành viên"', () => {
  it('nhóm 8 người: chỉ hiện 5 người đầu + "Xem thêm 3 người"; bấm để bung, "Thu gọn" để gập', async () => {
    await renderBalances('u0');

    expect(screen.getByLabelText(/^An, bạn,/)).toBeOnTheScreen();
    expect(screen.queryByLabelText(/^Hà,/)).toBeNull();
    expect(screen.getByText('Xem thêm 3 người')).toBeOnTheScreen();

    await fireEvent.press(screen.getByText('Xem thêm 3 người'));
    expect(screen.getByLabelText(/^Hà,/)).toBeOnTheScreen();
    expect(screen.getByText('Thu gọn')).toBeOnTheScreen();

    await fireEvent.press(screen.getByText('Thu gọn'));
    expect(screen.queryByLabelText(/^Hà,/)).toBeNull();
  });

  it('dòng của TÔI luôn hiện dù nằm ngoài top 5', async () => {
    await renderBalances('u7');

    expect(screen.getByLabelText(/^Hà, bạn,/)).toBeOnTheScreen();
    expect(screen.getByText('Xem thêm 2 người')).toBeOnTheScreen();
  });
});

describe('DashboardBalanceColumn — chưa có số dư', () => {
  it('nhóm chưa có số dư nào ⇒ nói rõ, không vẽ thẻ trắng trơn', async () => {
    await render(
      <DashboardBalanceColumn
        busy={false}
        directory={directory('u0')}
        pending={[]}
        summary={{ ...SUMMARY, balances: [] } as never}
        summaryError={false}
        onCancel={jest.fn()}
        onConfirm={jest.fn()}
        onPay={jest.fn()}
        onReject={jest.fn()}
        onRetry={jest.fn()}
      />,
    );

    expect(screen.getByText(/Chưa có số dư nào/)).toBeOnTheScreen();
    expect(screen.queryByText(/Xem thêm/)).toBeNull();
  });
});

describe('DashboardExpensesColumn — trạng thái rỗng', () => {
  it('chưa có khoản chi ⇒ chỉ có lời giải thích, KHÔNG có nút "Thêm khoản chi" thứ hai (màn đã có nút chính dính đáy)', async () => {
    await render(
      <DashboardExpensesColumn
        directory={directory('u0')}
        expenses={[]}
        onOpen={jest.fn()}
        onSeeAll={jest.fn()}
      />,
    );

    expect(screen.getByText('Chưa có khoản chi nào')).toBeOnTheScreen();
    expect(screen.queryByText('Thêm khoản chi')).toBeNull();
    // Rỗng ⇒ cũng không mời sang danh sách đầy đủ (rỗng nốt).
    expect(screen.queryByText('Xem tất cả')).toBeNull();
  });

  it('có khoản chi ⇒ hiện "Xem tất cả" sang lịch sử đầy đủ', async () => {
    const onSeeAll = jest.fn();
    await render(
      <DashboardExpensesColumn
        directory={directory('u0')}
        expenses={[
          {
            adjustsExpenseId: null,
            amount: 90000,
            category: 'FOOD',
            createdAt: '2026-09-10T05:00:00.000Z',
            createdBy: 'u0',
            description: 'Ăn trưa',
            id: 'e1',
            kind: 'EXPENSE',
            myShare: null,
            occurredAt: '2026-09-10T05:00:00.000Z',
            paidBy: 'u0',
            version: 1,
            workspaceId: 'w1',
          } as never,
        ]}
        onOpen={jest.fn()}
        onSeeAll={onSeeAll}
      />,
    );

    await fireEvent.press(screen.getByText('Xem tất cả'));
    expect(onSeeAll).toHaveBeenCalledTimes(1);
  });
});

describe('CopyRow — số tiền hiện có định dạng nhưng sao chép số thô', () => {
  it('hiện "37.500 VND" mà sao chép "37500" (ô số tiền của app ngân hàng từ chối chữ/dấu chấm)', async () => {
    await render(
      <CopyRow display="37.500 VND" label="Số tiền" value="37500" />,
    );

    expect(screen.getByText('37.500 VND')).toBeOnTheScreen();
    expect(screen.queryByText('37500')).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: 'Sao chép số tiền' }));
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith('37500');
  });

  it('clipboard từ chối ⇒ toast lỗi, KHÔNG để Promise reject vô chủ (bản dev hiện LogBox "Uncaught (in promise)")', async () => {
    jest.mocked(Clipboard.setStringAsync).mockRejectedValueOnce(new Error('denied'));
    await render(<CopyRow label="Số tài khoản" value="0123456789" />);

    await fireEvent.press(screen.getByRole('button', { name: 'Sao chép số tài khoản' }));

    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith('error', 'Không sao chép được. Hãy thử lại.'),
    );
  });

  it('không truyền `display` ⇒ hiện đúng giá trị sao chép (số tài khoản…)', async () => {
    await render(<CopyRow label="Số tài khoản" value="0123456789" />);

    expect(screen.getByText('0123456789')).toBeOnTheScreen();
  });
});
