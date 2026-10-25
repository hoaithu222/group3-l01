import { render, userEvent } from '@testing-library/react-native';

import { SliderDot } from '@/shared/ui/pagination';

/**
 * ⚠️ Chỉ test HÀNH VI — style của NativeWind không có trong Jest
 * (`docs/rules/testing.md`). ⛔ Bề rộng chấm (4dp → 12dp khi được chọn) đi qua
 * hoạt ảnh Reanimated trên luồng UI nên cũng không đọc được ở đây; nó nghiệm
 * thu bằng mắt trên máy.
 *
 * Phần kiểm được là phần hay hỏng thật: cửa sổ trượt chọn đúng dải trang nào,
 * bấm một chấm báo về đúng SỐ TRANG THẬT (chứ không phải vị trí trong cửa sổ),
 * và hàng chấm nói gì với trình đọc màn hình.
 *
 * ⚠️ `render()` của RNTL 14 là BẤT ĐỒNG BỘ, phải `await`.
 */
describe('SliderDot', () => {
  /**
   * ⛔ Một trang thì KHÔNG có gì để chỉ, và một chấm đơn độc trông như lỗi hiển
   * thị chứ không như chỉ báo trang.
   */
  it('một trang thì không vẽ gì', async () => {
    const screen = await render(<SliderDot activeIndex={0} count={1} />);

    expect(screen.toJSON()).toBeNull();
  });

  it('không có trang nào thì cũng không vẽ gì', async () => {
    const screen = await render(<SliderDot activeIndex={0} count={0} />);

    expect(screen.toJSON()).toBeNull();
  });

  /**
   * Chế độ CHỈ NHÌN: cả hàng gộp thành MỘT phần tử mang nhãn "Trang 2 trên 5".
   * Để nguyên thì trình đọc màn hình đọc năm cái chấm rời rạc, mỗi chấm một lần
   * vuốt, và không chấm nào nói được nó là chấm thứ mấy.
   */
  it('chỉ để nhìn: gộp cả hàng thành một nhãn "Trang x trên y"', async () => {
    const screen = await render(<SliderDot activeIndex={1} count={5} />);

    expect(screen.getByLabelText('Trang 2 trên 5')).toBeOnTheScreen();
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
  });

  it('chỉ để nhìn: kẹp activeIndex vượt ngưỡng về trang cuối', async () => {
    const screen = await render(<SliderDot activeIndex={99} count={3} />);

    expect(screen.getByLabelText('Trang 3 trên 3')).toBeOnTheScreen();
  });

  it('chỉ để nhìn: kẹp activeIndex âm về trang đầu', async () => {
    const screen = await render(<SliderDot activeIndex={-4} count={3} />);

    expect(screen.getByLabelText('Trang 1 trên 3')).toBeOnTheScreen();
  });

  it('bấm được: mỗi chấm là một `tab` và bấm báo về đúng chỉ số', async () => {
    const onPressDot = jest.fn();
    const screen = await render(<SliderDot activeIndex={0} count={3} onPressDot={onPressDot} />);

    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(3);

    await userEvent.press(screen.getByRole('tab', { name: 'Trang 2 trên 3' }));

    expect(onPressDot).toHaveBeenCalledTimes(1);
    expect(onPressDot).toHaveBeenCalledWith(1);
  });

  /** ⛔ Đúng MỘT chấm ở trạng thái đang chọn — mất dấu là người dùng lạc trang. */
  it('bấm được: chỉ một chấm ở trạng thái đang chọn', async () => {
    const screen = await render(<SliderDot activeIndex={2} count={4} onPressDot={jest.fn()} />);

    const tabs = screen.getAllByRole('tab');

    expect(tabs.filter((tab) => tab.props.accessibilityState?.selected)).toHaveLength(1);
    expect(screen.getByRole('tab', { name: 'Trang 3 trên 4' })).toBeSelected();
  });

  /** Tới bốn trang thì vẽ đủ, không cần cửa sổ trượt. */
  it('bốn trang trở xuống thì vẽ đủ chấm', async () => {
    const screen = await render(<SliderDot activeIndex={0} count={4} onPressDot={jest.fn()} />);

    expect(screen.getAllByRole('tab')).toHaveLength(4);
    expect(screen.getByRole('tab', { name: 'Trang 4 trên 4' })).toBeOnTheScreen();
  });

  /**
   * Trên bốn trang thì hàng thu về cửa sổ trượt. Ba dải của Figma:
   *   · đầu dải  → 4 chấm đủ cỡ + 1 chấm nhỏ bên phải
   *   · cuối dải → 1 chấm nhỏ bên trái + 4 chấm đủ cỡ
   *   · giữa dải → nhỏ + 3 chấm + nhỏ
   * Chấm nhỏ chỉ là hình trang trí (không phải `tab`) nên ở đây đếm số `tab`.
   */
  it('trên bốn trang, ở đầu dải: bốn chấm đầu tiên', async () => {
    const screen = await render(<SliderDot activeIndex={0} count={10} onPressDot={jest.fn()} />);

    expect(screen.getAllByRole('tab')).toHaveLength(4);
    expect(screen.getByRole('tab', { name: 'Trang 1 trên 10' })).toBeOnTheScreen();
    expect(screen.getByRole('tab', { name: 'Trang 4 trên 10' })).toBeOnTheScreen();
    expect(screen.queryByRole('tab', { name: 'Trang 5 trên 10' })).toBeNull();
  });

  it('trên bốn trang, ở cuối dải: bốn chấm cuối cùng', async () => {
    const screen = await render(<SliderDot activeIndex={9} count={10} onPressDot={jest.fn()} />);

    expect(screen.getAllByRole('tab')).toHaveLength(4);
    expect(screen.getByRole('tab', { name: 'Trang 7 trên 10' })).toBeOnTheScreen();
    expect(screen.getByRole('tab', { name: 'Trang 10 trên 10' })).toBeSelected();
    expect(screen.queryByRole('tab', { name: 'Trang 6 trên 10' })).toBeNull();
  });

  /**
   * Giữa dải: chấm đang chọn nằm CHÍNH GIỮA, luôn có một chấm mỗi bên — hướng
   * vuốt nào cũng thấy trước được là còn trang.
   */
  it('trên bốn trang, ở giữa dải: chấm đang chọn nằm chính giữa ba chấm', async () => {
    const screen = await render(<SliderDot activeIndex={5} count={10} onPressDot={jest.fn()} />);

    const tabs = screen.getAllByRole('tab');

    expect(tabs).toHaveLength(3);
    expect(screen.getByRole('tab', { name: 'Trang 5 trên 10' })).toBeOnTheScreen();
    expect(screen.getByRole('tab', { name: 'Trang 6 trên 10' })).toBeSelected();
    expect(screen.getByRole('tab', { name: 'Trang 7 trên 10' })).toBeOnTheScreen();
  });

  /**
   * ⛔ Chỗ sai thì im lặng: trong cửa sổ trượt, chấm thứ nhất trên màn hình
   * KHÔNG phải trang 1. Báo về vị trí trong cửa sổ thay vì số trang thật thì
   * carousel nhảy về đầu dải mà không ai hiểu vì sao.
   */
  it('trong cửa sổ trượt, bấm báo về SỐ TRANG THẬT chứ không phải vị trí', async () => {
    const onPressDot = jest.fn();
    const screen = await render(<SliderDot activeIndex={5} count={10} onPressDot={onPressDot} />);

    await userEvent.press(screen.getByRole('tab', { name: 'Trang 7 trên 10' }));

    expect(onPressDot).toHaveBeenCalledTimes(1);
    expect(onPressDot).toHaveBeenCalledWith(6);
  });

  /** Đổi đường kính chấm thì hàng vẫn dựng đủ và vẫn bấm được. */
  it('đổi cỡ chấm không làm hỏng hàng', async () => {
    const onPressDot = jest.fn();
    const screen = await render(
      <SliderDot activeIndex={1} count={3} size={8} onPressDot={onPressDot} />,
    );

    expect(screen.getAllByRole('tab')).toHaveLength(3);

    await userEvent.press(screen.getByRole('tab', { name: 'Trang 3 trên 3' }));

    expect(onPressDot).toHaveBeenCalledWith(2);
  });
});
