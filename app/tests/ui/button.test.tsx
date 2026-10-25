import { render, userEvent } from '@testing-library/react-native';

import { Button, LinkButton } from '@/shared/ui/button';

/**
 * Test HÀNH VI của nhóm `button`.
 *
 * ⛔ Đừng thêm assertion về style: trong Jest, `className` KHÔNG biến thành
 * `style` (phần biên dịch Tailwind là việc của Metro, Jest không chạy Metro),
 * nên `toHaveStyle({ height: 48 })` luôn đỏ dù component đúng. Chi tiết ở
 * `docs/rules/testing.md` và `tests/shared/rendering.test.tsx`.
 *
 * ⚠️ `render()` của RNTL 14 là BẤT ĐỒNG BỘ — phải `await`. Quên `await` thì mọi
 * truy vấn báo "`render` function has not been called", một thông báo chỉ sai
 * hướng hoàn toàn.
 */
describe('Button', () => {
  it('hiện nhãn và gọi onPress khi bấm', async () => {
    const onPress = jest.fn();
    const screen = await render(<Button label="Tiếp tục" onPress={onPress} />);

    expect(screen.getByText('Tiếp tục')).toBeOnTheScreen();

    await userEvent.press(screen.getByRole('button'));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('nhận `children` thay cho `label`', async () => {
    const screen = await render(<Button variant="secondary">Xem chi tiết</Button>);

    expect(screen.getByText('Xem chi tiết')).toBeOnTheScreen();
  });

  it('KHÔNG gọi onPress khi bị vô hiệu hoá, và báo `disabled` cho trình đọc màn hình', async () => {
    const onPress = jest.fn();
    const screen = await render(<Button disabled label="Gửi" onPress={onPress} />);

    await userEvent.press(screen.getByRole('button'));

    expect(onPress).not.toHaveBeenCalled();
    expect(screen.getByRole('button')).toBeDisabled();
  });

  /**
   * ⛔ Đây là lý do nút này tồn tại thay vì `Pressable` trần. Không khoá lúc
   * đang gửi thì người dùng bấm lần thứ hai vì lần đầu chưa thấy gì xảy ra — và
   * backend tạo HAI giao dịch.
   */
  it('khoá nút và báo `busy` khi đang gửi', async () => {
    const onPress = jest.fn();
    const screen = await render(<Button label="Chuyển tiền" loading onPress={onPress} />);

    await userEvent.press(screen.getByRole('button'));

    expect(onPress).not.toHaveBeenCalled();
    expect(screen.getByRole('button')).toBeBusy();
  });

  /**
   * Nhãn chỉ bị làm TRONG SUỐT chứ không gỡ khỏi cây — đó là cách giữ nguyên bề
   * rộng nút lúc quay. Kiểm ở đây để lần refactor sau không "dọn" mất nó.
   */
  it('giữ nhãn trong cây khi đang gửi để bề rộng nút không đổi', async () => {
    const screen = await render(<Button label="Chuyển tiền" loading />);

    expect(screen.getByText('Chuyển tiền')).toBeOnTheScreen();
  });

  it('nút chỉ-icon có nhãn cho trình đọc màn hình', async () => {
    const onPress = jest.fn();
    const screen = await render(
      <Button accessibilityLabel="Đóng" iconLeft="cancel" iconOnly size="xs" onPress={onPress} />,
    );

    // Không có chữ nào trên màn: `accessibilityLabel` là dấu hiệu DUY NHẤT.
    expect(screen.getByLabelText('Đóng')).toBeOnTheScreen();

    await userEvent.press(screen.getByRole('button'));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  /**
   * Vùng chạm ≥ 44dp (`docs/rules/mobile-ux.md`). Nút chỉ-icon là Ô VUÔNG nên
   * nó hụt ở CẢ HAI chiều — `xs` là 32×32, cần bù 6dp mỗi phía.
   *
   * ⚠️ Kiểm PROP `hitSlop` chứ không phải style: đây là dữ liệu React Native
   * đọc thật, và nó không đi qua NativeWind nên Jest thấy đúng giá trị.
   */
  it('nút chỉ-icon có vùng chạm nới đều BỐN phía cho đủ 44dp', async () => {
    const screen = await render(
      <Button accessibilityLabel="Đóng" iconLeft="cancel" iconOnly size="xs" />,
    );

    expect(screen.getByRole('button').props.hitSlop).toEqual({
      bottom: 6,
      left: 6,
      right: 6,
      top: 6,
    });
  });

  /**
   * Nút CÓ CHỮ thì cố ý chỉ nới theo chiều dọc: cặp "Huỷ / Xác nhận" nằm sát
   * nhau, nới ngang thì cú chạm rơi vào NHẦM nút. Khoá lại để lần sau không ai
   * "thống nhất" hai bảng làm một.
   */
  it('nút có chữ chỉ nới vùng chạm theo chiều DỌC', async () => {
    const screen = await render(<Button label="Huỷ" size="xs" />);

    expect(screen.getByRole('button').props.hitSlop).toEqual({ bottom: 6, top: 6 });
  });

  it('render được mọi biến thể và cỡ', async () => {
    const screen = await render(
      <>
        <Button label="A" size="lg" testID="a" variant="danger" />
        <Button fullWidth label="B" size="sm" testID="b" variant="white-secondary" />
        <Button
          iconLeft="arrow-left"
          iconRight="arrow-right"
          label="C"
          testID="c"
          variant="tertiary"
        />
      </>,
    );

    expect(screen.getByTestId('a')).toBeOnTheScreen();
    expect(screen.getByTestId('b')).toBeOnTheScreen();
    expect(screen.getByTestId('c')).toBeOnTheScreen();
  });
});

describe('LinkButton', () => {
  it('gọi onPress khi bấm', async () => {
    const onPress = jest.fn();
    const screen = await render(<LinkButton label="Quên mật khẩu?" onPress={onPress} />);

    await userEvent.press(screen.getByRole('button'));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('KHÔNG gọi onPress khi bị vô hiệu hoá', async () => {
    const onPress = jest.fn();
    const screen = await render(<LinkButton disabled label="Xem tất cả" onPress={onPress} />);

    await userEvent.press(screen.getByRole('button'));

    expect(onPress).not.toHaveBeenCalled();
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('khoá và báo `busy` khi đang gửi', async () => {
    const onPress = jest.fn();
    const screen = await render(
      <LinkButton label="Gửi lại mã" loading size="md" tone="info" onPress={onPress} />,
    );

    await userEvent.press(screen.getByRole('button'));

    expect(onPress).not.toHaveBeenCalled();
    expect(screen.getByRole('button')).toBeBusy();
  });
});
