import { render } from '@testing-library/react-native';

import { CountBadge } from '@/shared/ui/count-badge';

/**
 * `CountBadge` (p0-12): số chưa đọc có quy ước RÚT GỌN ("99+"), nhãn trợ năng ("3 chưa đọc") và cách hiện khi TẮT thông báo (chấm
 * xám) dùng chung cho danh sách hội thoại/kênh/hoạt động/tab. Chỉ test HÀNH VI; `render()` của RNTL 14 phải `await`.
 */
describe('CountBadge', () => {
  it('vẽ số và đọc "N chưa đọc"', async () => {
    const screen = await render(<CountBadge count={3} />);

    expect(screen.getByText('3')).toBeOnTheScreen();
    expect(screen.getByLabelText('3 chưa đọc')).toBeOnTheScreen();
  });

  it('150 ⇒ "99+" (nhãn cũng nói "99+")', async () => {
    const screen = await render(<CountBadge count={150} />);

    expect(screen.getByText('99+')).toBeOnTheScreen();
    expect(screen.getByLabelText('99+ chưa đọc')).toBeOnTheScreen();
  });

  it('trần đổi được: max=9 ⇒ 10 thành "9+", 9 vẫn là "9"', async () => {
    const ten = await render(<CountBadge count={10} max={9} />);
    expect(ten.getByText('9+')).toBeOnTheScreen();

    const nine = await render(<CountBadge count={9} max={9} />);
    expect(nine.getByText('9')).toBeOnTheScreen();
  });

  it.each([0, -3, Number.NaN, Number.NEGATIVE_INFINITY])(
    'count=%p ⇒ KHÔNG vẽ gì',
    async (count) => {
      const screen = await render(<CountBadge count={count} />);

      expect(screen.toJSON()).toBeNull();
    },
  );

  it('số lẻ bị cắt phần thập phân (số chưa đọc luôn nguyên)', async () => {
    const screen = await render(<CountBadge count={2.9} />);

    expect(screen.getByText('2')).toBeOnTheScreen();
  });

  it('muted ⇒ CHẤM (không số) nhưng nhãn vẫn nói đủ số và "đã tắt thông báo"', async () => {
    const screen = await render(<CountBadge count={3} muted />);

    expect(screen.queryByText('3')).toBeNull();
    expect(screen.getByLabelText('3 chưa đọc, đã tắt thông báo')).toBeOnTheScreen();
  });

  it('variant="dot" ⇒ chấm không số, nhãn vẫn đủ', async () => {
    const screen = await render(<CountBadge count={7} variant="dot" />);

    expect(screen.queryByText('7')).toBeNull();
    expect(screen.getByLabelText('7 chưa đọc')).toBeOnTheScreen();
  });

  it('accessibilityLabel ghi đè nhãn mặc định (chỗ dùng không phải "chưa đọc")', async () => {
    const screen = await render(<CountBadge accessibilityLabel="5 lời mời" count={5} />);

    expect(screen.getByLabelText('5 lời mời')).toBeOnTheScreen();
    expect(screen.queryByLabelText('5 chưa đọc')).toBeNull();
  });
});
