import { fireEvent, render, screen, within } from '@testing-library/react-native';

import { ParticipantTile } from '../../../components/stage/ParticipantTile';
import { HAND_EMOJI } from '../../../utils/hand-queue.utils';
import { makePerson } from '../../fixtures';
import { makeRenderVideo } from './stage-helpers';

/**
 * Ô một người (app.md §3.2 `ParticipantTile`, §7): mọi trạng thái có trong nhãn trợ năng (giơ tay kèm số thứ tự); ô lớn có CHỮ "Đang nói"/"Đã tắt
 * mic"; MỌI ô (kể cả ô nhỏ) có huy hiệu ✋; nhấn giữ ghim/bỏ ghim; video lỗi/không có thì rơi về avatar; `memo` không dựng lại video thừa.
 * ⚠️ Viền "đang nói"/"giơ tay" là class của NativeWind — Jest không thấy được nên chỉ kiểm CHỮ, huy hiệu + nhãn trợ năng.
 */
describe('ParticipantTile', () => {
  it('người đang nói → nhãn trợ năng có "Đang nói" và hiện chữ "Đang nói" trên ô', async () => {
    await render(<ParticipantTile person={makePerson({ isSpeaking: true, name: 'Lan', userId: 'u1' })} renderVideo={makeRenderVideo()} />);

    expect(screen.getByLabelText(/Đang nói/)).toBeOnTheScreen();
    expect(screen.getByText('Đang nói')).toBeOnTheScreen();
  });

  it('nhãn CHỮ theo trạng thái: đã tắt mic · vai trò hiện trên ô; giơ tay là huy hiệu ✋ — đủ trong nhãn trợ năng', async () => {
    await render(
      <ParticipantTile
        person={makePerson({ handRaisedAt: '2026-10-01T09:01:00.000Z', micEnabled: false, name: 'Lan', role: 'CO_HOST', userId: 'u1' })}
        renderVideo={makeRenderVideo()}
      />,
    );

    expect(screen.getByText('Đã tắt mic')).toBeOnTheScreen();
    expect(screen.getByText('Đồng chủ trì')).toBeOnTheScreen();
    expect(screen.getByTestId('tile-hand-badge', { includeHiddenElements: true })).toBeOnTheScreen();
    expect(screen.getByLabelText('Lan, Đồng chủ trì, Đang giơ tay, Đã tắt mic')).toBeOnTheScreen();
  });

  it('giơ tay có số thứ tự: huy hiệu "✋ 2" và nhãn trợ năng "Đang giơ tay thứ 2"', async () => {
    await render(
      <ParticipantTile handOrder={2} person={makePerson({ handRaisedAt: '2026-10-01T09:01:00.000Z', name: 'Lan', userId: 'u1' })} renderVideo={makeRenderVideo()} />,
    );

    const badge = screen.getByTestId('tile-hand-badge', { includeHiddenElements: true });
    expect(within(badge).getByText(HAND_EMOJI, { includeHiddenElements: true })).toBeOnTheScreen();
    expect(within(badge).getByText('2', { includeHiddenElements: true })).toBeOnTheScreen();
    expect(screen.getByLabelText('Lan, Đang giơ tay thứ 2')).toBeOnTheScreen();
  });

  it('không giơ tay → không có huy hiệu ✋', async () => {
    await render(<ParticipantTile handOrder={undefined} person={makePerson({ name: 'Lan', userId: 'u1' })} renderVideo={makeRenderVideo()} />);

    expect(screen.queryByTestId('tile-hand-badge', { includeHiddenElements: true })).toBeNull();
  });

  it('người MÌNH có "(Bạn)" và video được lật gương', async () => {
    const renderVideo = makeRenderVideo();
    await render(<ParticipantTile person={makePerson({ isLocal: true, name: 'Lan', userId: 'me', videoRef: 'cam-me' })} renderVideo={renderVideo} />);

    expect(screen.getByText('Lan (Bạn)')).toBeOnTheScreen();
    expect(renderVideo).toHaveBeenCalledWith('cam-me', { mirror: true, objectFit: 'cover' });
  });

  it('người khác: video KHÔNG lật gương; hiện video khi có `videoRef`', async () => {
    const renderVideo = makeRenderVideo();
    await render(<ParticipantTile person={makePerson({ name: 'Nam', userId: 'u2', videoRef: 'cam-u2' })} renderVideo={renderVideo} />);

    expect(renderVideo).toHaveBeenCalledWith('cam-u2', { mirror: false, objectFit: 'cover' });
    expect(screen.getByText('VIDEO:cam-u2')).toBeOnTheScreen();
  });

  it('không có `videoRef` → không gọi renderVideo, hiện avatar theo tên', async () => {
    const renderVideo = makeRenderVideo();
    await render(<ParticipantTile person={makePerson({ name: 'Nam', userId: 'u2', videoRef: null })} renderVideo={renderVideo} />);

    expect(renderVideo).not.toHaveBeenCalled();
    expect(screen.getByRole('image', { includeHiddenElements: true, name: 'Nam' })).toBeOnTheScreen();
  });

  it('`renderVideo` trả null (lỗi/track chưa về/adapter không vẽ được) → rơi về avatar', async () => {
    const renderVideo = jest.fn(() => null);
    await render(<ParticipantTile person={makePerson({ name: 'Nam', userId: 'u2', videoRef: 'cam-u2' })} renderVideo={renderVideo} />);

    expect(renderVideo).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('image', { includeHiddenElements: true, name: 'Nam' })).toBeOnTheScreen();
  });

  it('nhấn giữ gọi onLongPress với userId (cha ghim/bỏ ghim)', async () => {
    const onLongPress = jest.fn();
    await render(<ParticipantTile person={makePerson({ name: 'Lan', userId: 'u1' })} renderVideo={makeRenderVideo()} onLongPress={onLongPress} />);

    await fireEvent(screen.getByRole('button'), 'longPress');

    expect(onLongPress).toHaveBeenCalledWith('u1');
  });

  it('đang ghim → có chữ "Đã ghim" và gợi ý "Nhấn giữ để bỏ ghim"; chưa ghim → gợi ý "để ghim"', async () => {
    const pinned = await render(<ParticipantTile person={makePerson({ userId: 'u1' })} pinned renderVideo={makeRenderVideo()} onLongPress={jest.fn()} />);
    expect(screen.getByText('Đã ghim')).toBeOnTheScreen();
    expect(screen.getByRole('button').props.accessibilityHint).toBe('Nhấn giữ để bỏ ghim');
    await pinned.unmount();

    await render(<ParticipantTile person={makePerson({ userId: 'u1' })} renderVideo={makeRenderVideo()} onLongPress={jest.fn()} />);
    expect(screen.queryByText('Đã ghim')).toBeNull();
    expect(screen.getByRole('button').props.accessibilityHint).toBe('Nhấn giữ để ghim');
  });

  it('không có handler thì ô KHÔNG phải nút (chỉ để xem)', async () => {
    await render(<ParticipantTile person={makePerson({ userId: 'u1' })} renderVideo={makeRenderVideo()} />);

    expect(screen.queryByRole('button')).toBeNull();
  });

  it('ô nhỏ (dải thumbnail) VẪN có huy hiệu ✋ dù người đó đang nói (trước đây "Đang nói" che mất tay giơ); chip chỉ còn hình, nhãn trợ năng đủ', async () => {
    await render(
      <ParticipantTile
        compact
        handOrder={1}
        person={makePerson({ handRaisedAt: '2026-10-01T09:01:00.000Z', isSpeaking: true, micEnabled: false, name: 'Lan', userId: 'u1' })}
        renderVideo={makeRenderVideo()}
      />,
    );

    expect(screen.getByTestId('tile-hand-badge', { includeHiddenElements: true })).toBeOnTheScreen();
    expect(screen.getByTestId('speaking-bars', { includeHiddenElements: true })).toBeOnTheScreen();
    expect(screen.queryByText('Đang nói')).toBeNull();
    expect(screen.queryByText('Đã tắt mic')).toBeNull();
    expect(screen.getByLabelText('Lan, Đang nói, Đang giơ tay thứ 1, Đã tắt mic')).toBeOnTheScreen();
  });

  it('ô lớn: người đang nói có ba vạch nhịp + chữ "Đang nói"; im lặng thì không có vạch nào (không vòng lặp chạy khi im)', async () => {
    const speaking = await render(<ParticipantTile person={makePerson({ isSpeaking: true, userId: 'u1' })} renderVideo={makeRenderVideo()} />);
    expect(screen.getByTestId('speaking-bars', { includeHiddenElements: true })).toBeOnTheScreen();
    await speaking.unmount();

    await render(<ParticipantTile person={makePerson({ userId: 'u1' })} renderVideo={makeRenderVideo()} />);
    expect(screen.queryByTestId('speaking-bars', { includeHiddenElements: true })).toBeNull();
    expect(screen.queryByText('Đang nói')).toBeNull();
  });

  it('memo: snapshot mới cùng track (videoRef MỚI nhưng cùng nội dung) hay chỉ đổi chất lượng mạng/đang nói → KHÔNG dựng lại video', async () => {
    const renderVideo = makeRenderVideo();
    const track = { publication: 'pub-u2', source: 'camera' };
    const view = await render(<ParticipantTile person={makePerson({ name: 'Nam', userId: 'u2', videoRef: { ...track } })} renderVideo={renderVideo} />);
    expect(renderVideo).toHaveBeenCalledTimes(1);

    await view.rerender(
      <ParticipantTile person={makePerson({ connectionQuality: 'poor', name: 'Nam', userId: 'u2', videoRef: { ...track } })} renderVideo={renderVideo} />,
    );
    await view.rerender(<ParticipantTile person={makePerson({ isSpeaking: true, name: 'Nam', userId: 'u2', videoRef: { ...track } })} renderVideo={renderVideo} />);

    expect(screen.getByLabelText('Nam, Đang nói')).toBeOnTheScreen();
    expect(renderVideo).toHaveBeenCalledTimes(1);

    await view.rerender(<ParticipantTile person={makePerson({ name: 'Nam', userId: 'u2', videoRef: { publication: 'pub-moi', source: 'camera' } })} renderVideo={renderVideo} />);
    expect(renderVideo).toHaveBeenCalledTimes(2);
  });
});
