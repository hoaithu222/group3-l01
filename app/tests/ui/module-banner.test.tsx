import { render, userEvent } from '@testing-library/react-native';

import { Button } from '@/shared/ui/button';
import { ModuleBanner } from '@/shared/ui/banner';
import type { BannerTone } from '@/shared/ui/banner';

/**
 * ⚠️ Chỉ test HÀNH VI — style của NativeWind không có trong Jest (`docs/rules/testing.md`): gradient, quầng tròn, cỡ
 * 96dp và tương phản nằm ở `className`/SVG nên nhìn bằng mắt trên máy (cả sáng lẫn tối), không kiểm được ở đây.
 *
 * ⚠️ `render()` của RNTL 14 là BẤT ĐỒNG BỘ, phải `await`.
 */
describe('ModuleBanner', () => {
  it('vẽ được với bộ prop tối thiểu: tiêu đề mang vai `header`', async () => {
    const screen = await render(<ModuleBanner icon="calendar" title="Lịch họp" />);

    expect(screen.getByRole('header', { name: 'Lịch họp' })).toBeOnTheScreen();
  });

  it('có mô tả thì vẽ mô tả, không có thì không vẽ dòng nào', async () => {
    const withDesc = await render(
      <ModuleBanner description="Cuộc họp sắp tới của bạn" icon="calendar" title="Lịch họp" />,
    );
    expect(withDesc.getByText('Cuộc họp sắp tới của bạn')).toBeOnTheScreen();

    const without = await render(<ModuleBanner icon="calendar" title="Học" />);
    expect(without.queryByText('Cuộc họp sắp tới của bạn')).toBeNull();
  });

  it('chỉ có MỘT tiêu đề `header` (mô tả không phải header)', async () => {
    const screen = await render(
      <ModuleBanner description="Mô tả ngắn" icon="book" title="Học" tone="info" />,
    );

    expect(screen.getAllByRole('header')).toHaveLength(1);
  });

  it.each<BannerTone>(['brand', 'info', 'success', 'warning', 'accent', 'danger', 'neutral'])(
    'tông %s vẽ được',
    async (tone) => {
      const screen = await render(<ModuleBanner icon="star" title="Thành tích" tone={tone} />);

      expect(screen.getByText('Thành tích')).toBeOnTheScreen();
    },
  );

  /** Khe hành động: nút đặt vào bấm được, và banner không nuốt cú chạm (nền SVG `pointerEvents="none"`). */
  it('khe hành động: nút bấm được, gọi đúng một lần', async () => {
    const onPress = jest.fn();
    const screen = await render(
      <ModuleBanner
        action={<Button label="Tham gia bằng mã" size="sm" variant="secondary" onPress={onPress} />}
        icon="calendar"
        title="Lịch họp"
      />,
    );

    await userEvent.press(screen.getByRole('button', { name: 'Tham gia bằng mã' }));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('không có khe hành động thì không có nút nào', async () => {
    const screen = await render(<ModuleBanner icon="calendar" title="Lịch họp" />);

    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  /**
   * ⛔ Nền SVG + ô icon là trang trí thuần: phải ẩn khỏi trình đọc màn hình, nếu không TalkBack dừng ở một phần tử
   * không nói lên điều gì. Icon không nhãn ⇒ không có phần tử `image` nào lộ ra.
   */
  it('phần trang trí bị ẩn khỏi trình đọc màn hình (không có `image`)', async () => {
    const screen = await render(<ModuleBanner icon="calendar" title="Lịch họp" />);

    expect(screen.queryAllByRole('image')).toHaveLength(0);
  });

  it('tiêu đề dài bị khoá 2 dòng, mô tả 3 dòng (không đẩy ô icon ra khỏi màn)', async () => {
    const screen = await render(
      <ModuleBanner description="Mô tả" icon="calendar" title="Một tiêu đề khá dài của phân hệ" />,
    );

    expect(screen.getByText('Một tiêu đề khá dài của phân hệ').props.numberOfLines).toBe(2);
    expect(screen.getByText('Mô tả').props.numberOfLines).toBe(3);
  });
});
