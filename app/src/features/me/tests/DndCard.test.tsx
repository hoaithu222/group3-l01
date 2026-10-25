import { render, screen, userEvent } from '@testing-library/react-native';

import { DndCard } from '../components/DndCard';

/**
 * "Không làm phiền": đang tắt → ba chip chọn nhanh; đang bật → thẻ nổi bật (hạn kết thúc + nút Tắt), KHÔNG còn chip.
 * Chỉ test hành vi — NativeWind không có trong Jest nên tông màu không kiểm được.
 */

async function renderCard(dndUntil: string | null, disabled = false) {
  const onChange = jest.fn();
  await render(<DndCard disabled={disabled} dndUntil={dndUntil} onChange={onChange} />);
  return { onChange };
}

describe('DndCard', () => {
  it('đang tắt: có ba chip chọn nhanh, chọn "Trong 1 giờ" → hạn ISO UTC ở tương lai', async () => {
    const { onChange } = await renderCard(null);
    expect(screen.getByText('Trong 8 giờ')).toBeOnTheScreen();
    expect(screen.getByText('Đến sáng mai')).toBeOnTheScreen();
    expect(screen.queryByText('Đang bật đến')).toBeNull();

    const before = Date.now();
    await userEvent.press(screen.getByText('Trong 1 giờ'));

    expect(onChange).toHaveBeenCalledTimes(1);
    const [until] = onChange.mock.calls[0] as [string];
    expect(until.endsWith('Z')).toBe(true);
    expect(new Date(until).getTime()).toBeGreaterThanOrEqual(before + 3_600_000 - 1000);
  });

  it('đang bật: hiện "Đang bật đến" + nút Tắt gửi null, không còn chip chọn nhanh', async () => {
    const until = new Date(Date.now() + 3_600_000).toISOString();
    const { onChange } = await renderCard(until);

    expect(screen.getByText('Đang bật đến')).toBeOnTheScreen();
    expect(screen.queryByText('Trong 1 giờ')).toBeNull();

    await userEvent.press(screen.getByRole('button', { name: 'Tắt' }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('mất mạng (disabled) → chip không gọi onChange', async () => {
    const { onChange } = await renderCard(null, true);

    await userEvent.press(screen.getByText('Trong 1 giờ'));
    expect(onChange).not.toHaveBeenCalled();
  });
});
