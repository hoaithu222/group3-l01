import { fireEvent, screen } from '@testing-library/react-native';

import {
  LeaveMeetingDialog,
  type LeaveMeetingDialogProps,
} from '../../../components/dialogs/LeaveMeetingDialog';
import { makePerson } from '../../fixtures';
import { renderWithProviders } from '../prejoin/render-helpers';

/**
 * `LeaveMeetingDialog` (app.md p2-05 §3.2): người thường 2 nút; chủ trì/đồng chủ trì 3 lựa chọn, "Kết thúc cho mọi người" phải xác nhận LẦN HAI,
 * "Rời và giao quyền" phải chọn người rồi xác nhận (chạm nhầm một hàng không rời phòng).
 */

const CANDIDATES = [
  makePerson({ name: 'Cường', userId: 'u3' }),
  makePerson({ name: 'Dũng', userId: 'u4' }),
];

function makeProps(over: Partial<LeaveMeetingDialogProps> = {}): LeaveMeetingDialogProps {
  return {
    candidates: CANDIDATES,
    hostLike: false,
    onClose: jest.fn(),
    onEndForAll: jest.fn(),
    onLeave: jest.fn(),
    onLeaveAndTransfer: jest.fn(),
    visible: true,
    ...over,
  };
}

describe('LeaveMeetingDialog — người thường', () => {
  it('tấm "Rời cuộc họp?" đúng 2 nút xếp dọc (nút chính trên); không có mục kết thúc hay giao quyền', async () => {
    const props = makeProps();
    await renderWithProviders(<LeaveMeetingDialog {...props} />);

    expect(screen.getByRole('header', { name: 'Rời cuộc họp?' })).toBeOnTheScreen();
    expect(
      screen
        .getAllByRole('button')
        .map((b) => b.props.accessibilityLabel)
        .filter((l) => l !== 'Đóng'),
    ).toEqual(['Rời cuộc họp', 'Ở lại']);
    expect(screen.queryByText('Kết thúc cho mọi người')).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: 'Rời cuộc họp' }));
    expect(props.onLeave).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByRole('button', { name: 'Ở lại' }));
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('đang xử lý: nút "Rời cuộc họp" báo busy và không gọi lại', async () => {
    const props = makeProps({ busy: true });
    await renderWithProviders(<LeaveMeetingDialog {...props} />);

    const leave = screen.getByRole('button', { name: 'Rời cuộc họp' });
    expect(leave).toBeBusy();
    await fireEvent.press(leave);
    expect(props.onLeave).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Ở lại' })).toBeDisabled();
  });

  it('visible=false: không dựng gì', async () => {
    await renderWithProviders(<LeaveMeetingDialog {...makeProps({ visible: false })} />);

    expect(screen.queryByText('Rời cuộc họp?')).toBeNull();
  });
});

/**
 * Ba lựa chọn của chủ trì là HÀNG menu (`ListItem`): tên trợ năng = nhãn + mô tả hệ quả bên dưới ⇒ khớp theo ĐẦU câu.
 * ⚠️ Mẫu phải neo `^` — "Rời và giao quyền cho…" cũng bắt đầu bằng "Rời".
 */
const OPTION = {
  end: /^Kết thúc cho mọi người/,
  leave: /^Rời \(giữ cuộc họp\)/,
  transfer: /^Rời và giao quyền cho…/,
} as const;
const option = (name: RegExp) => screen.getByRole('button', { name });

