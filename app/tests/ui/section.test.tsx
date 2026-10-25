import { render, userEvent } from '@testing-library/react-native';
import { Text } from 'react-native';

import { LinkButton } from '@/shared/ui/button';
import { Section } from '@/shared/ui/section';

/**
 * ⚠️ Chỉ test HÀNH VI — style của NativeWind không có trong Jest
 * (`docs/rules/testing.md`). Cỡ chữ 18/24, màu `fg-brand` và khe 12 giữa tiêu
 * đề với nội dung đều nằm trong `className` nên không kiểm được ở đây; chúng
 * nhìn bằng mắt trên máy.
 *
 * ⚠️ `render()` của RNTL 14 là BẤT ĐỒNG BỘ, phải `await`.
 */
describe('Section', () => {
  it('vẽ được với bộ prop tối thiểu', async () => {
    const screen = await render(
      <Section title="Thông tin đơn hàng">
        <Text>Mã đơn hàng</Text>
      </Section>,
    );

    expect(screen.getByText('Thông tin đơn hàng')).toBeOnTheScreen();
    expect(screen.getByText('Mã đơn hàng')).toBeOnTheScreen();
  });

  it('vẽ được với bộ prop đầy đủ', async () => {
    const screen = await render(
      <Section
        action={<Text>Xem tất cả</Text>}
        className="mt-md"
        title="Cửa hàng nhận hàng"
        titleClassName="text-fg-1"
        tone="default"
      >
        <Text>BTMH Hà Nội</Text>
      </Section>,
    );

    expect(screen.getByText('Cửa hàng nhận hàng')).toBeOnTheScreen();
    expect(screen.getByText('Xem tất cả')).toBeOnTheScreen();
    expect(screen.getByText('BTMH Hà Nội')).toBeOnTheScreen();
  });

  /**
   * ⛔ Tiêu đề PHẢI mang vai `header`. Nó là cái mốc để trình đọc màn hình nhảy
   * giữa các nhóm; màn chi tiết đơn hàng có 4 nhóm × ~4 hàng, thiếu mốc thì
   * người dùng khiếm thị phải vuốt qua từng dòng mới tới được nhóm mình cần.
   */
  it('tiêu đề được gắn vai `header`', async () => {
    const screen = await render(
      <Section title="Thông tin thanh toán">
        <Text>Tổng tiền</Text>
      </Section>,
    );

    expect(screen.getByRole('header', { name: 'Thông tin thanh toán' })).toBeOnTheScreen();
  });

  /**
   * ⛔ Ca lồng nhau: khối cha (`Card title`, `BottomSheet title`, `Dialog`) đã
   * có `header` cho cùng nội dung thì TalkBack đếm HAI tiêu đề cho một nhóm và
   * điều hướng theo heading nhảy vào cái bên trong. Tắt được bằng prop, và chữ
   * vẫn phải còn nguyên trên màn.
   */
  it('titleAsHeader={false} thì bỏ vai `header` nhưng vẫn hiện chữ', async () => {
    const screen = await render(
      <Section title="Thông tin sản phẩm" titleAsHeader={false}>
        <Text>Kim Gia Bảo</Text>
      </Section>,
    );

    expect(screen.getByText('Thông tin sản phẩm')).toBeOnTheScreen();
    expect(screen.queryByRole('header')).toBeNull();
  });

  /**
   * ⛔ Không truyền `action` thì component KHÔNG được tự dựng gì vào khe phải —
   * trong bản vẽ có 4 hàng tiêu đề mang khe đó nhưng 2 hàng để `hidden`. Tự vẽ
   * sẵn icon bút chì là mọi nhóm mọc thêm một nút bấm vào không có gì xảy ra.
   */
  it('không truyền action thì không dựng nút nào', async () => {
    const screen = await render(
      <Section title="Thông tin đơn hàng">
        <Text>Mã đơn hàng</Text>
      </Section>,
    );

    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  /**
   * ⛔ `action` phải còn BẤM ĐƯỢC và còn là một ô trợ năng RIÊNG. Nếu hàng tiêu
   * đề tự bọc một lớp `accessible` thì icon sửa bị nuốt vào trong tiêu đề: cả
   * cụm đọc thành một ô "Thông tin nhận hàng", và người khiếm thị không còn
   * đường nào tới nút sửa.
   */
  it('action giữ được vai nút riêng và bấm được', async () => {
    const onPress = jest.fn();
    const screen = await render(
      <Section
        action={
          <LinkButton
            accessibilityLabel="Sửa thông tin nhận hàng"
            iconLeft="edit"
            onPress={onPress}
          />
        }
        title="Thông tin nhận hàng"
      >
        <Text>NGUYEN VAN A</Text>
      </Section>,
    );

    const edit = screen.getByRole('button', { name: 'Sửa thông tin nhận hàng' });
    await userEvent.press(edit);

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('header', { name: 'Thông tin nhận hàng' })).toBeOnTheScreen();
  });

  /**
   * `icon` là mốc nhìn TRANG TRÍ: tiêu đề vẫn là `header` duy nhất, icon không lộ ra thành `image` (TalkBack sẽ dừng ở một ô
   * không nói gì), và khe `action` vẫn là nút riêng bấm được.
   */
  it('có icon: tiêu đề vẫn là header, icon bị ẩn, action vẫn bấm được', async () => {
    const onPress = jest.fn();
    const screen = await render(
      <Section
        action={<LinkButton accessibilityLabel="Sửa lịch" iconLeft="edit" onPress={onPress} />}
        icon="calendar"
        title="Lịch trình"
      >
        <Text>Thứ Hai</Text>
      </Section>,
    );

    expect(screen.getByRole('header', { name: 'Lịch trình' })).toBeOnTheScreen();
    expect(screen.queryAllByRole('image')).toHaveLength(0);
    await userEvent.press(screen.getByRole('button', { name: 'Sửa lịch' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
