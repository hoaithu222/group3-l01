import { render, userEvent } from '@testing-library/react-native';

import { Toggle } from '@/shared/ui/toggle';

/**
 * ⚠️ Chỉ test HÀNH VI — style của NativeWind không có trong Jest
 * (`docs/rules/testing.md`). ⚠️ `render()` của RNTL 14 phải `await`.
 *
 * ⚠️ Vị trí núm do Reanimated vẽ trên luồng UI nên KHÔNG kiểm được ở đây; cái
 * kiểm được (và cũng là cái hay hỏng) là công tắc báo về đúng giá trị và trình
 * đọc màn hình nghe đúng trạng thái.
 */
describe('Toggle', () => {
  it('bấm khi đang tắt thì báo về `true`', async () => {
    const onChange = jest.fn();
    const screen = await render(
      <Toggle label="Nhận thông báo" value={false} onChange={onChange} />,
    );

    await userEvent.press(screen.getByRole('switch'));

    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('bấm khi đang bật thì báo về `false`', async () => {
    const onChange = jest.fn();
    const screen = await render(<Toggle label="Nhận thông báo" value onChange={onChange} />);

    await userEvent.press(screen.getByRole('switch'));

    expect(onChange).toHaveBeenCalledWith(false);
  });

  /**
   * ⚠️ Vai `switch` đọc khoá `checked` (giống checkbox), KHÔNG phải `selected`.
   * Đặt nhầm khoá thì TalkBack đọc "công tắc" trống trơn và người dùng khiếm
   * thị không biết mình vừa bật hay vừa tắt.
   */
  it('trạng thái trợ năng bám theo `value`', async () => {
    const on = await render(<Toggle label="Nhận thông báo" value />);
    expect(on.getByRole('switch')).toBeChecked();

    const off = await render(<Toggle label="Nhận thông báo" value={false} />);
    expect(off.getByRole('switch')).not.toBeChecked();
  });

  /**
   * Component KHÔNG tự giữ state — nơi gọi (form) đổi `value` thì trạng thái
   * phải đi theo, kể cả khi bấm xong mà nơi gọi từ chối đổi (bấm không làm
   * công tắc tự lật).
   */
  it('không tự lật: chỉ đổi khi nơi gọi đổi `value`', async () => {
    const onChange = jest.fn();
    const screen = await render(<Toggle label="Cần biên bản" value={false} onChange={onChange} />);

    await userEvent.press(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledWith(true);
    expect(screen.getByRole('switch')).not.toBeChecked();

    await screen.rerender(<Toggle label="Cần biên bản" value onChange={onChange} />);
    expect(screen.getByRole('switch')).toBeChecked();
  });

  it('cỡ `sm` cũng bấm được và báo đúng trạng thái', async () => {
    const onChange = jest.fn();
    const screen = await render(
      <Toggle accessibilityLabel="Ghim" size="sm" value onChange={onChange} />,
    );

    await userEvent.press(screen.getByRole('switch'));

    expect(onChange).toHaveBeenCalledWith(false);
    expect(screen.getByRole('switch')).toBeChecked();
  });

  it('bị khoá thì không bấm được và trình đọc màn hình biết', async () => {
    const onChange = jest.fn();
    const screen = await render(
      <Toggle disabled label="Nhận thông báo" value={false} onChange={onChange} />,
    );

    await userEvent.press(screen.getByRole('switch'));

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('switch')).toBeDisabled();
  });

  it('hiện cả nhãn lẫn dòng mô tả', async () => {
    const screen = await render(
      <Toggle description="Áp dụng cho mọi giao dịch" label="Nhận thông báo" value />,
    );

    expect(screen.getByText('Nhận thông báo')).toBeOnTheScreen();
    expect(screen.getByText('Áp dụng cho mọi giao dịch')).toBeOnTheScreen();
  });

  /**
   * Công tắc đứng một mình (trong một hàng cài đặt đã có chữ riêng) vẫn phải
   * đọc được — nếu không trình đọc màn hình chỉ nói "công tắc, đã bật".
   */
  it('nhận nhãn trợ năng riêng khi không có nhãn nhìn thấy được', async () => {
    const screen = await render(<Toggle accessibilityLabel="Bật sinh trắc học" value={false} />);

    expect(screen.getByLabelText('Bật sinh trắc học')).toBeOnTheScreen();
  });
});
