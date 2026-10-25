import { render, userEvent } from '@testing-library/react-native';
import { Text } from 'react-native';

import { LIGHT_COLORS } from '@/shared/theme';
import { Alert } from '@/shared/ui/alert';

/**
 * ⚠️ Chỉ test HÀNH VI — style của NativeWind không có trong Jest
 * (`docs/rules/testing.md`). ⚠️ `render()` của RNTL 14 phải `await`.
 */

/**
 * Biểu tượng đi qua `react-native-svg`, và `react-native-svg` nhận màu bằng
 * PROP (`color`) chứ không qua `className` — nên đây là một trong số ít thứ
 * nhìn thấy được của Alert mà Jest kiểm được thật. Trả về mã màu đã phân giải
 * của icon đầu hộp, hoặc `undefined` khi hộp không có icon nào.
 */
function iconTint(node: unknown): string | undefined {
  if (node == null || typeof node !== 'object') return undefined;

  if (Array.isArray(node)) {
    for (const child of node) {
      const found = iconTint(child);
      if (found !== undefined) return found;
    }
    return undefined;
  }

  const current = node as {
    children?: unknown[] | null;
    props?: Record<string, unknown>;
    type?: string;
  };
  if (current.type === 'RNSVGSvgView' && typeof current.props?.color === 'string') {
    return current.props.color;
  }
  return iconTint(current.children ?? []);
}

describe('Alert', () => {
  it('hiện cả tiêu đề lẫn mô tả', async () => {
    const screen = await render(
      <Alert description="Vui lòng kiểm tra lại số tài khoản." title="Thông báo" tone="info" />,
    );

    expect(screen.getByText('Thông báo')).toBeOnTheScreen();
    expect(screen.getByText('Vui lòng kiểm tra lại số tài khoản.')).toBeOnTheScreen();
  });

  it('bỏ tiêu đề thì chỉ còn mô tả', async () => {
    const screen = await render(<Alert description="Chỉ có một dòng." />);

    expect(screen.getByText('Chỉ có một dòng.')).toBeOnTheScreen();
  });

  /**
   * ⛔ Đây là điểm sống còn của component này.
   *
   * Alert xuất hiện GIỮA CHỪNG (sau khi gửi biểu mẫu, sau khi đổi số tiền).
   * Không có `accessibilityRole="alert"` thì trình đọc màn hình bỏ qua hoàn
   * toàn: người dùng khiếm thị bấm "Xác nhận", nghe thấy im lặng, và không biết
   * là giao dịch vừa bị từ chối.
   */
  it('gắn role "alert" cho tông cảnh báo và lỗi', async () => {
    const warning = await render(<Alert description="Sắp hết hạn mức." tone="warning" />);
    expect(warning.getByRole('alert')).toBeOnTheScreen();

    const error = await render(<Alert description="Giao dịch thất bại." tone="error" />);
    expect(error.getByRole('alert')).toBeOnTheScreen();
  });

  /**
   * Ngược lại: role `alert` khiến trình đọc màn hình NGẮT LỜI nội dung đang
   * đọc. Gắn cho một dòng ghi chú vô hại là cắt ngang người dùng giữa câu, nên
   * tông `info`/`success` cố ý KHÔNG có nó (vẫn được đọc nhờ
   * `accessibilityLiveRegion="polite"` trên Android).
   */
  it('KHÔNG gắn role "alert" cho tông thông tin', async () => {
    const screen = await render(<Alert description="Đã lưu nháp." tone="info" />);

    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('gọi onClose khi bấm nút đóng', async () => {
    const onClose = jest.fn();
    const screen = await render(<Alert description="Đã lưu nháp." onClose={onClose} />);

    await userEvent.press(screen.getByLabelText('Đóng thông báo'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  /**
   * Không truyền `onClose` thì KHÔNG được có nút ✕ — đúng cho cảnh báo bắt buộc
   * đọc (điều khoản, hạn mức). Một nút ✕ vô tác dụng còn tệ hơn không có nút.
   */
  it('không vẽ nút đóng khi không có onClose', async () => {
    const screen = await render(<Alert description="Bắt buộc đọc." tone="error" />);

    expect(screen.queryByLabelText('Đóng thông báo')).toBeNull();
  });

  /**
   * ⛔ Đây là điểm sống còn thứ hai.
   *
   * Design Note của Figma (259:93563) định nghĩa intent BẰNG icon, và
   * `src/shared/ui/AGENTS.md` bắt buộc tông `warning` "luôn kèm biểu tượng" vì
   * màu `warning` chỉ đạt 3.61:1 trên `surface-warning` — dưới ngưỡng AA, nên
   * MÀU không được là dấu hiệu duy nhất. Trước khi có mặc định, 0/8 nơi gọi
   * trong repo truyền `icon`, tức là toàn bộ app hiện alert không icon.
   */
  it('tự gắn biểu tượng mặc định theo tông', async () => {
    const warning = await render(<Alert description="Sắp hết hạn mức." tone="warning" />);
    expect(iconTint(warning.toJSON())).toBe(LIGHT_COLORS.warning);

    const error = await render(<Alert description="Giao dịch thất bại." tone="error" />);
    expect(iconTint(error.toJSON())).toBe(LIGHT_COLORS.error);

    const success = await render(<Alert description="Đã ghi nhận." tone="success" />);
    expect(iconTint(success.toJSON())).toBe(LIGHT_COLORS.success);
  });

  /**
   * ⛔ Tông `info` của Figma là TEAL (`Foreground/Primary/Default`), KHÔNG phải
   * xanh dương — đã kiểm cả `Theme=Ma` (259:93623) lẫn `Theme=Pr` (259:93634).
   * Trong toàn bộ component set Alert không có symbol nào xanh dương.
   * ⚠️ Badge thì ngược lại, `Status=info` đúng là xanh dương — đừng đồng bộ hai
   * component này.
   */
  it('tông info dùng màu thương hiệu chứ không phải xanh dương', async () => {
    const screen = await render(<Alert description="Gợi ý cho bạn." tone="info" />);

    expect(iconTint(screen.toJSON())).toBe(LIGHT_COLORS['fg-brand']);
    expect(iconTint(screen.toJSON())).not.toBe(LIGHT_COLORS.info);
  });

  /** `Intent=None` (259:93722) được định nghĩa CHÍNH BẰNG việc vắng icon. */
  it('tông brand cố ý không có biểu tượng', async () => {
    const screen = await render(<Alert description="Ghi chú trung tính." tone="brand" />);

    expect(iconTint(screen.toJSON())).toBeUndefined();
  });

  it('icon truyền vào ghi đè hình mặc định', async () => {
    const screen = await render(
      <Alert description="Có hình riêng." icon={<Text>★</Text>} tone="warning" />,
    );

    expect(screen.getByText('★')).toBeOnTheScreen();
    expect(iconTint(screen.toJSON())).toBeUndefined();
  });

  /**
   * `icon={null}` là cách nơi gọi TẮT hình mặc định — phải khác hẳn với "không
   * truyền gì". Lẫn hai ca này thì hoặc mọi alert mất icon, hoặc không alert
   * nào tắt được icon.
   */
  it('icon={null} tắt hẳn biểu tượng', async () => {
    const screen = await render(<Alert description="Không icon." icon={null} tone="warning" />);

    expect(iconTint(screen.toJSON())).toBeUndefined();
  });
});
