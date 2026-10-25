import { fireEvent, render, screen, within } from '@testing-library/react-native';

import { MeetingStage } from '../../../components/stage/MeetingStage';
import { makePerson } from '../../fixtures';
import { makeProps, mount, room } from './meeting-stage-kit';

/**
 * Sân khấu — bố cục 1:1 (người kia full + khung tự xem nổi kéo được), số thứ tự giơ tay tính trên CẢ phòng, callback xuống ô ổn định
 * (ô được `memo`). ⚠️ Kéo khung tự xem là cử chỉ native (gesture-handler) — Jest chỉ kiểm khung có mặt và nhận nhấn giữ.
 */
describe('MeetingStage — cuộc 1:1', () => {
  it('Lưới + mình và đúng MỘT người: người kia chiếm sân khấu, mình ở khung tự xem nổi — không chia đôi lưới', async () => {
    await mount({ people: room(2) }).view;

    expect(screen.getByTestId('one-on-one-stage')).toBeOnTheScreen();
    expect(
      within(screen.getByTestId('selfview-pip')).getByLabelText(/^Tôi \(Bạn\)/),
    ).toBeOnTheScreen();
    expect(within(screen.getByTestId('selfview-pip')).queryByLabelText(/Người 2/)).toBeNull();
    expect(screen.getByLabelText(/^Người 2/)).toBeOnTheScreen();
    expect(screen.queryByTestId('grid-pager')).toBeNull();
  });

  it('bố cục Diễn giả hoặc có người chia sẻ thì KHÔNG dùng khung 1:1', async () => {
    const speaker = await mount({ layout: 'SPEAKER', people: room(2) }).view;
    expect(screen.queryByTestId('one-on-one-stage')).toBeNull();
    expect(screen.getByTestId('thumbnail-strip')).toBeOnTheScreen();
    await speaker.unmount();

    const people = room(2);
    people[1] = makePerson({ name: 'Nam', screenShareRef: 'share-u2', userId: 'u2' });
    await mount({ people }).view;
    expect(screen.queryByTestId('one-on-one-stage')).toBeNull();
    expect(screen.getByText('Nam đang chia sẻ màn hình')).toBeOnTheScreen();
  });

  it('nhấn giữ khung tự xem → ghim chính mình', async () => {
    const { props, view } = mount({ people: room(2) });
    await view;

    await fireEvent(
      within(screen.getByTestId('selfview-pip')).getByLabelText(/^Tôi \(Bạn\)/),
      'longPress',
    );
    expect(props.onPin).toHaveBeenCalledWith('me');
  });
});

describe('MeetingStage — giơ tay', () => {
  it('số thứ tự tính trên CẢ phòng (giơ sớm nhất = 1), kể cả người ở trang khác', async () => {
    const people = room(6);
    people[5] = makePerson({
      handRaisedAt: '2026-10-01T09:01:00.000Z',
      name: 'Người 6',
      userId: 'u6',
    });
    people[1] = makePerson({
      handRaisedAt: '2026-10-01T09:02:00.000Z',
      name: 'Người 2',
      userId: 'u2',
    });
    await mount({ pageSize: 4, people }).view;

    expect(
      within(screen.getByTestId('grid-page-0')).getByLabelText('Người 2, Đang giơ tay thứ 2'),
    ).toBeOnTheScreen();
    expect(
      within(screen.getByTestId('grid-page-1')).getByLabelText('Người 6, Đang giơ tay thứ 1'),
    ).toBeOnTheScreen();
  });

  it('dải ô nhỏ (Diễn giả) cũng có huy hiệu ✋ và số thứ tự', async () => {
    const people = room(4);
    people[3] = makePerson({
      handRaisedAt: '2026-10-01T09:01:00.000Z',
      name: 'Người 4',
      userId: 'u4',
    });
    await mount({ layout: 'SPEAKER', people }).view;

    const strip = screen.getByTestId('thumbnail-strip');
    expect(within(strip).getByLabelText('Người 4, Đang giơ tay thứ 1')).toBeOnTheScreen();
    expect(
      within(strip).getAllByTestId('tile-hand-badge', { includeHiddenElements: true }),
    ).toHaveLength(1);
  });

  it('khung tự xem (1:1) cũng có huy hiệu ✋ khi MÌNH giơ tay', async () => {
    const people = room(2);
    people[0] = makePerson({
      handRaisedAt: '2026-10-01T09:01:00.000Z',
      isLocal: true,
      name: 'Tôi',
      userId: 'me',
    });
    await mount({ people }).view;

    const pip = screen.getByTestId('selfview-pip');
    expect(within(pip).getByLabelText('Tôi (Bạn), Đang giơ tay thứ 1')).toBeOnTheScreen();
    expect(
      within(pip).getByTestId('tile-hand-badge', { includeHiddenElements: true }),
    ).toBeOnTheScreen();
  });
});

describe('MeetingStage — chia sẻ màn hình không dựng lại thừa', () => {
  it('snapshot mới cùng track chia sẻ (ref MỚI cùng nội dung) → KHÔNG vẽ lại video chia sẻ', async () => {
    const withShare = () => {
      const people = room(3);
      people[1] = makePerson({ name: 'Nam', screenShareRef: { sid: 'SH_1' }, userId: 'u2' });
      return people;
    };
    const base = makeProps({ people: withShare() });
    const view = await render(<MeetingStage {...base} />);
    await view.rerender(<MeetingStage {...base} people={withShare()} />);

    const shareCalls = jest
      .mocked(base.renderVideo)
      .mock.calls.filter(([, style]) => style?.objectFit === 'contain');
    expect(shareCalls).toHaveLength(1);
    expect(screen.getByText('Nam đang chia sẻ màn hình')).toBeOnTheScreen();
  });
});

describe('MeetingStage — callback ổn định', () => {
  it('cha truyền `onPin` MỚI ở mỗi lần vẽ: nhấn giữ vẫn gọi bản mới nhất với ghim mới nhất', async () => {
    const first = jest.fn();
    const latest = jest.fn();
    const base = makeProps({ onPin: first, people: room(3) });
    const view = await render(<MeetingStage {...base} />);

    await view.rerender(<MeetingStage {...base} pinnedUserId="u2" onPin={latest} />);
    await fireEvent(screen.getByLabelText(/Người 2.*Đã ghim/), 'longPress');

    expect(first).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledWith(null);
  });

  it('cha truyền `onChangePage` MỚI: vuốt trang gọi bản mới nhất', async () => {
    const latest = jest.fn();
    const base = makeProps({ people: room(6) });
    const view = await render(<MeetingStage {...base} />);
    await view.rerender(<MeetingStage {...base} onChangePage={latest} />);
    await fireEvent(screen.getByTestId('grid-pager-frame'), 'layout', {
      nativeEvent: { layout: { height: 600, width: 300, x: 0, y: 0 } },
    });

    await fireEvent(screen.getByTestId('grid-pager'), 'momentumScrollEnd', {
      nativeEvent: { contentOffset: { x: 300, y: 0 } },
    });
    expect(base.onChangePage).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledWith(1);
  });
});
