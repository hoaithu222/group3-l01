import { fireEvent, render, screen, within } from '@testing-library/react-native';

import { MeetingStage, type MeetingStageProps } from '../../../components/stage/MeetingStage';
import { makePerson } from '../../fixtures';
import { makeProps, mount, room } from './meeting-stage-kit';

/**
 * Sân khấu (app.md §3.2 `MeetingStage`): chia trang đúng `pageSize`, ghim, có chia sẻ → spotlight, chỉ có mình → ô của mình + "Bạn đang là
 * người duy nhất ở đây". Bố cục 1:1, số thứ tự giơ tay, callback ổn định: `MeetingStage.layouts.test.tsx`.
 * ⚠️ Cử chỉ vuốt/pinch là của native — ở đây bắn thẳng sự kiện `momentumScrollEnd`/`layout` của FlatList.
 */

describe('MeetingStage — lưới phân trang', () => {
  it('chia trang đúng `pageSize`: 6 người, 4 ô/trang → 2 trang (4 + 2)', async () => {
    await mount({ pageSize: 4, people: room(6) }).view;

    expect(within(screen.getByTestId('grid-page-0')).getAllByRole('button')).toHaveLength(4);
    expect(within(screen.getByTestId('grid-page-1')).getAllByRole('button')).toHaveLength(2);
    expect(screen.queryByTestId('grid-page-2')).toBeNull();
    expect(screen.getByLabelText('Trang 1 trên 2')).toBeOnTheScreen();
  });

  it('máy tính bảng 9 ô/trang: 10 người → 2 trang (9 + 1)', async () => {
    await mount({ pageSize: 9, people: room(10) }).view;

    expect(within(screen.getByTestId('grid-page-0')).getAllByRole('button')).toHaveLength(9);
    expect(within(screen.getByTestId('grid-page-1')).getAllByRole('button')).toHaveLength(1);
  });

  it('một trang đủ chỗ → không có chấm trang', async () => {
    await mount({ pageSize: 4, people: room(3) }).view;

    expect(screen.queryByText(/^Trang /)).toBeNull();
    expect(screen.queryByTestId('grid-page-1')).toBeNull();
  });

  it('trang hiện tại theo `page` của cha, và bị KẸP khi số trang giảm (người rời phòng)', async () => {
    await mount({ page: 1, people: room(6) }).view;
    expect(screen.getByLabelText('Trang 2 trên 2')).toBeOnTheScreen();
  });

  it('`page` vượt số trang thì kẹp về trang cuối', async () => {
    await mount({ page: 7, people: room(6) }).view;
    expect(screen.getByLabelText('Trang 2 trên 2')).toBeOnTheScreen();
  });

  it('vuốt sang trang mới → báo cha (`onChangePage`); vuốt lại đúng trang cũ thì không báo thừa', async () => {
    const { props, view } = mount({ people: room(6) });
    await view;
    await fireEvent(screen.getByTestId('grid-pager-frame'), 'layout', { nativeEvent: { layout: { height: 600, width: 300, x: 0, y: 0 } } });

    await fireEvent(screen.getByTestId('grid-pager'), 'momentumScrollEnd', { nativeEvent: { contentOffset: { x: 0, y: 0 } } });
    expect(props.onChangePage).not.toHaveBeenCalled();

    await fireEvent(screen.getByTestId('grid-pager'), 'momentumScrollEnd', { nativeEvent: { contentOffset: { x: 300, y: 0 } } });
    expect(props.onChangePage).toHaveBeenCalledWith(1);
  });

  it('nhấn giữ một ô → ghim người đó; nhấn giữ ô ĐANG ghim → bỏ ghim', async () => {
    const first = mount({ people: room(3) });
    await first.view;
    await fireEvent(screen.getByLabelText(/Người 2/), 'longPress');
    expect(first.props.onPin).toHaveBeenCalledWith('u2');
  });

  it('ô đang ghim: nhấn giữ lại → onPin(null)', async () => {
    const { props, view } = mount({ people: room(3), pinnedUserId: 'u2' });
    await view;

    await fireEvent(screen.getByLabelText(/Người 2.*Đã ghim/), 'longPress');

    expect(props.onPin).toHaveBeenCalledWith(null);
  });
});

describe('MeetingStage — bố cục Diễn giả', () => {
  it('layout SPEAKER: một ô lớn + dải ô nhỏ, không có lưới phân trang', async () => {
    await mount({ layout: 'SPEAKER', people: room(4) }).view;

    expect(within(screen.getByTestId('thumbnail-strip')).getAllByRole('button')).toHaveLength(3);
    expect(screen.queryByTestId('grid-pager')).toBeNull();
    expect(screen.queryByText(/^Trang /)).toBeNull();
  });
});

