import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import { TransferOwnerSheet, type TransferOwnerSheetProps } from '../components/TransferOwnerSheet';

/**
 * `TransferOwnerSheet` — chỗ SAI THÌ IM LẶNG của luồng chuyển quyền: nút chỉ
 * được mở khi tên gõ lại khớp KHÔNG DẤU (đúng như BE `normalizeSearch`), và
 * `onConfirm` phải mang đúng `toUserId` của người ĐÃ CHỌN.
 */

const METRICS: Metrics = {
  frame: { height: 812, width: 375, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 44 },
};

const MEMBERS = [
  { id: 'u-1', name: 'Nguyễn Văn An' },
  { id: 'u-2', name: 'Trần Thị Bình' },
];

/** Ô gõ lại tên có nhãn a11y "Gõ lại tên \"...\" để xác nhận" (`Input` gắn `label` làm `accessibilityLabel`). */
function confirmLabel(name: string): string {
  return `Gõ lại tên "${name}" để xác nhận`;
}

async function renderSheet(overrides: Partial<TransferOwnerSheetProps> = {}) {
  const props: TransferOwnerSheetProps = {
    members: MEMBERS,
    onClose: jest.fn(),
    onConfirm: jest.fn(),
    visible: true,
    ...overrides,
  };
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <TransferOwnerSheet {...props} />
    </SafeAreaProvider>,
  );
  return props;
}

describe('TransferOwnerSheet', () => {
  it('hiện danh sách thành viên thật do màn cha truyền xuống (không còn "chưa có ai")', async () => {
    await renderSheet();
    expect(screen.getByText('Nguyễn Văn An')).toBeOnTheScreen();
    expect(screen.getByText('Trần Thị Bình')).toBeOnTheScreen();
    expect(screen.queryByText('Chưa có ai để chọn')).toBeNull();
  });

  it('danh sách rỗng ⇒ nói rõ cần thêm thành viên; lỗi tải ⇒ có "Thử lại" (hai ca khác hẳn nhau)', async () => {
    await renderSheet({ members: [] });
    expect(screen.getByText('Chưa có ai để chọn')).toBeOnTheScreen();
  });

  it('lỗi tải ⇒ hiện "Thử lại" và gọi onRetry', async () => {
    const onRetry = jest.fn();
    await renderSheet({ members: [], membersError: true, onRetry });
    expect(screen.queryByText('Chưa có ai để chọn')).toBeNull();
    await fireEvent.press(screen.getByText('Thử lại'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('chưa chọn ai / chưa gõ tên ⇒ nút "Chuyển quyền" khoá', async () => {
    await renderSheet();
    expect(screen.getByRole('button', { name: 'Chuyển quyền' })).toBeDisabled();

    await fireEvent.press(screen.getByText('Nguyễn Văn An'));
    expect(screen.getByRole('button', { name: 'Chuyển quyền' })).toBeDisabled();
  });

  it('gõ lại tên KHÔNG DẤU, khác hoa/thường ⇒ khớp, nút mở, onConfirm mang đúng toUserId', async () => {
    const props = await renderSheet();

    await fireEvent.press(screen.getByText('Trần Thị Bình'));
    await fireEvent.changeText(screen.getByLabelText(confirmLabel('Trần Thị Bình')), 'tran thi binh');

    expect(screen.getByText('Tên khớp')).toBeOnTheScreen();
    const confirm = screen.getByRole('button', { name: 'Chuyển quyền' });
    expect(confirm).toBeEnabled();

    await fireEvent.press(confirm);
    expect(props.onConfirm).toHaveBeenCalledWith({ toUserId: 'u-2', confirmName: 'tran thi binh' });
  });

  it('gõ tên NGƯỜI KHÁC ⇒ vẫn khoá (chống bấm nhầm)', async () => {
    await renderSheet();

    await fireEvent.press(screen.getByText('Trần Thị Bình'));
    await fireEvent.changeText(screen.getByLabelText(confirmLabel('Trần Thị Bình')), 'nguyen van an');

    expect(screen.queryByText('Tên khớp')).toBeNull();
    expect(screen.getByRole('button', { name: 'Chuyển quyền' })).toBeDisabled();
  });

  it('đổi người nhận ⇒ xoá tên đã gõ (tên cũ không được "dính" sang người mới)', async () => {
    await renderSheet();

    await fireEvent.press(screen.getByText('Nguyễn Văn An'));
    await fireEvent.changeText(screen.getByLabelText(confirmLabel('Nguyễn Văn An')), 'nguyen van an');
    await fireEvent.press(screen.getByText('Trần Thị Bình'));

    expect(screen.getByLabelText(confirmLabel('Trần Thị Bình')).props.value).toBe('');
    expect(screen.getByRole('button', { name: 'Chuyển quyền' })).toBeDisabled();
  });
});
