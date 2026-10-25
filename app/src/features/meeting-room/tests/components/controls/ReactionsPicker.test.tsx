import { fireEvent, screen } from '@testing-library/react-native';

import { ReactionsPicker } from '../../../components/controls/ReactionsPicker';
import { REACTION_EMOJIS } from '../../../constants/meeting-room.constants';
import { renderWithInsets } from './controls-helpers';

/** Thanh cảm xúc nổi (thay tấm trượt đáy): một hàng 6 emoji, chạm nền để đóng, chọn xong tự đóng. */
describe('ReactionsPicker', () => {
  it('hiện ĐÚNG danh sách cho phép trong MỘT thanh, mỗi cảm xúc là một ô bấm được mang tên tiếng Việt', async () => {
    await renderWithInsets(<ReactionsPicker visible onClose={jest.fn()} onPick={jest.fn()} />);

    expect(screen.getByLabelText('Chọn cảm xúc để gửi')).toBeOnTheScreen();
    for (const emoji of REACTION_EMOJIS) expect(screen.getByText(new RegExp(emoji))).toBeOnTheScreen();
    // Tên tiếng Việt là nhãn trợ năng của ô (không để trình đọc màn hình đọc tên biểu tượng của hệ điều hành).
    expect(screen.getByRole('button', { name: 'Thích' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Chúc mừng' })).toBeOnTheScreen();
    expect(screen.getAllByRole('button', { name: /^(Yêu thích|Thích|Vỗ tay|Vui|Bất ngờ|Chúc mừng)$/ })).toHaveLength(REACTION_EMOJIS.length);
  });

  it('chọn một cảm xúc: rung nhẹ, gửi nó rồi ĐÓNG thanh', async () => {
    const onPick = jest.fn();
    const onClose = jest.fn();
    const haptics = jest.requireMock<{ impactAsync: jest.Mock }>('expo-haptics');
    haptics.impactAsync.mockClear();
    await renderWithInsets(<ReactionsPicker visible onClose={onClose} onPick={onPick} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Vỗ tay' }));

    expect(haptics.impactAsync).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith('👏');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('chạm ra ngoài thanh (nền) thì đóng, không gửi gì', async () => {
    const onPick = jest.fn();
    const onClose = jest.fn();
    await renderWithInsets(<ReactionsPicker visible onClose={onClose} onPick={onPick} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Đóng chọn cảm xúc' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onPick).not.toHaveBeenCalled();
  });

  it('đóng (visible=false) thì không dựng gì', async () => {
    await renderWithInsets(<ReactionsPicker visible={false} onClose={jest.fn()} onPick={jest.fn()} />);

    expect(screen.queryByLabelText('Chọn cảm xúc để gửi')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Thích' })).toBeNull();
  });
});
