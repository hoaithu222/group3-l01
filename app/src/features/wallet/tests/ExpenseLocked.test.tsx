import { fireEvent, render, screen } from '@testing-library/react-native';

import type { ExpenseDetailView } from '../api';
import { ExpenseDetailBody } from '../components/ExpenseDetailBody';
import { ExpenseLockedNotice } from '../components/ExpenseLockedNotice';
import type { MemberDirectory } from '../hooks/useMemberDirectory';
import { apiError } from './api-error.helpers';

jest.mock('@/core/uploads/use-asset-url', () => ({
  useAssetUrl: () => ({ data: undefined, isPending: true, refetch: jest.fn() }),
}));

const EXPENSE: ExpenseDetailView = {
  adjustments: [],
  adjustsExpenseId: null,
  amount: 150000,
  canManage: true,
  category: 'FOOD',
  createdAt: '2026-09-10T05:00:00.000Z',
  createdBy: 'an',
  description: 'Ăn trưa',
  id: 'e1',
  kind: 'EXPENSE',
  myShare: null,
  occurredAt: '2026-09-10T05:00:00.000Z',
  paidBy: 'an',
  participants: [
    { amount: null, bps: null, userId: 'an' },
    { amount: null, bps: null, userId: 'binh' },
  ],
  receiptAssetId: null,
  shares: [
    {
      amount: 75000,
      creditorId: 'an',
      debtorId: 'binh',
      id: 's1',
      paidAmount: 0,
      status: 'UNPAID',
    },
  ],
  splitType: 'EQUAL',
  version: 1,
  workspaceId: 'w1',
};

const NAMES: Record<string, string> = { an: 'An', binh: 'Bình' };
const DIRECTORY = {
  isError: false,
  isLoading: false,
  isMe: (id: string) => id === 'an',
  meId: 'an',
  memberOf: () => undefined,
  members: [],
  nameOf: (id: string) => NAMES[id] ?? 'Người đã rời nhóm',
  refetch: jest.fn(),
} as unknown as MemberDirectory;

async function renderBody(overrides: Partial<React.ComponentProps<typeof ExpenseDetailBody>> = {}) {
  const props = {
    deleteError: null,
    directory: DIRECTORY,
    expense: EXPENSE,
    onAdjust: jest.fn(),
    onOpenExpense: jest.fn(),
    ...overrides,
  };
  await render(<ExpenseDetailBody {...props} />);
  return props;
}

describe('ExpenseLockedNotice — WALLET_004', () => {
  it('nói rõ vì sao không sửa được và có CTA "Tạo khoản điều chỉnh"', async () => {
    const onAdjust = jest.fn();
    await render(<ExpenseLockedNotice onAdjust={onAdjust} />);

    expect(screen.getByText('Khoản chi này đã có người thanh toán')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Tạo khoản điều chỉnh' }));
    expect(onAdjust).toHaveBeenCalledTimes(1);
  });
});

/**
 * Sửa / Xoá / Điều chỉnh đã DỜI lên thanh tiêu đề (`ExpenseHeaderActions`, xem `ExpenseHeaderActions.test.tsx`):
 * thân màn chỉ còn phần đọc + thông báo khoá/lỗi xoá — nên ở đây khẳng định thân màn KHÔNG tự vẽ các nút đó (hai lối vào
 * cho cùng một hành động là lặp).
 */
describe('ExpenseDetailBody — thông báo khoá và lỗi xoá', () => {
  it('chưa ai trả ⇒ không có thông báo khoá và không có nút hành động trong thân màn', async () => {
    await renderBody();

    expect(screen.queryByText('Khoản chi này đã có người thanh toán')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Sửa' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Xoá' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Tạo khoản điều chỉnh' })).toBeNull();
  });

  it.each(['PARTIAL', 'PAID'] as const)(
    'đã có share %s ⇒ hiện thông báo khoá + CTA điều chỉnh NGAY (không đợi BE trả WALLET_004)',
    async (status) => {
      const props = await renderBody({
        expense: { ...EXPENSE, shares: [{ ...EXPENSE.shares[0]!, paidAmount: 1000, status }] },
      });

      expect(screen.getByText('Khoản chi này đã có người thanh toán')).toBeOnTheScreen();
      await fireEvent.press(screen.getByRole('button', { name: 'Tạo khoản điều chỉnh' }));
      expect(props.onAdjust).toHaveBeenCalledTimes(1);
    },
  );

  it('BE trả WALLET_004 khi XOÁ (client tính lệch) ⇒ vẫn ra CTA điều chỉnh và bấm được', async () => {
    const props = await renderBody({ deleteError: apiError(409, 'WALLET_004') });

    expect(screen.getByText('Khoản chi này đã có người thanh toán')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Tạo khoản điều chỉnh' }));
    expect(props.onAdjust).toHaveBeenCalledTimes(1);
  });

  it('lỗi xoá khác (không phải WALLET_004) hiện như lỗi thường, KHÔNG có thông báo khoá', async () => {
    await renderBody({ deleteError: apiError(500, 'SYS_500') });

    expect(screen.queryByText('Khoản chi này đã có người thanh toán')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Tạo khoản điều chỉnh' })).toBeNull();
  });

  it('người không quản lý được (canManage=false) không thấy thông báo/hành động nào', async () => {
    await renderBody({
      expense: {
        ...EXPENSE,
        canManage: false,
        shares: [{ ...EXPENSE.shares[0]!, paidAmount: 1000, status: 'PAID' }],
      },
    });
    expect(screen.queryByText('Khoản chi này đã có người thanh toán')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Tạo khoản điều chỉnh' })).toBeNull();
  });

  it('khoản ĐIỀU CHỈNH không có lối điều chỉnh tiếp', async () => {
    await renderBody({ expense: { ...EXPENSE, adjustsExpenseId: 'e0', kind: 'ADJUSTMENT' } });
    expect(screen.queryByRole('button', { name: 'Tạo khoản điều chỉnh' })).toBeNull();
  });

  it('hiện ai nợ bao nhiêu kèm trạng thái bằng CHỮ, và người trả không có dòng nợ', async () => {
    await renderBody();
    expect(screen.getByLabelText('Bình nợ 75.000 VND, Chưa trả')).toBeOnTheScreen();
    expect(screen.getByText(/Người trả \(Bạn\) không nợ khoản này/)).toBeOnTheScreen();
  });
});
