import { fireEvent, render, screen } from '@testing-library/react-native';

import type { SettlementView } from '../api';
import { MyPendingSettlementRow } from '../components/MyPendingSettlementRow';
import { PendingSettlementCard } from '../components/PendingSettlementCard';

jest.mock('@/core/uploads/use-asset-url', () => ({
  useAssetUrl: () => ({ data: undefined, isPending: true, refetch: jest.fn() }),
}));

const SETTLEMENT: SettlementView = {
  allocations: [{ amount: 37500, shareId: 's1' }],
  amount: 37500,
  cancelledAt: null,
  code: 'ABCD2345',
  confirmedAt: null,
  createdAt: '2026-09-11T03:00:00.000Z',
  fromId: 'binh',
  id: 'st1',
  method: 'BANK',
  note: 'Tiền ăn tối',
  proofAssetId: null,
  rejectReason: null,
  rejectedAt: null,
  status: 'PENDING',
  toId: 'an',
  version: 1,
  workspaceId: 'w1',
};

async function renderCard(
  overrides: Partial<React.ComponentProps<typeof PendingSettlementCard>> = {},
) {
  const props = {
    fromName: 'Bình',
    meId: 'an',
    onConfirm: jest.fn(),
    onReject: jest.fn(),
    settlement: SETTLEMENT,
    ...overrides,
  };
  await render(<PendingSettlementCard {...props} />);
  return props;
}

describe('PendingSettlementCard — CHỈ hiện cho NGƯỜI NHẬN', () => {
  it('người nhận thấy thẻ với số tiền, mã nội dung CK và hai nút', async () => {
    await renderCard();

    expect(screen.getByText('Bình báo đã trả bạn 37.500 VND')).toBeOnTheScreen();
    expect(screen.getByText(/Mã SA ABCD2345/)).toBeOnTheScreen();
    expect(screen.getByText('“Tiền ăn tối”')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: /^Đã nhận / })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: /^Từ chối khoản / })).toBeOnTheScreen();
  });

  it('NGƯỜI GỬI không thấy thẻ (không có nút tự xác nhận khoản mình trả)', async () => {
    await renderCard({ meId: 'binh' });
    expect(screen.queryByText(/báo đã trả bạn/)).toBeNull();
    expect(screen.queryByRole('button', { name: /^Đã nhận / })).toBeNull();
  });

  it.each([
    ['người thứ ba không liên quan', 'cuong'],
    ['chưa biết mình là ai', undefined],
  ])('%s cũng không thấy thẻ', async (_name, meId) => {
    await renderCard({ meId });
    expect(screen.queryByRole('button', { name: /^Đã nhận / })).toBeNull();
  });

  it.each(['CONFIRMED', 'REJECTED', 'CANCELLED'] as const)(
    'không còn PENDING (%s) ⇒ không hiện',
    async (status) => {
      await renderCard({ settlement: { ...SETTLEMENT, status } });
      expect(screen.queryByRole('button', { name: /^Đã nhận / })).toBeNull();
    },
  );

  it('xác nhận phải qua HỘP THOẠI (đổi sổ nợ, không hoàn tác) — bấm "Đã nhận" chưa gọi ngay', async () => {
    const props = await renderCard();

    await fireEvent.press(screen.getByRole('button', { name: /^Đã nhận / }));
    expect(props.onConfirm).not.toHaveBeenCalled();
    expect(screen.getByText('Xác nhận đã nhận tiền?')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Xác nhận đã nhận' }));
    expect(props.onConfirm).toHaveBeenCalledTimes(1);
    expect(props.onConfirm).toHaveBeenCalledWith(SETTLEMENT);
  });

  it('"Chưa" trong hộp thoại thì không xác nhận gì', async () => {
    const props = await renderCard();

    await fireEvent.press(screen.getByRole('button', { name: /^Đã nhận / }));
    await fireEvent.press(screen.getByRole('button', { name: 'Chưa' }));

    expect(props.onConfirm).not.toHaveBeenCalled();
  });

  it('từ chối: gọi onReject để màn cha mở tấm nhập lý do', async () => {
    const props = await renderCard();
    await fireEvent.press(screen.getByRole('button', { name: /^Từ chối khoản / }));
    expect(props.onReject).toHaveBeenCalledWith(SETTLEMENT);
  });

  it('đang xử lý (busy) ⇒ cả hai nút khoá — bấm đúp không thành hai lượt', async () => {
    await renderCard({ busy: true });
    expect(screen.getByRole('button', { name: /^Đã nhận / })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^Từ chối khoản / })).toBeDisabled();
  });
});

describe('MyPendingSettlementRow — phía NGƯỜI GỬI', () => {
  it('chỉ người gửi thấy, kèm nút Huỷ; KHÔNG có nút xác nhận', async () => {
    const onCancel = jest.fn();
    await render(
      <MyPendingSettlementRow
        meId="binh"
        settlement={SETTLEMENT}
        toName="An"
        onCancel={onCancel}
      />,
    );

    expect(screen.getByText('Chờ An xác nhận 37.500 VND')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /^Đã nhận / })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: /^Huỷ khoản báo chuyển / }));
    expect(onCancel).toHaveBeenCalledWith(SETTLEMENT);
  });

  it('người nhận không thấy hàng này', async () => {
    await render(
      <MyPendingSettlementRow meId="an" settlement={SETTLEMENT} toName="An" onCancel={jest.fn()} />,
    );
    expect(screen.queryByText(/Chờ An xác nhận/)).toBeNull();
  });
});
