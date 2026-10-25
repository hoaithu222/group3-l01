import { fireEvent, render, screen } from '@testing-library/react-native';
import { Share } from 'react-native';

import { LobbyPanel } from '../components/LobbyPanel';

/**
 * Sảnh chờ: chủ phòng thấy thẻ PIN (đọc từng chữ số) + chia sẻ + chip người chơi có nút "Mời {tên} ra"; người chơi thấy khối chờ
 * và KHÔNG có PIN/nút mời. Số người là huy hiệu có nhãn đọc được.
 */

const PLAYERS = [
  { avatarAssetId: null, nickname: 'Minh Anh', userId: 'u1' },
  { avatarAssetId: null, nickname: 'Bảo', userId: 'u2' },
];

describe('LobbyPanel — chủ phòng', () => {
  it('PIN đọc từng chữ số ("1 2 3 4 5 6"), không đọc thành một số lớn', async () => {
    await render(<LobbyPanel isHost pin="123456" players={PLAYERS} onKick={jest.fn()} />);

    expect(screen.getByLabelText('Mã PIN 1 2 3 4 5 6')).toBeOnTheScreen();
    expect(screen.getByText('Mã PIN vào phòng')).toBeOnTheScreen();
  });

  it('"Chia sẻ mã" mở share sheet với PIN trong nội dung', async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'dismissedAction' });
    await render(<LobbyPanel isHost pin="123456" players={PLAYERS} onKick={jest.fn()} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Chia sẻ mã' }));

    expect(share).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('123456') }),
    );
    share.mockRestore();
  });

  it('mỗi người chơi là một chip; nút mời ra nói rõ MỜI AI và gọi onKick đúng người', async () => {
    const onKick = jest.fn();
    await render(<LobbyPanel isHost pin="123456" players={PLAYERS} onKick={onKick} />);

    expect(screen.getByText('Minh Anh')).toBeOnTheScreen();
    expect(screen.getByText('Bảo')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Mời Bảo ra' }));

    expect(onKick).toHaveBeenCalledWith('u2');
  });

  it('người đang bị mời ra ⇒ nút của đúng người đó báo `busy`', async () => {
    await render(
      <LobbyPanel isHost kickingId="u1" pin="123456" players={PLAYERS} onKick={jest.fn()} />,
    );

    expect(screen.getByRole('button', { name: 'Mời Minh Anh ra' })).toBeBusy();
    expect(screen.getByRole('button', { name: 'Mời Bảo ra' })).not.toBeBusy();
  });

  it('số người là huy hiệu có nhãn đọc được; phòng trống ⇒ "Chờ người chơi vào…"', async () => {
    const view = await render(
      <LobbyPanel isHost pin="123456" players={PLAYERS} onKick={jest.fn()} />,
    );
    expect(screen.getByLabelText('2 người chơi trong phòng')).toBeOnTheScreen();

    await view.rerender(<LobbyPanel isHost pin="123456" players={[]} onKick={jest.fn()} />);
    expect(screen.getByText('Chờ người chơi vào…')).toBeOnTheScreen();
    expect(screen.getByLabelText('0 người chơi trong phòng')).toBeOnTheScreen();
  });
});

describe('LobbyPanel — người chơi', () => {
  it('thấy khối chờ, không có PIN, không có nút mời ra', async () => {
    await render(<LobbyPanel isHost={false} players={PLAYERS} />);

    expect(screen.getByText('Bạn đã vào phòng')).toBeOnTheScreen();
    expect(screen.getByText('Chờ chủ phòng bắt đầu…')).toBeOnTheScreen();
    expect(screen.queryByText('Mã PIN vào phòng')).toBeNull();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});
