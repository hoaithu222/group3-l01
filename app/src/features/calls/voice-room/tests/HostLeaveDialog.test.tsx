import { fireEvent, screen } from '@testing-library/react-native';

import { HostLeaveDialog } from '../components/HostLeaveDialog';
import { makeParticipant, renderWithProviders } from './helpers';

/** Hộp thoại rời của chủ phòng (VR-11): mặc định chọn người vào lâu nhất; chỉ mình → chỉ nút kết thúc; "Kết thúc" là nút riêng có nhãn. */
const candidates = [makeParticipant({ name: 'Bình', userId: 'b' }), makeParticipant({ name: 'Cường', userId: 'c' })];

async function mount(list = candidates) {
  const handlers = { onClose: jest.fn(), onEndForEveryone: jest.fn(), onLeaveAuto: jest.fn(), onTransfer: jest.fn() };
  await renderWithProviders(<HostLeaveDialog busy={false} candidates={list} visible {...handlers} />);
  return handlers;
}

describe('HostLeaveDialog', () => {
  it('mặc định chọn người ĐẦU danh sách (vào phòng lâu nhất) và nói rõ lý do; "Chuyển quyền và rời" gửi người đó', async () => {
    const { onTransfer } = await mount();
    expect(screen.getByText('Vào phòng lâu nhất')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Chuyển quyền và rời'));
    expect(onTransfer).toHaveBeenCalledWith('b');
  });

  it('chọn người khác → chuyển quyền cho người đó', async () => {
    const { onTransfer } = await mount();
    await fireEvent.press(screen.getByText('Cường'));
    await fireEvent.press(screen.getByText('Chuyển quyền và rời'));
    expect(onTransfer).toHaveBeenCalledWith('c');
  });

  it('"Kết thúc cho mọi người" là nút riêng kèm cảnh báo; "Rời, để hệ thống tự chọn" không chọn ai', async () => {
    const { onEndForEveryone, onLeaveAuto, onTransfer } = await mount();
    expect(screen.getByText('Kết thúc sẽ ngắt mọi người khỏi phòng ngay.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Kết thúc cho mọi người'));
    expect(onEndForEveryone).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByText('Rời, để hệ thống tự chọn'));
    expect(onLeaveAuto).toHaveBeenCalledTimes(1);
    expect(onTransfer).not.toHaveBeenCalled();
  });

  it('chỉ một mình trong phòng → chỉ còn "Rời và kết thúc phòng" (không có danh sách/chuyển quyền)', async () => {
    const { onEndForEveryone } = await mount([]);
    expect(screen.queryByText('Chuyển quyền và rời')).toBeNull();
    expect(screen.queryByText('Rời, để hệ thống tự chọn')).toBeNull();
    await fireEvent.press(screen.getByText('Rời và kết thúc phòng'));
    expect(onEndForEveryone).toHaveBeenCalledTimes(1);
  });
});
