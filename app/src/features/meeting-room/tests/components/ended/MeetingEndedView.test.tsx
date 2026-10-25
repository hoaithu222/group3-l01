import { fireEvent, screen } from '@testing-library/react-native';

import { MeetingEndedView } from '../../../components/ended/MeetingEndedView';
import { ENDED_REASON_LABEL } from '../../../constants/meeting-room.constants';
import type { MeetingEndReason } from '../../../api/meeting-room.types';
import { renderWithProviders } from '../prejoin/render-helpers';

/** `MeetingEndedView` (app.md p2-05 §3.2): thời lượng làm tròn phút, lý do bằng chữ, "Viết biên bản" chỉ khi cha bật (p2-06). */

describe('MeetingEndedView', () => {
  it.each([
    [2_700, 'Cuộc họp đã kết thúc · 45 phút'],
    [3_900, 'Cuộc họp đã kết thúc · 1 giờ 05 phút'],
    [7_200, 'Cuộc họp đã kết thúc · 2 giờ'],
    [30, 'Cuộc họp đã kết thúc · dưới 1 phút'],
    [null, 'Cuộc họp đã kết thúc'],
  ])('thời lượng %s giây ⇒ "%s"', async (durationSec, title) => {
    await renderWithProviders(<MeetingEndedView durationSec={durationSec} reason={null} onClose={jest.fn()} />);

    expect(screen.getByText(title)).toBeOnTheScreen();
  });

  it.each(Object.keys(ENDED_REASON_LABEL) as MeetingEndReason[])('lý do %s hiện đúng câu trong ENDED_REASON_LABEL', async (reason) => {
    await renderWithProviders(<MeetingEndedView durationSec={600} reason={reason} onClose={jest.fn()} />);

    expect(screen.getByText(ENDED_REASON_LABEL[reason])).toBeOnTheScreen();
  });

  it('không có lý do ⇒ không có dòng lý do; tên cuộc họp hiện làm chữ nhỏ', async () => {
    await renderWithProviders(<MeetingEndedView durationSec={600} reason={null} title="Họp giao ban" onClose={jest.fn()} />);

    expect(screen.getByText('Họp giao ban')).toBeOnTheScreen();
    expect(screen.queryByText(ENDED_REASON_LABEL.HOST_ENDED)).toBeNull();
  });

  it('"Về chi tiết cuộc họp" gọi onClose; mặc định KHÔNG có "Viết biên bản"', async () => {
    const onClose = jest.fn();
    await renderWithProviders(<MeetingEndedView durationSec={600} reason="HOST_ENDED" onClose={onClose} onWriteRecap={jest.fn()} />);

    expect(screen.queryByText('Viết biên bản')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Về chi tiết cuộc họp' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('canWriteRecap + handler: hiện "Viết biên bản" và gọi onWriteRecap; thiếu handler thì không hiện', async () => {
    const onWriteRecap = jest.fn();
    const { rerender } = await renderWithProviders(
      <MeetingEndedView canWriteRecap durationSec={600} reason="HOST_ENDED" onClose={jest.fn()} onWriteRecap={onWriteRecap} />,
    );

    await fireEvent.press(screen.getByRole('button', { name: 'Viết biên bản' }));
    expect(onWriteRecap).toHaveBeenCalledTimes(1);

    await rerender(<MeetingEndedView canWriteRecap durationSec={600} reason="HOST_ENDED" onClose={jest.fn()} />);
    expect(screen.queryByText('Viết biên bản')).toBeNull();
  });

  it('"Vào lại trên máy này" chỉ khi cha truyền onRejoin; bấm gọi đúng handler, "Về chi tiết" vẫn còn', async () => {
    const onRejoin = jest.fn();
    const { rerender } = await renderWithProviders(<MeetingEndedView durationSec={600} reason="MOVED_DEVICE" onClose={jest.fn()} />);
    expect(screen.queryByRole('button', { name: 'Vào lại trên máy này' })).toBeNull();

    await rerender(<MeetingEndedView durationSec={600} reason="MOVED_DEVICE" onClose={jest.fn()} onRejoin={onRejoin} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Vào lại trên máy này' }));
    expect(onRejoin).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Về chi tiết cuộc họp' })).toBeOnTheScreen();
  });
});
