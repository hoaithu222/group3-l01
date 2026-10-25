import { fireEvent, screen } from '@testing-library/react-native';

import { ParticipantRow } from '../../../components/people/ParticipantRow';
import { makePerson } from '../../fixtures';
import { renderWithProviders } from '../prejoin/render-helpers';

/** `ParticipantRow` (app.md p2-05 §3.2): mọi trạng thái bằng CHỮ, gộp thành MỘT ô đọc; "Hạ tay"/"Tuỳ chọn" là nút rời, chỉ khi được phép. */

describe('ParticipantRow', () => {
  it('nhãn trợ năng đọc liền: tên, vai trò, giơ tay, bị tắt mic, mic, camera; vai trò là huy hiệu, trạng thái là chữ', async () => {
    await renderWithProviders(
      <ParticipantRow
        isMe={false}
        person={makePerson({
          cameraEnabled: true,
          handRaisedAt: '2026-10-01T09:02:00.000Z',
          micEnabled: false,
          mutedByHost: true,
          name: 'Bình',
          role: 'CO_HOST',
          userId: 'u1',
        })}
      />,
    );

    expect(
      screen.getByLabelText(
        'Bình, Đồng chủ trì, Đang giơ tay, Đã bị chủ trì tắt mic, Mic tắt, Camera bật',
      ),
    ).toBeOnTheScreen();
    for (const text of ['Đồng chủ trì', 'Mic tắt', 'Camera bật', 'Chủ trì đã tắt mic']) {
      expect(screen.getByText(text)).toBeOnTheScreen();
    }
  });

  it('chính mình: "(Bạn)" cạnh tên; người thường không có huy hiệu vai trò; đang nói có chữ "Đang nói"', async () => {
    await renderWithProviders(
      <ParticipantRow isMe person={makePerson({ isSpeaking: true, name: 'Lan', userId: 'me' })} />,
    );

    expect(screen.getByText('(Bạn)')).toBeOnTheScreen();
    expect(screen.queryByText('Chủ trì')).toBeNull();
    expect(screen.getByText('Đang nói')).toBeOnTheScreen();
    expect(screen.getByLabelText('Lan, Bạn, Đang nói, Mic bật, Camera tắt')).toBeOnTheScreen();
  });

  it('hàng đợi giơ tay: số thứ tự hiện cạnh bàn tay và có trong nhãn; "Hạ tay" gọi onLowerHand, đang chạy thì busy', async () => {
    const onLowerHand = jest.fn();
    const person = makePerson({
      handRaisedAt: '2026-10-01T09:02:00.000Z',
      name: 'Cường',
      userId: 'u2',
    });
    const { rerender } = await renderWithProviders(
      <ParticipantRow handOrder={2} isMe={false} person={person} onLowerHand={onLowerHand} />,
    );

    expect(
      screen.getByLabelText('Cường, Đang giơ tay, thứ 2, Mic bật, Camera tắt'),
    ).toBeOnTheScreen();
    expect(screen.getByText('2')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Hạ tay của Cường' }));
    expect(onLowerHand).toHaveBeenCalledTimes(1);

    await rerender(
      <ParticipantRow
        handOrder={2}
        isMe={false}
        lowering
        person={person}
        onLowerHand={onLowerHand}
      />,
    );
    expect(screen.getByRole('button', { name: 'Hạ tay của Cường' })).toBeBusy();

    await rerender(<ParticipantRow handOrder={1} isMe person={person} onLowerHand={onLowerHand} />);
    expect(screen.getByRole('button', { name: 'Hạ tay của bạn' })).toBeOnTheScreen();
  });

  it('nút "Tuỳ chọn" chỉ khi canManage VÀ có handler; bấm gọi onOpenMenu', async () => {
    const onOpenMenu = jest.fn();
    const person = makePerson({ name: 'Cường', userId: 'u2' });
    const { rerender } = await renderWithProviders(<ParticipantRow isMe={false} person={person} />);
    expect(screen.queryByLabelText('Tuỳ chọn cho Cường')).toBeNull();

    await rerender(<ParticipantRow canManage isMe={false} person={person} />);
    expect(screen.queryByLabelText('Tuỳ chọn cho Cường')).toBeNull();

    await rerender(
      <ParticipantRow canManage isMe={false} person={person} onOpenMenu={onOpenMenu} />,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Tuỳ chọn cho Cường' }));
    expect(onOpenMenu).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: /^Hạ tay/ })).toBeNull();
  });
});
