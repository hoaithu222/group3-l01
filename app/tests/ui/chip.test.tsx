import { render, userEvent } from '@testing-library/react-native';
import { Text } from 'react-native';

import { Chip } from '@/shared/ui/chip';

/**
 * ⚠️ Chỉ test HÀNH VI — style của NativeWind không có trong Jest
 * (`docs/rules/testing.md`). ⚠️ `render()` của RNTL 14 phải `await`.
 *
 * ⛔ KHÔNG kiểm được bốn dáng DEFAULT/PRESS/SELECTED/DISABLED bằng mắt ở đây:
 * cả bốn chỉ khác nhau ở `className`, mà `className` không thành `style` trong
 * Jest. Cái kiểm được — và cũng là cái hỏng âm thầm — là chip có báo đúng
 * trạng thái cho trình đọc màn hình hay không, và có khoá đúng lúc hay không.
 */
describe('Chip', () => {
  it('vẽ được với bộ prop tối thiểu', async () => {
    const screen = await render(<Chip label="Tất cả" />);

    expect(screen.getByText('Tất cả')).toBeOnTheScreen();
    expect(screen.getByRole('button')).toBeOnTheScreen();
  });

  it('vẽ được với bộ prop đầy đủ', async () => {
    const screen = await render(
      <Chip
        avatar={{ uri: 'https://example.test/nguoi-nhan.png' }}
        className="mr-xs"
        fullWidth
        label="Nguyễn Văn A"
        leading={<Text>★</Text>}
        selected
        size="lg"
        trailing={<Text>✕</Text>}
        onPress={jest.fn()}
      />,
    );

    expect(screen.getByText('Nguyễn Văn A')).toBeOnTheScreen();
    expect(screen.getByText('★')).toBeOnTheScreen();
    expect(screen.getByText('✕')).toBeOnTheScreen();
  });

  it('nhận ảnh đại diện dạng phần tử, không chỉ nguồn ảnh', async () => {
    const screen = await render(<Chip avatar={<Text>NA</Text>} label="Nguyễn Văn A" />);

    expect(screen.getByText('NA')).toBeOnTheScreen();
  });

  it('gọi onPress đúng một lần', async () => {
    const onPress = jest.fn();
    const screen = await render(<Chip label="Bộ lọc" onPress={onPress} />);

    await userEvent.press(screen.getByRole('button'));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('bị khoá thì KHÔNG gọi onPress và báo `disabled`', async () => {
    const onPress = jest.fn();
    const screen = await render(<Chip disabled label="Hết hạn mức" onPress={onPress} />);

    await userEvent.press(screen.getByRole('button'));

    expect(onPress).not.toHaveBeenCalled();
    expect(screen.getByRole('button')).toBeDisabled();
  });

  /**
   * ⛔ Chip khoá mà đang được chọn vẫn phải báo là KHOÁ. Báo ngược lại thì người
   * dùng tưởng còn bấm bỏ chọn được và ngồi bấm mãi vào một chip chết.
   */
  it('vừa khoá vừa đang chọn thì vẫn báo `disabled`', async () => {
    const onPress = jest.fn();
    const screen = await render(
      <Chip disabled label="Mệnh giá 50.000" selected onPress={onPress} />,
    );

    const chip = screen.getByRole('button');

    expect(chip).toBeDisabled();
    expect(chip).toBeSelected();

    await userEvent.press(chip);
    expect(onPress).not.toHaveBeenCalled();
  });

  /**
   * ⛔ Đây là chỗ dễ đặt nhầm khoá nhất. `radio`/`checkbox` đọc `checked`, còn
   * `button` đọc `selected` — cùng một ý "đang được chọn" nhưng nằm ở hai khoá
   * khác nhau. Đặt nhầm thì TalkBack đọc ra một cái nút trống trơn và người
   * dùng khiếm thị không biết mình đã chọn mệnh giá nào.
   */
  it('vai `button` báo trạng thái qua `selected`', async () => {
    const screen = await render(<Chip label="Tuần này" selected />);

    expect(screen.getByRole('button')).toBeSelected();
  });

  it('vai `radio` và `checkbox` báo trạng thái qua `checked`', async () => {
    const radio = await render(<Chip label="50.000" role="radio" selected />);
    expect(radio.getByRole('radio')).toBeChecked();

    const checkbox = await render(<Chip label="Đã duyệt" role="checkbox" selected={false} />);
    expect(checkbox.getByRole('checkbox')).not.toBeChecked();
  });

  /**
   * ⛔ Luật của vùng chạm, không phải con số cụ thể: chip cao 32/40dp phải được
   * nới cho đủ ngưỡng 44dp — nhưng CHỈ theo chiều DỌC. Chip nằm sát nhau theo
   * hàng ngang với khe 8dp; nới ngang là vùng chạm hai chip chồng lên nhau và
   * cú chạm rơi vào nhầm chip — tệ hơn hẳn bấm trượt.
   */
  it('chỉ nới vùng chạm theo chiều dọc, không nới ngang', async () => {
    const small = await render(<Chip label="sm" size="sm" />);
    const { hitSlop } = small.getByRole('button').props;

    expect(hitSlop.top).toBeGreaterThan(0);
    expect(hitSlop.bottom).toBeGreaterThan(0);
    expect(hitSlop.left).toBeUndefined();
    expect(hitSlop.right).toBeUndefined();
  });

  /** Cỡ `lg` đã cao 48dp — vượt ngưỡng sẵn, không cần bù gì thêm. */
  it('cỡ lớn không cần bù vùng chạm', async () => {
    const screen = await render(<Chip label="lg" size="lg" />);

    expect(screen.getByRole('button').props.hitSlop).toBeUndefined();
  });

  /**
   * Nhãn chip là MỘT dòng theo thiết kế. Thiếu `numberOfLines`, một nhãn dài
   * làm chip cao gấp đôi và cả hàng chip so le nhau.
   */
  it('khoá nhãn ở một dòng', async () => {
    const screen = await render(<Chip label="Chuyển tiền tới người nhận đã lưu trong danh bạ" />);

    expect(
      screen.getByText('Chuyển tiền tới người nhận đã lưu trong danh bạ').props.numberOfLines,
    ).toBe(1);
  });
});
