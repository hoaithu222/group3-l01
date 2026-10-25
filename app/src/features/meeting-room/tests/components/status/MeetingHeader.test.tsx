import { fireEvent, render, screen } from '@testing-library/react-native';

import { MeetingHeader, type MeetingHeaderProps } from '../../../components/status/MeetingHeader';

/**
 * Thanh tiêu đề trong phòng (app.md §3.2 `MeetingHeader`): tên + đồng hồ + huy hiệu trạng thái BẰNG CHỮ ("Đã khoá", "Mạng yếu/Mạng mất") +
 * nút "Thu nhỏ"; bên phải Chat · Mọi người (chuyển từ thanh đáy lên) và viên "✋ n" cho MỌI người.
 * ⚠️ Màu/nền là class NativeWind — Jest không thấy, nên chỉ kiểm chữ và hành vi.
 */
function mount(over: Partial<MeetingHeaderProps> = {}) {
  return render(<MeetingHeader clock="12:34" locked={false} quality="good" title="Họp giao ban" {...over} />);
}

describe('MeetingHeader', () => {
  it('hiện tên cuộc họp và đồng hồ thời lượng', async () => {
    await mount();

    expect(screen.getByRole('header')).toHaveTextContent('Họp giao ban');
    expect(screen.getByText('12:34')).toBeOnTheScreen();
    expect(screen.getByLabelText('Thời lượng cuộc họp 12:34')).toBeOnTheScreen();
  });

  it('mọi thứ bình thường (không khoá, mạng tốt) → không có huy hiệu nào', async () => {
    await mount({ locked: false, quality: 'good' });

    expect(screen.queryByText('Đã khoá')).toBeNull();
    expect(screen.queryByText('Mạng yếu')).toBeNull();
    expect(screen.queryByText('Mạng mất')).toBeNull();
  });

  it('cuộc họp khoá → chữ "Đã khoá"', async () => {
    await mount({ locked: true });

    expect(screen.getByText('Đã khoá')).toBeOnTheScreen();
  });

  it('mạng yếu → "Mạng yếu"; mất mạng → "Mạng mất" (trạng thái nằm ở CHỮ, không chỉ màu)', async () => {
    const poor = await mount({ quality: 'poor' });
    expect(screen.getByText('Mạng yếu')).toBeOnTheScreen();
    await poor.unmount();

    await mount({ quality: 'lost' });
    expect(screen.getByText('Mạng mất')).toBeOnTheScreen();
  });

  it('đang ghi hình → nhãn đỏ có CHỮ ở dòng huy hiệu', async () => {
    await mount({ recordingStatus: 'RECORDING' });

    expect(screen.getByLabelText('Cuộc họp đang được ghi hình')).toBeOnTheScreen();
  });

  it('có `onMinimize` → nút "Thu nhỏ cuộc họp" gọi handler; không có thì ẩn nút', async () => {
    const onMinimize = jest.fn();
    const withButton = await mount({ onMinimize });
    await fireEvent.press(screen.getByRole('button', { name: 'Thu nhỏ cuộc họp' }));
    expect(onMinimize).toHaveBeenCalledTimes(1);
    await withButton.unmount();

    await mount({ onMinimize: undefined });
    expect(screen.queryByRole('button', { name: 'Thu nhỏ cuộc họp' })).toBeNull();
  });

  it('Chat ở thanh tiêu đề: câu đọc nói số tin chưa đọc; không có tin thì chỉ "Mở chat"; vắng handler thì ẩn', async () => {
    const onOpenChat = jest.fn();
    const unread = await mount({ chatBadge: 3, onOpenChat });
    await fireEvent.press(screen.getByRole('button', { name: 'Mở chat, 3 tin nhắn chưa đọc' }));
    expect(onOpenChat).toHaveBeenCalledTimes(1);
    await unread.unmount();

    const read = await mount({ chatBadge: 0, onOpenChat });
    expect(screen.getByRole('button', { name: 'Mở chat' })).toBeOnTheScreen();
    await read.unmount();

    await mount();
    expect(screen.queryByRole('button', { name: /Mở chat/ })).toBeNull();
  });

  it('Mọi người: số người trong phòng; CHỈ chủ trì/đồng chủ trì thấy số người đang chờ vào', async () => {
    const onOpenParticipants = jest.fn();
    const host = await mount({ lobbyCount: 2, onOpenParticipants, participantCount: 4, role: 'HOST' });
    await fireEvent.press(screen.getByRole('button', { name: 'Danh sách người tham gia, 4 người, 2 người đang chờ vào' }));
    expect(onOpenParticipants).toHaveBeenCalledTimes(1);
    await host.unmount();

    const coHost = await mount({ lobbyCount: 3, onOpenParticipants, participantCount: 4, role: 'CO_HOST' });
    expect(screen.getByLabelText(/3 người đang chờ vào/)).toBeOnTheScreen();
    await coHost.unmount();

    await mount({ lobbyCount: 2, onOpenParticipants, participantCount: 4, role: 'MEMBER' });
    expect(screen.getByRole('button', { name: 'Danh sách người tham gia, 4 người' })).toBeOnTheScreen();
    expect(screen.queryByLabelText(/đang chờ vào/)).toBeNull();
  });

  it('có người giơ tay → viên "✋ n" cho MỌI người (cả người thường); chạm mở danh sách người; 0 người thì không có viên', async () => {
    const onOpenParticipants = jest.fn();
    const raised = await mount({ onOpenParticipants, raisedHands: 2, role: 'MEMBER' });
    expect(screen.getByText('2')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: '2 người đang giơ tay' }));
    expect(onOpenParticipants).toHaveBeenCalledTimes(1);
    await raised.unmount();

    await mount({ onOpenParticipants, raisedHands: 0 });
    expect(screen.queryByLabelText(/đang giơ tay/)).toBeNull();
  });
});
