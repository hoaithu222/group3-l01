import { fireEvent, screen } from '@testing-library/react-native';

import { HostParticipantMenu } from '../components/HostParticipantMenu';
import { makeParticipant, renderWithProviders } from './helpers';

/** Menu điều khiển của chủ phòng (app.md §3, §8 VR-11): nhãn phổ thông, "Mời ra" cần xác nhận nêu tên, mục chưa dùng được thì khoá. */
const lan = makeParticipant({ name: 'Lan', userId: 'lan' });

async function mount(target = lan, over: { busy?: boolean } = {}) {
  const onAction = jest.fn();
  const onClose = jest.fn();
  await renderWithProviders(<HostParticipantMenu busy={over.busy ?? false} target={target} onAction={onAction} onClose={onClose} />);
  return { onAction, onClose };
}

describe('HostParticipantMenu', () => {
  it('không có đích → không vẽ gì', async () => {
    const onAction = jest.fn();
    await renderWithProviders(<HostParticipantMenu busy={false} target={null} onAction={onAction} onClose={jest.fn()} />);
    expect(screen.queryByText('Mời phát biểu')).toBeNull();
  });

  it('nhãn phổ thông ("Mời ra khỏi phòng", "Chặn phát biểu") — không "Kick/Ban"', async () => {
    await mount();
    for (const label of ['Mời phát biểu', 'Yêu cầu tắt mic', 'Chặn phát biểu', 'Dừng chia sẻ màn hình', 'Chuyển quyền chủ phòng', 'Mời ra khỏi phòng']) {
      expect(screen.getByText(label)).toBeOnTheScreen();
    }
    expect(screen.queryByText(/kick|ban/i)).toBeNull();
  });

  it('gửi đúng action cho đích được chọn', async () => {
    const { onAction } = await mount();
    await fireEvent.press(screen.getByText('Mời phát biểu'));
    await fireEvent.press(screen.getByText('Yêu cầu tắt mic'));
    await fireEvent.press(screen.getByText('Chặn phát biểu'));
    await fireEvent.press(screen.getByText('Chuyển quyền chủ phòng'));
    expect(onAction.mock.calls.map((c) => [c[0], (c[1] as { userId: string }).userId])).toEqual([
      ['INVITE_SPEAK', 'lan'],
      ['MUTE_REQUEST', 'lan'],
      ['BLOCK_AUDIO', 'lan'],
      ['TRANSFER', 'lan'],
    ]);
  });

  it('người đã bị chặn phát biểu → mục đổi thành "Cho phép phát biểu lại" (họ tự bật mic)', async () => {
    const { onAction } = await mount(makeParticipant({ mutedByHost: true, name: 'Lan', userId: 'lan' }));
    expect(screen.queryByText('Chặn phát biểu')).toBeNull();
    expect(screen.getByText('Họ tự bật mic — bạn không bật mic hộ.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Cho phép phát biểu lại'));
    expect(onAction).toHaveBeenCalledWith('UNBLOCK_AUDIO', expect.objectContaining({ userId: 'lan' }));
  });

  it('"Dừng chia sẻ" khoá kèm lý do khi người đó không chia sẻ; mở khoá khi đang chia sẻ', async () => {
    const first = await mount();
    await fireEvent.press(screen.getByText('Dừng chia sẻ màn hình'));
    expect(first.onAction).not.toHaveBeenCalled();
    expect(screen.getByText('Người này không chia sẻ màn hình.')).toBeOnTheScreen();
  });

  it('"Mời ra" cần xác nhận NÊU TÊN + hậu quả; Huỷ thì không gửi gì; xác nhận mới gửi `remove`', async () => {
    const { onAction } = await mount();
    await fireEvent.press(screen.getByText('Mời ra khỏi phòng'));
    expect(onAction).not.toHaveBeenCalled();
    expect(await screen.findByText('Mời Lan ra khỏi phòng?')).toBeOnTheScreen();
    expect(screen.getByText(/không vào lại được phiên phòng này/)).toBeOnTheScreen();

    await fireEvent.press(screen.getByText('Huỷ'));
    expect(onAction).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByText('Mời ra khỏi phòng'));
    await fireEvent.press(await screen.findByText('Mời ra'));
    expect(onAction).toHaveBeenCalledWith('REMOVE', expect.objectContaining({ userId: 'lan' }));
  });

  it('đang chờ server (busy) → mọi mục khoá, không bấm đúp', async () => {
    const { onAction } = await mount(lan, { busy: true });
    await fireEvent.press(screen.getByText('Mời phát biểu'));
    await fireEvent.press(screen.getByText('Chặn phát biểu'));
    expect(onAction).not.toHaveBeenCalled();
  });
});
