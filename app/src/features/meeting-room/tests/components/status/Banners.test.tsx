import { fireEvent, render, screen } from '@testing-library/react-native';

import { ClosingSoonBanner } from '../../../components/status/ClosingSoonBanner';
import { ReconnectBanner } from '../../../components/status/ReconnectBanner';

/** Banner trạng thái (app.md §3.2 `ReconnectBanner`, `ClosingSoonBanner`): chữ rõ, số phút tính theo GIỜ SERVER do cha truyền (`nowMs`). */
const NOW = Date.parse('2026-10-01T09:00:00.000Z');
const at = (offsetMs: number) => new Date(NOW + offsetMs).toISOString();

describe('ReconnectBanner', () => {
  it('"Đang kết nối lại…"', async () => {
    await render(<ReconnectBanner />);

    expect(screen.getByText('Đang kết nối lại…')).toBeOnTheScreen();
  });
});

describe('ClosingSoonBanner', () => {
  it('chưa có mốc tự đóng (`closingAt = null`) → không vẽ gì', async () => {
    const view = await render(<ClosingSoonBanner closingAt={null} nowMs={NOW} />);

    expect(view.toJSON()).toBeNull();
  });

  it.each([
    // [còn lại (ms), số phút hiện ra] — làm tròn LÊN: còn 4 phút 10 giây vẫn nói "5 phút", không nói "4" rồi bất ngờ.
    [5 * 60_000, 5],
    [4 * 60_000 + 10_000, 5],
    [4 * 60_000, 4],
    [61_000, 2],
    [60_000, 1],
    [1, 1],
  ])('còn %i ms → "sau %i phút"', async (remainingMs, minutes) => {
    await render(<ClosingSoonBanner closingAt={at(remainingMs)} nowMs={NOW} />);

    expect(screen.getByText(`Cuộc họp sẽ tự kết thúc sau ${String(minutes)} phút.`)).toBeOnTheScreen();
  });

  it('đã tới/quá hạn → "sắp tự kết thúc" (không nói "sau 0 phút")', async () => {
    await render(<ClosingSoonBanner closingAt={at(-5_000)} nowMs={NOW} />);

    expect(screen.getByText('Cuộc họp sắp tự kết thúc.')).toBeOnTheScreen();
    expect(screen.queryByText(/sau 0 phút/)).toBeNull();
  });

  it('có `onClose` → hiện nút đóng và gọi handler', async () => {
    const onClose = jest.fn();
    await render(<ClosingSoonBanner closingAt={at(5 * 60_000)} nowMs={NOW} onClose={onClose} />);

    await fireEvent.press(screen.getByLabelText('Đóng thông báo'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('không có `onClose` thì không có nút đóng (cảnh báo bắt buộc đọc)', async () => {
    await render(<ClosingSoonBanner closingAt={at(5 * 60_000)} nowMs={NOW} />);

    expect(screen.queryByLabelText('Đóng thông báo')).toBeNull();
  });
});
