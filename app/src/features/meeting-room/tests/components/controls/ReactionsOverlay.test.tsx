import { render, screen } from '@testing-library/react-native';

import { ReactionsOverlay } from '../../../components/controls/ReactionsOverlay';
import { MAX_FLOATING_REACTIONS, REACTION_LIFETIME_MS } from '../../../constants/meeting-room.constants';
import type { FloatingReaction } from '../../../store/meeting-room.store';

/**
 * Lớp phủ cảm xúc (app.md §3.2 `ReactionsOverlay`): tối đa 20 cùng lúc, giảm chuyển động thì danh sách nhỏ tĩnh, hết hạn thì tự báo cha gỡ.
 * ⚠️ Hoạt ảnh bay là `Animated` của RN (chạy native) — Jest chỉ kiểm cây dựng và bộ hẹn giờ gỡ, KHÔNG kiểm chuyển động.
 */
const makeReaction = (index: number, at = Date.now()): FloatingReaction => ({
  at,
  emoji: '👍',
  id: `r${String(index)}`,
  identity: `u${String(index)}`,
});

const nameOf = (identity: string) => `Tên ${identity}`;

afterEach(() => jest.useRealTimers());

describe('ReactionsOverlay', () => {
  it('không có cảm xúc nào → không vẽ gì', async () => {
    const view = await render(<ReactionsOverlay nameOf={nameOf} reactions={[]} reduceMotion={false} onDone={jest.fn()} />);

    expect(view.toJSON()).toBeNull();
  });

  it(`tối đa ${String(MAX_FLOATING_REACTIONS)} cùng lúc và giữ những cái MỚI nhất`, async () => {
    const reactions = Array.from({ length: 25 }, (_, index) => makeReaction(index));
    await render(<ReactionsOverlay nameOf={nameOf} reactions={reactions} reduceMotion={false} onDone={jest.fn()} />);

    expect(screen.getAllByLabelText(/gửi/)).toHaveLength(MAX_FLOATING_REACTIONS);
    expect(screen.queryByLabelText('Tên u4 gửi 👍')).toBeNull();
    expect(screen.getByLabelText('Tên u5 gửi 👍')).toBeOnTheScreen();
    expect(screen.getByLabelText('Tên u24 gửi 👍')).toBeOnTheScreen();
  });

  it('giảm chuyển động: danh sách nhỏ TĨNH — chỉ vài cảm xúc gần nhất, có tên người gửi bằng chữ', async () => {
    const reactions = Array.from({ length: 8 }, (_, index) => makeReaction(index));
    await render(<ReactionsOverlay nameOf={nameOf} reactions={reactions} reduceMotion onDone={jest.fn()} />);

    expect(screen.getAllByLabelText(/gửi/)).toHaveLength(5);
    expect(screen.getByText('Tên u7')).toBeOnTheScreen();
    expect(screen.queryByText('Tên u0')).toBeNull();
  });

  it('hết REACTION_LIFETIME_MS thì gọi onDone cho MỌI cảm xúc — kể cả cái đang ẩn ở chế độ tĩnh (không kẹt trong store)', async () => {
    jest.useFakeTimers();
    const onDone = jest.fn();
    const reactions = Array.from({ length: 8 }, (_, index) => makeReaction(index));
    await render(<ReactionsOverlay nameOf={nameOf} reactions={reactions} reduceMotion onDone={onDone} />);

    jest.advanceTimersByTime(REACTION_LIFETIME_MS - 1);
    expect(onDone).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    expect(onDone).toHaveBeenCalledTimes(8);
    expect(onDone).toHaveBeenCalledWith('r0');
    expect(onDone).toHaveBeenCalledWith('r7');
  });

  it('chế độ bay cũng tự báo hết hạn theo mốc `at` (cảm xúc nhận từ lâu sống ngắn hơn, không tính lại 3 giây)', async () => {
    jest.useFakeTimers();
    const onDone = jest.fn();
    const old = makeReaction(1, Date.now() - (REACTION_LIFETIME_MS - 500));
    await render(<ReactionsOverlay nameOf={nameOf} reactions={[old]} reduceMotion={false} onDone={onDone} />);

    jest.advanceTimersByTime(499);
    expect(onDone).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(onDone).toHaveBeenCalledWith('r1');
  });
});
