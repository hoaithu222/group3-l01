import { render, userEvent } from '@testing-library/react-native';

import { Button } from '@/shared/ui/button';

/**
 * Kiểm tra tầng render chạy được — nền cho mọi test component về sau.
 *
 * ── ⚠️ Giới hạn ĐÃ BIẾT: style của NativeWind KHÔNG có trong test ────────────
 * Trong môi trường Jest, `className` KHÔNG biến thành `style`: phần biên dịch
 * Tailwind là việc của Metro, mà Jest không chạy Metro. Element render ra có
 * `style` rỗng.
 *
 * ⛔ Đừng viết assertion kiểu `expect(el).toHaveStyle({ padding: 16 })` — nó
 * luôn đỏ, và người viết sẽ tưởng component sai. (`nativewind/test` có hàm
 * `render` tự biên dịch Tailwind, nhưng bản phát hành của nó chứa JSX chưa biên
 * dịch nên Jest không nạp được — đã thử 2026-09-08.)
 *
 * Vậy test cái gì: HÀNH VI. Có bấm được không, có khoá đúng lúc không, có nhãn
 * cho trình đọc màn hình không, có gọi đúng callback không. Đó cũng là những
 * thứ hay hỏng thật; còn màu và khoảng cách thì nhìn bằng mắt trên máy nhanh
 * hơn và chắc hơn.
 *
 * Còn bản thân hệ token thì đã được kiểm ở `tests/theme/tokens.test.ts` và ở
 * lượt biên dịch Tailwind lúc build.
 *
 * ⚠️ `render()` của @testing-library/react-native 14 là BẤT ĐỒNG BỘ — phải
 * `await`. Quên `await` thì mọi truy vấn báo "`render` function has not been
 * called", một thông báo chỉ sai hướng hoàn toàn.
 */
describe('Button', () => {
  it('gọi onPress khi bấm', async () => {
    const onPress = jest.fn();
    const screen = await render(<Button label="Đăng nhập" onPress={onPress} />);

    await userEvent.press(screen.getByRole('button'));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  /**
   * ⛔ Đây là lý do nút này tồn tại thay vì dùng `Pressable` trần.
   *
   * Không khoá lúc đang gửi thì người dùng bấm "Đăng ký" lần thứ hai vì lần đầu
   * chưa thấy gì xảy ra — và backend tạo HAI tài khoản. Trên điện thoại ca này
   * phổ biến hơn web nhiều: mạng chậm hơn, và không có con trỏ chuột đổi hình
   * để báo "đang xử lý".
   */
  it('KHÔNG gọi onPress khi đang gửi', async () => {
    const onPress = jest.fn();
    const screen = await render(<Button label="Đăng ký" loading onPress={onPress} />);

    await userEvent.press(screen.getByRole('button'));

    expect(onPress).not.toHaveBeenCalled();
  });

  it('KHÔNG gọi onPress khi bị vô hiệu hoá', async () => {
    const onPress = jest.fn();
    const screen = await render(<Button disabled label="Gửi" onPress={onPress} />);

    await userEvent.press(screen.getByRole('button'));

    expect(onPress).not.toHaveBeenCalled();
  });

  /**
   * Lúc đang gửi, nhãn được THAY bằng vòng quay — nên trình đọc màn hình mất
   * chữ để đọc. `accessibilityState.busy` là thứ duy nhất còn lại báo cho người
   * dùng khiếm thị biết thao tác đang chạy chứ không phải nút hỏng.
   */
  it('báo trạng thái busy cho trình đọc màn hình khi đang gửi', async () => {
    const screen = await render(<Button label="Đăng nhập" loading onPress={jest.fn()} />);

    // `toBeBusy`/`toBeDisabled` — bản 14 đã bỏ `toHaveAccessibilityState`.
    expect(screen.getByRole('button')).toBeBusy();
    expect(screen.getByRole('button')).toBeDisabled();
  });
});