describe('LeaveMeetingDialog — chủ trì/đồng chủ trì', () => {
  it('đúng 3 lựa chọn, "Rời (giữ cuộc họp)" gọi onLeave ngay', async () => {
    const props = makeProps({ hostLike: true });
    await renderWithProviders(<LeaveMeetingDialog {...props} />);

    expect(option(OPTION.leave)).toBeOnTheScreen();
    expect(option(OPTION.transfer)).toBeOnTheScreen();
    expect(option(OPTION.end)).toBeOnTheScreen();

    await fireEvent.press(option(OPTION.leave));
    expect(props.onLeave).toHaveBeenCalledTimes(1);
    expect(props.onEndForAll).not.toHaveBeenCalled();
  });

  it('"Kết thúc cho mọi người" cần xác nhận lần 2 (tiêu đề nói rõ hậu quả); có thể quay lại mà không kết thúc', async () => {
    const props = makeProps({ hostLike: true });
    await renderWithProviders(<LeaveMeetingDialog {...props} />);

    await fireEvent.press(option(OPTION.end));
    expect(props.onEndForAll).not.toHaveBeenCalled();
    expect(screen.getByText('Kết thúc cuộc họp cho mọi người?')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Quay lại' }));
    expect(option(OPTION.leave)).toBeOnTheScreen();
    expect(props.onEndForAll).not.toHaveBeenCalled();

    await fireEvent.press(option(OPTION.end));
    await fireEvent.press(screen.getByRole('button', { name: 'Kết thúc' }));
    expect(props.onEndForAll).toHaveBeenCalledTimes(1);
  });

  it('bước xác nhận kết thúc đang xử lý: nút "Kết thúc" báo busy, "Quay lại" khoá', async () => {
    const props = makeProps({ hostLike: true });
    const { rerender } = await renderWithProviders(<LeaveMeetingDialog {...props} />);

    await fireEvent.press(option(OPTION.end));
    await rerender(<LeaveMeetingDialog {...props} busy />);

    expect(screen.getByRole('button', { name: 'Kết thúc' })).toBeBusy();
    expect(screen.getByRole('button', { name: 'Quay lại' })).toBeDisabled();
  });

  it('giao quyền: chọn người rồi mới bật "Rời và giao quyền"; gọi onLeaveAndTransfer đúng người', async () => {
    const props = makeProps({ hostLike: true });
    await renderWithProviders(<LeaveMeetingDialog {...props} />);

    await fireEvent.press(option(OPTION.transfer));
    expect(screen.getByText('Cường')).toBeOnTheScreen();
    expect(screen.getByText('Dũng')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Rời và giao quyền' })).toBeDisabled();

    await fireEvent.press(screen.getByText('Dũng'));
    expect(screen.getByLabelText('Đang chọn')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Rời và giao quyền' }));
    expect(props.onLeaveAndTransfer).toHaveBeenCalledWith('u4');
    expect(props.onLeave).not.toHaveBeenCalled();
  });

  it('giao quyền: "Quay lại" về bước chọn, không rời phòng', async () => {
    const props = makeProps({ hostLike: true });
    await renderWithProviders(<LeaveMeetingDialog {...props} />);

    await fireEvent.press(option(OPTION.transfer));
    await fireEvent.press(screen.getByRole('button', { name: 'Quay lại' }));

    expect(option(OPTION.leave)).toBeOnTheScreen();
    expect(props.onLeave).not.toHaveBeenCalled();
    expect(props.onLeaveAndTransfer).not.toHaveBeenCalled();
  });

  it('chưa có ai khác trong phòng: không giao quyền được và nói lý do ngay trên hàng đó', async () => {
    await renderWithProviders(
      <LeaveMeetingDialog {...makeProps({ candidates: [], hostLike: true })} />,
    );

    expect(option(OPTION.transfer)).toBeDisabled();
    expect(screen.getByText('Chưa có ai khác trong phòng')).toBeOnTheScreen();
  });

  it('đang xử lý: các lựa chọn khoá, hàng "Rời" có vòng quay kèm nhãn cho trình đọc màn hình', async () => {
    const props = makeProps({ busy: true, hostLike: true });
    await renderWithProviders(<LeaveMeetingDialog {...props} />);

    expect(screen.getByLabelText('Đang rời cuộc họp')).toBeBusy();
    expect(option(OPTION.leave)).toBeDisabled();
    expect(option(OPTION.transfer)).toBeDisabled();
    expect(option(OPTION.end)).toBeDisabled();

    await fireEvent.press(option(OPTION.leave));
    expect(props.onLeave).not.toHaveBeenCalled();
  });
});
