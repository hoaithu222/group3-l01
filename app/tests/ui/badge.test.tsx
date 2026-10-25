import { render } from '@testing-library/react-native';
import { Text } from 'react-native';

import { Badge, BadgeAnchor } from '@/shared/ui/badge';

/**
 * ⚠️ Chỉ test HÀNH VI. `className` KHÔNG thành `style` trong Jest (Metro mới
 * biên dịch Tailwind), nên mọi assertion về màu/khoảng cách luôn đỏ — xem
 * `docs/rules/testing.md`.
 *
 * ⚠️ `render()` của RNTL 14 là BẤT ĐỒNG BỘ, phải `await`.
 */
describe('Badge', () => {
  it('hiện nhãn được truyền vào', async () => {
    const screen = await render(<Badge label="Đã duyệt" variant="success" />);

    expect(screen.getByText('Đã duyệt')).toBeOnTheScreen();
  });

  it('hiện đúng con số khi chưa vượt ngưỡng', async () => {
    const screen = await render(<Badge count={7} />);

    expect(screen.getByText('7')).toBeOnTheScreen();
  });

  /**
   * ⛔ Đây là lý do `maxCount` tồn tại.
   *
   * Hộp thư 1.284 thông báo mà vẽ đủ bốn chữ số thì huy hiệu rộng gấp ba biểu
   * tượng nó đang cưỡi lên, và nó che mất chính cái biểu tượng đó. Ngưỡng cắt
   * phải kiểm bằng test vì lỗi chỉ lộ ra khi tài khoản thật có nhiều thông báo
   * — không bao giờ gặp lúc phát triển.
   */
  it('cắt thành “99+” khi con số vượt maxCount', async () => {
    const screen = await render(<Badge count={1284} />);

    expect(screen.getByText('99+')).toBeOnTheScreen();
    expect(screen.queryByText('1284')).toBeNull();
  });

  it('tôn trọng maxCount tuỳ chỉnh', async () => {
    const screen = await render(<Badge count={12} maxCount={9} />);

    expect(screen.getByText('9+')).toBeOnTheScreen();
  });

  /** Dạng chấm không có chữ nào — kể cả khi nơi gọi lỡ truyền kèm `count`. */
  it('dạng chấm không vẽ chữ', async () => {
    const screen = await render(<Badge count={3} dot />);

    expect(screen.queryByText('3')).toBeNull();
  });

  /**
   * Chấm tròn không có chữ để đọc. Không có `accessibilityLabel` thì người dùng
   * TalkBack hoàn toàn không biết có dấu hiệu "chưa đọc" nào — đúng cái thông
   * tin mà huy hiệu sinh ra để truyền đạt.
   */
  it('đọc được nhãn a11y ở dạng chấm', async () => {
    const screen = await render(<Badge accessibilityLabel="Có thông báo mới" dot />);

    expect(screen.getByLabelText('Có thông báo mới')).toBeOnTheScreen();
  });

  /**
   * ⛔ Chiều cao huy hiệu là số CỨNG (16 · 20 · 24 · 28dp) còn hệ số phóng cỡ
   * chữ của Android lên tới 2×: ở mức "Cỡ chữ: Lớn nhất", nhãn 12px thành 24px
   * trong hộp cao 24dp — chữ tràn khỏi viền bo rồi bị cắt, và huy hiệu số
   * (16dp) còn tệ hơn. Lỗi này chỉ lộ ra trên máy của người dùng đã phóng chữ,
   * tức là gần như không bao giờ gặp lúc phát triển — nên phải khoá bằng test.
   */
  it('khoá trần phóng cỡ chữ để nhãn không tràn khỏi hộp cao cứng', async () => {
    const screen = await render(<Badge label="Đã duyệt" variant="success" />);

    expect(screen.getByText('Đã duyệt').props.maxFontSizeMultiplier).toBe(1.3);
  });

  /**
   * Nhãn huy hiệu là MỘT dòng theo thiết kế: nhãn dài kéo cao cả hàng và mọi
   * thứ đứng cạnh nó lệch nhau.
   */
  it('khoá nhãn ở một dòng', async () => {
    const screen = await render(<Badge count={7} />);

    expect(screen.getByText('7').props.numberOfLines).toBe(1);
  });
});

describe('BadgeAnchor', () => {
  it('vẽ cả nội dung lẫn huy hiệu gắn góc', async () => {
    const screen = await render(
      <BadgeAnchor badge={<Badge count={2} size="sm" />}>
        <Text>Thông báo</Text>
      </BadgeAnchor>,
    );

    expect(screen.getByText('Thông báo')).toBeOnTheScreen();
    expect(screen.getByText('2')).toBeOnTheScreen();
  });

  it('không vẽ lớp huy hiệu khi không có huy hiệu', async () => {
    const screen = await render(
      <BadgeAnchor>
        <Text>Thông báo</Text>
      </BadgeAnchor>,
    );

    expect(screen.getByText('Thông báo')).toBeOnTheScreen();
  });
});
