import { fireEvent, render, screen } from '@testing-library/react-native';

import { RaiseHandButton } from '../../../components/controls/RaiseHandButton';
import { HAND_EMOJI } from '../../../utils/hand-queue.utils';

describe('RaiseHandButton', () => {
  it('chưa giơ tay → "Giơ tay"; bấm rung "chạm" rồi gọi onToggle', async () => {
    const onToggle = jest.fn();
    const haptics = jest.requireMock<{ impactAsync: jest.Mock }>('expo-haptics');
    haptics.impactAsync.mockClear();
    await render(<RaiseHandButton raised={false} onToggle={onToggle} />);

    expect(screen.getByText('Giơ tay')).toBeOnTheScreen();
    await fireEvent.press(screen.getByLabelText('Giơ tay'));
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(haptics.impactAsync).toHaveBeenCalledTimes(1);
  });

  it('hình là bàn tay ✋ dùng chung (`HandGlyph`), không còn mũi tên; nghĩa nằm ở câu đọc của nút', async () => {
    await render(<RaiseHandButton raised={false} onToggle={jest.fn()} />);

    expect(screen.getAllByText(HAND_EMOJI, { includeHiddenElements: true }).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Giơ tay' })).toBeOnTheScreen();
  });

  it('đang giơ tay → nhãn CHỮ "Hạ tay"', async () => {
    await render(<RaiseHandButton raised onToggle={jest.fn()} />);

    expect(screen.getByText('Hạ tay')).toBeOnTheScreen();
    expect(screen.getByLabelText('Hạ tay')).toBeOnTheScreen();
  });

  it('khoá thì không gọi onToggle', async () => {
    const onToggle = jest.fn();
    await render(<RaiseHandButton disabled raised={false} onToggle={onToggle} />);

    await fireEvent.press(screen.getByLabelText('Giơ tay'));
    expect(onToggle).not.toHaveBeenCalled();
  });
});
