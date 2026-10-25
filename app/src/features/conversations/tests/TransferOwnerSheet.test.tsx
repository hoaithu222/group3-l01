import { render, screen, userEvent } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import type { MemberListItem } from '../api/conversations.types';
import { TransferOwnerSheet } from '../components/TransferOwnerSheet';

/**
 * Chuyển quyền chủ nhóm KHÔNG tự hoàn tác được: chọn MỘT người (nhóm radio, người đang chọn có `selected`) rồi gõ lại ĐÚNG tên người đó
 * ở ô ĐÁY tấm — nút "Chuyển quyền" chỉ mở khoá khi tên khớp. Đổi người thì chữ đã gõ bị xoá (tên cũ không bao giờ khớp người mới).
 */
const METRICS: Metrics = {
  frame: { height: 812, width: 375, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 44 },
};

function Wrapper({ children }: { children: ReactNode }) {
  return <SafeAreaProvider initialMetrics={METRICS}>{children}</SafeAreaProvider>;
}

function member(userId: string, name: string): MemberListItem {
  return {
    avatarUrl: null,
    joinedAt: '2026-09-01T00:00:00.000Z',
    name,
    presence: 'OFFLINE',
    role: 'MEMBER',
    userId,
  };
}

const MEMBERS = [member('u-an', 'An'), member('u-binh', 'Bình')];

async function setup() {
  const onClose = jest.fn();
  const onConfirm = jest.fn();
  await render(
    <TransferOwnerSheet members={MEMBERS} visible onClose={onClose} onConfirm={onConfirm} />,
    {
      wrapper: Wrapper,
    },
  );
  return { onClose, onConfirm };
}

describe('TransferOwnerSheet (hội thoại)', () => {
  it('chưa chọn ai: nhóm chọn một người, chưa có ô gõ tên, nút "Chuyển quyền" khoá kèm lời nhắc', async () => {
    await setup();

    // Khối bọc không `accessible` (từng hàng mới là ô trợ năng) nên `getByRole` không thấy nó — soát thẳng vai + nhãn nhóm.
    expect(screen.getByLabelText('Người nhận quyền chủ nhóm')).toHaveProp(
      'accessibilityRole',
      'radiogroup',
    );
    expect(screen.queryByLabelText(/Gõ lại tên/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Chuyển quyền' })).toBeDisabled();
    expect(screen.getByText('Chọn người nhận quyền trong danh sách')).toBeOnTheScreen();
  });

  it('chọn người → ô gõ lại tên hiện ở đáy; gõ đúng tên (không phân biệt hoa/thường) mới gửi đúng người', async () => {
    const { onConfirm } = await setup();

    await userEvent.press(screen.getByRole('button', { name: 'Bình' }));
    expect(screen.getByRole('button', { name: 'Bình' })).toBeSelected();
    expect(screen.getByRole('button', { name: 'Chuyển quyền' })).toBeDisabled();

    await userEvent.type(screen.getByLabelText('Gõ lại tên "Bình" để xác nhận'), 'bình');
    await userEvent.press(screen.getByRole('button', { name: 'Chuyển quyền' }));

    expect(onConfirm).toHaveBeenCalledWith('u-binh');
  });

  it('đổi sang người khác thì xoá chữ đã gõ cho người trước', async () => {
    await setup();

    await userEvent.press(screen.getByRole('button', { name: 'An' }));
    await userEvent.type(screen.getByLabelText('Gõ lại tên "An" để xác nhận'), 'An');
    await userEvent.press(screen.getByRole('button', { name: 'Bình' }));

    expect(screen.getByLabelText('Gõ lại tên "Bình" để xác nhận')).toHaveDisplayValue('');
    expect(screen.getByRole('button', { name: 'An' })).not.toBeSelected();
  });

  it('"Huỷ" chỉ đóng tấm, không chuyển quyền', async () => {
    const { onClose, onConfirm } = await setup();

    await userEvent.press(screen.getByRole('button', { name: 'Huỷ' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
