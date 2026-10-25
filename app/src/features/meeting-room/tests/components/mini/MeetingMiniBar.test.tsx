import { fireEvent, render, screen } from '@testing-library/react-native';

import { MeetingMiniBar } from '../../../components/mini/MeetingMiniBar';

/** `MeetingMiniBar` (app.md p2-05 §3.2): thanh thu nhỏ — tên + đồng hồ + trạng thái mic BẰNG CHỮ, nút mic và "Quay lại". */

describe('MeetingMiniBar', () => {
  it('hiện tên, đồng hồ và trạng thái mic bằng chữ; khối chữ là MỘT ô trợ năng đọc liền', async () => {
    await render(<MeetingMiniBar clock="12:34" micOn={false} title="Họp giao ban" onReturn={jest.fn()} onToggleMic={jest.fn()} />);

    expect(screen.getByText('Họp giao ban')).toBeOnTheScreen();
    expect(screen.getByText('Đang họp · 12:34 · Mic tắt')).toBeOnTheScreen();
    expect(screen.getByLabelText('Cuộc họp Họp giao ban, đang diễn ra, 12:34, mic tắt')).toBeOnTheScreen();
  });

  it('mic đang bật: nút ghi "Tắt micro" và chữ "Mic bật"; bấm gọi onToggleMic', async () => {
    const onToggleMic = jest.fn();
    await render(<MeetingMiniBar clock="00:05" micOn title="Họp" onReturn={jest.fn()} onToggleMic={onToggleMic} />);

    expect(screen.getByText('Đang họp · 00:05 · Mic bật')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Tắt micro' }));
    expect(onToggleMic).toHaveBeenCalledTimes(1);
  });

  it('mic đang tắt: nút ghi "Bật micro"', async () => {
    await render(<MeetingMiniBar clock="00:05" micOn={false} title="Họp" onReturn={jest.fn()} onToggleMic={jest.fn()} />);

    expect(screen.getByRole('button', { name: 'Bật micro' })).toBeOnTheScreen();
  });

  it('"Quay lại" gọi onReturn', async () => {
    const onReturn = jest.fn();
    await render(<MeetingMiniBar clock="00:05" micOn title="Họp" onReturn={onReturn} onToggleMic={jest.fn()} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Quay lại' }));
    expect(onReturn).toHaveBeenCalledTimes(1);
  });

  it('không có onLeave: KHÔNG có nút Rời; có thì nút đỏ "Rời cuộc họp" gọi đúng handler', async () => {
    const onLeave = jest.fn();
    const { rerender } = await render(<MeetingMiniBar clock="00:05" micOn title="Họp" onReturn={jest.fn()} onToggleMic={jest.fn()} />);
    expect(screen.queryByRole('button', { name: 'Rời cuộc họp' })).toBeNull();

    await rerender(<MeetingMiniBar clock="00:05" micOn title="Họp" onLeave={onLeave} onReturn={jest.fn()} onToggleMic={jest.fn()} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Rời cuộc họp' }));
    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  it('đang ghi hình + biết người đang nói: chữ "● Đang ghi" và nhãn trợ năng nói cả hai', async () => {
    await render(
      <MeetingMiniBar clock="00:05" micOn recording="recording" speakerName="Lan" title="Họp" onReturn={jest.fn()} onToggleMic={jest.fn()} />,
    );

    expect(screen.getByText('Đang họp · 00:05 · Mic bật · ● Đang ghi')).toBeOnTheScreen();
    expect(screen.getByLabelText('Cuộc họp Họp, đang diễn ra, 00:05, mic bật, đang ghi, đang nói: Lan')).toBeOnTheScreen();
  });
});
