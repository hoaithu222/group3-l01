import { fireEvent, render } from '@testing-library/react-native';

import { ComposerRow, type ComposerRowProps } from '../components/composer/ComposerRow';

/**
 * ⚠️ Chỉ test HÀNH VI (nút nào hiện, bấm gọi gì, nhãn trợ năng) — NativeWind không biên dịch `className` trong
 * Jest nên KHÔNG kiểm được căn lề/kích thước; phần canh trục ngang của hàng đã kiểm trên máy thật.
 * `render()` của RNTL 14 là BẤT ĐỒNG BỘ, phải `await`.
 */
function props(overrides: Partial<ComposerRowProps> = {}): ComposerRowProps {
  return {
    hasContent: false,
    canSend: false,
    input: { value: '', onChangeText: jest.fn() },
    onAttach: jest.fn(),
    onRecorded: jest.fn(),
    onSend: jest.fn(),
    ...overrides,
  };
}

describe('ComposerRow', () => {
  it('ô trống: hiện nút Ghi âm, KHÔNG hiện nút Gửi', async () => {
    const screen = await render(<ComposerRow {...props()} />);

    expect(screen.getByLabelText('Ghi âm tin nhắn thoại')).toBeOnTheScreen();
    expect(screen.queryByLabelText('Gửi')).toBeNull();
  });

  it('có nội dung: hiện nút Gửi thay cho Ghi âm, bấm gọi onSend', async () => {
    const onSend = jest.fn();
    const screen = await render(<ComposerRow {...props({ hasContent: true, canSend: true, onSend })} />);

    expect(screen.queryByLabelText('Ghi âm tin nhắn thoại')).toBeNull();
    fireEvent.press(screen.getByLabelText('Gửi'));

    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it('có nội dung nhưng chưa gửi được: nút Gửi bị khoá, bấm không gọi onSend', async () => {
    const onSend = jest.fn();
    const screen = await render(<ComposerRow {...props({ hasContent: true, canSend: false, onSend })} />);

    const send = screen.getByLabelText('Gửi');
    expect(send).toBeDisabled();
    fireEvent.press(send);

    expect(onSend).not.toHaveBeenCalled();
  });

  it('nút Đính kèm gọi onAttach và ô nhập giữ nhãn trợ năng', async () => {
    const onAttach = jest.fn();
    const screen = await render(<ComposerRow {...props({ onAttach })} />);

    fireEvent.press(screen.getByLabelText('Đính kèm'));

    expect(onAttach).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Nội dung tin nhắn')).toBeOnTheScreen();
  });

  it('không truyền `emoji`: không có nút emoji (hàng vẫn dựng được chỉ với Đính kèm · ô nhập · Gửi/Mic)', async () => {
    const screen = await render(<ComposerRow {...props()} />);

    expect(screen.queryByLabelText('Biểu tượng cảm xúc')).toBeNull();
    expect(screen.queryByLabelText('Bàn phím')).toBeNull();
  });

  it('nút emoji (bảng đóng): bấm gọi onToggle, chưa ở trạng thái "đang chọn"', async () => {
    const onToggle = jest.fn();
    const screen = await render(<ComposerRow {...props({ emoji: { open: false, onToggle } })} />);

    await fireEvent.press(screen.getByLabelText('Biểu tượng cảm xúc'));

    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Biểu tượng cảm xúc')).not.toBeSelected();
  });

  it('nút emoji (bảng đang mở): đổi thành "Bàn phím" để quay lại gõ chữ, bấm vẫn gọi onToggle', async () => {
    const onToggle = jest.fn();
    const screen = await render(<ComposerRow {...props({ emoji: { open: true, onToggle } })} />);

    expect(screen.queryByLabelText('Biểu tượng cảm xúc')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Bàn phím'));

    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Bàn phím')).toBeSelected();
  });

  it('nút Gửi luôn là nút có đĩa nền: bấm được khi canSend', async () => {
    const onSend = jest.fn();
    const screen = await render(<ComposerRow {...props({ hasContent: true, canSend: true, onSend })} />);

    expect(screen.getByLabelText('Gửi')).toBeEnabled();
    await fireEvent.press(screen.getByLabelText('Gửi'));

    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it('ô nhập báo onFocus (ComposerBody dùng để đóng bảng emoji khi chạm lại ô)', async () => {
    const onFocus = jest.fn();
    const screen = await render(<ComposerRow {...props({ input: { value: '', onChangeText: jest.fn(), onFocus } })} />);

    await fireEvent(screen.getByLabelText('Nội dung tin nhắn'), 'focus');

    expect(onFocus).toHaveBeenCalledTimes(1);
  });
});
