import { fireEvent, render, screen, userEvent, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { ExpenseDetailView } from '../api';
import { ExpenseDeleteDialog } from '../components/ExpenseDeleteDialog';
import { ExpenseHeaderActions } from '../components/ExpenseHeaderActions';
import { expenseActionState } from '../utils/expense-actions';
import { apiError } from './api-error.helpers';

/** `ActionMenu` mở `BottomSheet`: thư viện bàn phím gọi native lúc nạp module và `useSafeAreaInsets` cần provider. */
jest.mock('react-native-keyboard-controller', () =>
  jest.requireActual('react-native-keyboard-controller/jest'),
);

const METRICS = {
  frame: { height: 812, width: 375, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 44 },
};
const Wrapper = ({ children }: { children: ReactNode }) => (
  <SafeAreaProvider initialMetrics={METRICS}>{children}</SafeAreaProvider>
);

async function renderActions(offline = false) {
  const props = { onAdjust: jest.fn(), onDelete: jest.fn(), onEdit: jest.fn() };
  await render(<ExpenseHeaderActions offline={offline} {...props} />, { wrapper: Wrapper });
  return props;
}

const openMenu = async () =>
  userEvent.press(screen.getByRole('button', { name: 'Thêm thao tác cho khoản chi' }));

describe('ExpenseHeaderActions — hành động của khoản chi ở thanh tiêu đề', () => {
  it('"Sửa" là icon riêng ở thanh tiêu đề; bấm gọi onEdit', async () => {
    const props = await renderActions();

    await fireEvent.press(screen.getByRole('button', { name: 'Sửa khoản chi' }));

    expect(props.onEdit).toHaveBeenCalledTimes(1);
  });

  it('"Tạo khoản điều chỉnh" và "Xoá khoản chi" chỉ hiện khi mở menu "⋯"', async () => {
    await renderActions();
    expect(screen.queryByText('Xoá khoản chi')).toBeNull();

    await openMenu();

    expect(await screen.findByText('Tạo khoản điều chỉnh')).toBeOnTheScreen();
    expect(screen.getByText('Xoá khoản chi')).toBeOnTheScreen();
  });

  it('chọn "Tạo khoản điều chỉnh" gọi onAdjust, không đụng tới xoá', async () => {
    const props = await renderActions();

    await openMenu();
    await userEvent.press(await screen.findByText('Tạo khoản điều chỉnh'));

    await waitFor(() => expect(props.onAdjust).toHaveBeenCalledTimes(1));
    expect(props.onDelete).not.toHaveBeenCalled();
  });

  it('chọn "Xoá khoản chi" chỉ YÊU CẦU xoá (hộp thoại xác nhận do màn cha mở)', async () => {
    const props = await renderActions();

    await openMenu();
    await userEvent.press(await screen.findByText('Xoá khoản chi'));

    await waitFor(() => expect(props.onDelete).toHaveBeenCalledTimes(1));
    expect(props.onAdjust).not.toHaveBeenCalled();
  });

  it('mất mạng ⇒ chỉ đọc: "Sửa" khoá và các mục menu không chạy', async () => {
    const props = await renderActions(true);

    expect(screen.getByRole('button', { name: 'Sửa khoản chi' })).toBeDisabled();
    await openMenu();
    await userEvent.press(await screen.findByText('Xoá khoản chi'));

    expect(screen.getAllByText('Cần kết nối mạng').length).toBeGreaterThan(0);
    expect(props.onDelete).not.toHaveBeenCalled();
  });
});

describe('ExpenseDeleteDialog', () => {
  it('xoá phải qua hộp thoại: "Xoá khoản chi" xác nhận, "Không xoá" đóng mà không xoá', async () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    await render(
      <ExpenseDeleteDialog deleting={false} visible onCancel={onCancel} onConfirm={onConfirm} />,
    );

    expect(screen.getByText('Xoá khoản chi này?')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Không xoá' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole('button', { name: 'Xoá khoản chi' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});

describe('expenseActionState — ai được sửa/xoá', () => {
  const base = {
    canManage: true,
    kind: 'EXPENSE',
    shares: [{ amount: 75000, creditorId: 'an', debtorId: 'binh', id: 's1', paidAmount: 0, status: 'UNPAID' }],
  } as unknown as ExpenseDetailView;

  it('quản lý được + chưa ai trả ⇒ sửa/xoá được', () => {
    expect(expenseActionState(base, null)).toEqual({
      canEditOrDelete: true,
      locked: false,
      manageable: true,
    });
  });

  it('đã có người trả (paidAmount > 0 hoặc PAID/PARTIAL) ⇒ khoá, chỉ còn lối điều chỉnh', () => {
    const paid = { ...base, shares: [{ ...base.shares[0]!, paidAmount: 1, status: 'PARTIAL' }] };
    expect(expenseActionState(paid as ExpenseDetailView, null)).toMatchObject({
      canEditOrDelete: false,
      locked: true,
      manageable: true,
    });
  });

  it('BE trả WALLET_004 khi xoá ⇒ khoá dù client tính là chưa ai trả', () => {
    expect(expenseActionState(base, apiError(409, 'WALLET_004')).locked).toBe(true);
  });

  it('không có quyền quản lý hoặc là khoản ĐIỀU CHỈNH ⇒ không có hành động nào', () => {
    expect(expenseActionState({ ...base, canManage: false }, null).canEditOrDelete).toBe(false);
    expect(
      expenseActionState({ ...base, kind: 'ADJUSTMENT' } as ExpenseDetailView, null).manageable,
    ).toBe(false);
  });
});
