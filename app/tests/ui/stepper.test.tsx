import { fireEvent, render } from '@testing-library/react-native';

import { Stepper } from '@/shared/ui/stepper';

/**
 * Ô tăng/giảm số lượng — test HÀNH VI.
 *
 * ⛔ Style của NativeWind KHÔNG có trong Jest (Metro mới biên dịch Tailwind),
 * nên `style` luôn rỗng — xem `docs/rules/testing.md`. Cái kiểm ở đây là thứ
 * KHÔNG ghép được từ hai cái nút rời: kẹp min/max, khoá đúng đầu, và phần trình
 * đọc màn hình.
 *
 * ⚠️ `render()` / `fireEvent()` của RNTL 14 là BẤT ĐỒNG BỘ, phải `await`.
 */
describe('Stepper', () => {
  it('bấm + và − gọi onChange với đúng giá trị kế tiếp', async () => {
    const onChange = jest.fn();
    const screen = await render(<Stepper max={10} min={1} value={3} onChange={onChange} />);

    await fireEvent.press(screen.getByLabelText('Tăng số lượng'));
    expect(onChange).toHaveBeenLastCalledWith(4);

    await fireEvent.press(screen.getByLabelText('Giảm số lượng'));
    expect(onChange).toHaveBeenLastCalledWith(2);
  });

  it('hiện đúng con số đang giữ', async () => {
    const screen = await render(<Stepper value={7} onChange={jest.fn()} />);

    expect(screen.getByText('7')).toBeOnTheScreen();
  });

  /** Điểm chấm bước 0,5 (p4-05) phải hiện theo quy ước Việt — dấu PHẨY — mà `value`/`onChange` vẫn là số thật. */
  it('formatValue đổi cách HIỆN (và lời xướng) chứ không đổi số', async () => {
    const onChange = jest.fn();
    const screen = await render(
      <Stepper
        formatValue={(v) => String(v).replace('.', ',')}
        max={10}
        step={0.5}
        value={2.5}
        onChange={onChange}
      />,
    );

    expect(screen.getByText('2,5')).toBeOnTheScreen();
    expect(screen.getByRole('adjustable')).toHaveProp('accessibilityValue', { max: 10, min: 0, now: 2.5, text: '2,5' });

    await fireEvent.press(screen.getByLabelText('Tăng số lượng'));
    expect(onChange).toHaveBeenLastCalledWith(3);
  });

  /**
   * ⛔ Khoá phải nói ra bằng `accessibilityState`, không chỉ bằng màu xám: trình
   * đọc màn hình không nhìn thấy màu. Thiếu nó thì người dùng khiếm thị bấm `−`
   * ở mức tối thiểu, không có gì xảy ra, không có gì được xướng lên.
   */
  it('chạm đáy thì khoá riêng nút −', async () => {
    const onChange = jest.fn();
    const screen = await render(<Stepper max={10} min={1} value={1} onChange={onChange} />);

    expect(screen.getByLabelText('Giảm số lượng')).toBeDisabled();
    expect(screen.getByLabelText('Tăng số lượng')).not.toBeDisabled();

    await fireEvent.press(screen.getByLabelText('Giảm số lượng'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('chạm trần thì khoá riêng nút +', async () => {
    const onChange = jest.fn();
    const screen = await render(<Stepper max={10} min={1} value={10} onChange={onChange} />);

    expect(screen.getByLabelText('Tăng số lượng')).toBeDisabled();
    expect(screen.getByLabelText('Giảm số lượng')).not.toBeDisabled();

    await fireEvent.press(screen.getByLabelText('Tăng số lượng'));
    expect(onChange).not.toHaveBeenCalled();
  });

  /** Bỏ trống `max` = không có trần: nghiệp vụ nào không giới hạn thì đừng bịa ra một. */
  it('không khai max thì nút + không bao giờ khoá', async () => {
    const onChange = jest.fn();
    const screen = await render(<Stepper value={9999} onChange={onChange} />);

    await fireEvent.press(screen.getByLabelText('Tăng số lượng'));

    expect(onChange).toHaveBeenLastCalledWith(10000);
  });

  it('disabled khoá cả hai nút', async () => {
    const onChange = jest.fn();
    const screen = await render(
      <Stepper disabled max={10} min={1} value={5} onChange={onChange} />,
    );

    await fireEvent.press(screen.getByLabelText('Tăng số lượng'));
    await fireEvent.press(screen.getByLabelText('Giảm số lượng'));

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Tăng số lượng')).toBeDisabled();
    expect(screen.getByLabelText('Giảm số lượng')).toBeDisabled();
  });

  it('step khác 1 thì nhảy đúng bước', async () => {
    const onChange = jest.fn();
    const screen = await render(<Stepper step={5} value={10} onChange={onChange} />);

    await fireEvent.press(screen.getByLabelText('Tăng số lượng'));

    expect(onChange).toHaveBeenLastCalledWith(15);
  });

  /**
   * ⛔ Kẹp lại chứ không cộng thẳng. `value=3, min=1, step=5` mà cộng thẳng ra
   * **−2**: số lượng ÂM đi vào giỏ hàng và chỉ hỏng ở tận lúc gọi API.
   */
  it('bước nhảy không chia hết vẫn dừng đúng ở biên', async () => {
    const onChange = jest.fn();
    const screen = await render(<Stepper min={1} step={5} value={3} onChange={onChange} />);

    await fireEvent.press(screen.getByLabelText('Giảm số lượng'));

    expect(onChange).toHaveBeenLastCalledWith(1);
  });

  /**
   * Nhãn của cả khối đổi được thì nhãn hai nút phải đổi theo — form có hai ô
   * tăng/giảm mà cả bốn nút cùng tên là bốn lựa chọn không phân biệt được.
   */
  it('accessibilityLabel đổi luôn nhãn hai nút', async () => {
    const screen = await render(
      <Stepper accessibilityLabel="Số chỉ vàng" value={2} onChange={jest.fn()} />,
    );

    expect(screen.getByLabelText('Tăng số chỉ vàng')).toBeOnTheScreen();
    expect(screen.getByLabelText('Giảm số chỉ vàng')).toBeOnTheScreen();
  });

  /**
   * ⛔ `adjustable` + `accessibilityValue` là cách DUY NHẤT trình đọc màn hình
   * đọc được "đang ở 3, trong khoảng 1–10" và xướng LẠI sau mỗi lần đổi. Mất
   * khoá này thì người dùng khiếm thị phải dò hai ô chạm 26dp cách nhau 42dp.
   */
  it('cả khối là một điều khiển adjustable có min/max/now', async () => {
    const screen = await render(<Stepper max={10} min={1} value={3} onChange={jest.fn()} />);
    const group = screen.getByLabelText('Số lượng');

    expect(group.props.accessibilityValue).toEqual({ max: 10, min: 1, now: 3 });
    expect(group).toHaveAccessibilityValue({ max: 10, min: 1, now: 3 });
  });

  /** Cử chỉ vuốt lên/xuống của TalkBack đi qua `onAccessibilityAction`, không qua onPress. */
  it('cử chỉ increment/decrement của trình đọc màn hình đổi được giá trị', async () => {
    const onChange = jest.fn();
    const screen = await render(<Stepper max={10} min={1} value={3} onChange={onChange} />);
    const group = screen.getByLabelText('Số lượng');

    await fireEvent(group, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    expect(onChange).toHaveBeenLastCalledWith(4);

    await fireEvent(group, 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
    expect(onChange).toHaveBeenLastCalledWith(2);
  });
});