describe('MeetingStage — chỉ có mình', () => {
  it('thấy CHÍNH MÌNH (ô của mình) + "Bạn đang là người duy nhất ở đây" kèm nút "Mời người khác"', async () => {
    const onInvite = jest.fn();
    await mount({ onInvite, people: room(1) }).view;

    expect(screen.getByText('Bạn đang là người duy nhất ở đây')).toBeOnTheScreen();
    expect(screen.getByLabelText(/^Tôi \(Bạn\)/)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Mời người khác' }));
    expect(onInvite).toHaveBeenCalledTimes(1);
  });

  it('không nối `onInvite` thì không có nút mời', async () => {
    await mount({ people: room(1) }).view;

    expect(screen.getByText('Bạn đang là người duy nhất ở đây')).toBeOnTheScreen();
    expect(screen.queryByText('Mời người khác')).toBeNull();
  });

  it('chưa có ai (danh sách rỗng) chỉ còn lời nhắn, không ném lỗi', async () => {
    await mount({ people: [] }).view;

    expect(screen.getByText('Bạn đang là người duy nhất ở đây')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /Bạn\)/ })).toBeNull();
  });
});

describe('MeetingStage — có người chia sẻ màn hình', () => {
  const withSharer = (over: Partial<MeetingStageProps> = {}) => {
    const people = room(3);
    people[1] = makePerson({ name: 'Nam', screenShareRef: 'share-u2', userId: 'u2' });
    return mount({ people, ...over });
  };

  it('nội dung chia sẻ chiếm vùng chính, thay cho lưới; dải ô nhỏ liệt kê MỌI người', async () => {
    const { props, view } = withSharer();
    await view;

    expect(screen.getByText('Nam đang chia sẻ màn hình')).toBeOnTheScreen();
    expect(screen.getByText('VIDEO:share-u2')).toBeOnTheScreen();
    expect(props.renderVideo).toHaveBeenCalledWith('share-u2', { objectFit: 'contain' });
    expect(within(screen.getByTestId('thumbnail-strip')).getAllByRole('button')).toHaveLength(3);
    expect(screen.queryByTestId('grid-pager')).toBeNull();
  });

  it('có chia sẻ thì bố cục Diễn giả cũng nhường chỗ cho spotlight', async () => {
    await withSharer({ layout: 'SPEAKER' }).view;

    expect(screen.getByText('Nam đang chia sẻ màn hình')).toBeOnTheScreen();
  });

  it('chưa vẽ được video chia sẻ → báo bằng chữ thay vì khung trống', async () => {
    await withSharer({ renderVideo: jest.fn(() => null) }).view;

    expect(screen.getByText('Đang tải màn hình chia sẻ…')).toBeOnTheScreen();
  });

  it('"Toàn màn hình" ẩn dải ô nhỏ và báo cha; "Thu nhỏ" trả lại', async () => {
    const onExpandedChange = jest.fn();
    await withSharer({ onExpandedChange }).view;

    await fireEvent.press(screen.getByText('Toàn màn hình'));
    expect(onExpandedChange).toHaveBeenLastCalledWith(true);
    expect(screen.queryByTestId('thumbnail-strip')).toBeNull();

    await fireEvent.press(screen.getByText('Thu nhỏ'));
    expect(onExpandedChange).toHaveBeenLastCalledWith(false);
    expect(screen.getByTestId('thumbnail-strip')).toBeOnTheScreen();
  });

  it('đang toàn màn hình mà người kia DỪNG chia sẻ → báo cha thoát toàn màn hình (không kẹt ẩn thanh điều khiển)', async () => {
    const onExpandedChange = jest.fn();
    const people = room(3);
    people[1] = makePerson({ name: 'Nam', screenShareRef: 'share-u2', userId: 'u2' });
    const props = makeProps({ onExpandedChange, people });
    const view = await render(<MeetingStage {...props} />);

    await fireEvent.press(screen.getByText('Toàn màn hình'));
    expect(onExpandedChange).toHaveBeenLastCalledWith(true);

    await view.rerender(<MeetingStage {...props} people={room(3)} />);
    expect(screen.queryByText('Nam đang chia sẻ màn hình')).toBeNull();
    expect(onExpandedChange).toHaveBeenLastCalledWith(false);
  });

  it('CHÍNH MÌNH chia sẻ: không vẽ track màn hình của mình (gương đối gương), có nút "Dừng chia sẻ"', async () => {
    const onStopShare = jest.fn();
    const people = room(3);
    people[0] = makePerson({ isLocal: true, name: 'Tôi', screenShareRef: 'share-me', userId: 'me' });
    const { props, view } = mount({ onStopShare, people });
    await view;

    expect(screen.getByText('Mọi người đang xem màn hình của bạn')).toBeOnTheScreen();
    expect(screen.getByText('Bạn đang chia sẻ màn hình')).toBeOnTheScreen();
    expect(props.renderVideo).not.toHaveBeenCalledWith('share-me', expect.anything());
    await fireEvent.press(screen.getByText('Dừng chia sẻ'));
    expect(onStopShare).toHaveBeenCalledTimes(1);
  });
});
