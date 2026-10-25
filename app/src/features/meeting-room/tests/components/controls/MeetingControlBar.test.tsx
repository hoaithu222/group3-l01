import { fireEvent, render, screen } from '@testing-library/react-native';

import { MeetingControlBar, type MeetingControlBarProps } from '../../../components/controls/MeetingControlBar';
import { HAND_EMOJI } from '../../../utils/hand-queue.utils';

/**
 * Thanh điều khiển phòng họp (app.md §3.2, §7): MỘT hàng Mic · Camera · Giơ tay · Cảm xúc · Thêm · Rời; Rời cách xa Mic; mọi trạng thái
 * bằng CHỮ. Chat + Mọi người đã lên thanh tiêu đề (test ở `MeetingHeader.test.tsx`).
 * ⚠️ Style của NativeWind không có trong Jest — chỉ kiểm HÀNH VI (nhãn, callback, thứ tự, busy).
 */
function makeProps(over: Partial<MeetingControlBarProps> = {}): MeetingControlBarProps {
  return {
    camOn: true,
    handRaised: false,
    micOn: true,
    onLeave: jest.fn(),
    onOpenMore: jest.fn(),
    onOpenReactions: jest.fn(),
    onToggleCamera: jest.fn(),
    onToggleHand: jest.fn(),
    onToggleMic: jest.fn(),
    ...over,
  };
}

const labelsOfButtons = () => screen.getAllByRole('button').map((button) => button.props.accessibilityLabel as string);

describe('MeetingControlBar', () => {
  it('luôn có Mic, Camera và Rời', async () => {
    await render(<MeetingControlBar {...makeProps()} />);

    expect(screen.getByLabelText('Tắt micro')).toBeOnTheScreen();
    expect(screen.getByLabelText('Tắt camera')).toBeOnTheScreen();
    expect(screen.getByLabelText('Rời cuộc họp')).toBeOnTheScreen();
  });

  it('mic/camera TẮT thì nhãn CHỮ đổi sang "Bật mic"/"Bật video" (trạng thái không chỉ nằm ở màu); câu đọc vẫn nói đủ', async () => {
    await render(<MeetingControlBar {...makeProps({ camOn: false, micOn: false })} />);

    expect(screen.getByText('Bật mic')).toBeOnTheScreen();
    expect(screen.getByText('Bật video')).toBeOnTheScreen();
    expect(screen.getByLabelText('Bật micro')).toBeOnTheScreen();
    expect(screen.getByLabelText('Bật camera')).toBeOnTheScreen();
  });

  it('MỘT hàng đúng thứ tự Meet: Mic · Camera · Giơ tay · Cảm xúc · Thêm · Rời (Rời cuối, cách Mic ≥ 1 nút)', async () => {
    await render(<MeetingControlBar {...makeProps()} />);

    const labels = labelsOfButtons();
    expect(labels).toEqual(['Tắt micro', 'Tắt camera', 'Giơ tay', 'Gửi cảm xúc', 'Thêm tuỳ chọn', 'Rời cuộc họp']);
    expect(labels.indexOf('Rời cuộc họp') - labels.indexOf('Tắt micro')).toBeGreaterThanOrEqual(2);
  });

  it('Chat và Mọi người KHÔNG còn ở thanh đáy (đã lên thanh tiêu đề) — kể cả khi nơi gọi cũ còn truyền props', async () => {
    await render(
      <MeetingControlBar {...makeProps({ chatBadge: 3, lobbyCount: 2, onOpenChat: jest.fn(), onOpenParticipants: jest.fn(), participantCount: 4, role: 'HOST' })} />,
    );

    expect(screen.queryByLabelText(/Mở chat/)).toBeNull();
    expect(screen.queryByLabelText(/Danh sách người tham gia/)).toBeNull();
    expect(screen.getAllByRole('button')).toHaveLength(6);
  });

  it('mỗi nút gọi đúng callback của nó', async () => {
    const props = makeProps();
    await render(<MeetingControlBar {...props} />);

    await fireEvent.press(screen.getByLabelText('Tắt micro'));
    await fireEvent.press(screen.getByLabelText('Tắt camera'));
    await fireEvent.press(screen.getByLabelText('Giơ tay'));
    await fireEvent.press(screen.getByLabelText('Gửi cảm xúc'));
    await fireEvent.press(screen.getByLabelText('Thêm tuỳ chọn'));
    await fireEvent.press(screen.getByLabelText('Rời cuộc họp'));

    for (const handler of [props.onToggleMic, props.onToggleCamera, props.onToggleHand, props.onOpenReactions, props.onOpenMore, props.onLeave]) {
      expect(handler).toHaveBeenCalledTimes(1);
    }
  });

  it('nút Giơ tay là hình bàn tay ✋ (không còn mũi tên); đang giơ tay thì nhãn thành "Hạ tay"', async () => {
    const view = await render(<MeetingControlBar {...makeProps()} />);
    expect(screen.getAllByText(HAND_EMOJI, { includeHiddenElements: true }).length).toBeGreaterThan(0);
    await view.unmount();

    await render(<MeetingControlBar {...makeProps({ handRaised: true })} />);
    expect(screen.getByText('Hạ tay')).toBeOnTheScreen();
    expect(screen.getByLabelText('Hạ tay')).toBeOnTheScreen();
    expect(screen.queryByText('Giơ tay')).toBeNull();
  });

  it('chủ trì đang ghi hình mới có ô "Dừng ghi" — đứng TRƯỚC Rời, Rời vẫn cuối', async () => {
    const stop = jest.fn();
    await render(<MeetingControlBar {...makeProps({ onStopRecording: stop })} />);

    const labels = labelsOfButtons();
    expect(labels).toHaveLength(7);
    expect(labels.at(-2)).toBe('Dừng ghi hình cuộc họp');
    expect(labels.at(-1)).toBe('Rời cuộc họp');
    await fireEvent.press(screen.getByLabelText('Dừng ghi hình cuộc họp'));
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('mic đang xử lý (xin quyền/chờ track): nút báo bận và KHÔNG nhận cú bấm thứ hai', async () => {
    const props = makeProps({ micBusy: true });
    await render(<MeetingControlBar {...props} />);

    const mic = screen.getByLabelText('Tắt micro');
    expect(mic).toBeBusy();
    await fireEvent.press(mic);
    expect(props.onToggleMic).not.toHaveBeenCalled();
  });

  it('chưa đồng ý ghi hình: mic/camera KHOÁ, bấm mở lại hộp thoại đồng ý chứ không bật mic', async () => {
    const props = makeProps({ consentLocked: true, onConsentLocked: jest.fn() });
    await render(<MeetingControlBar {...props} />);

    expect(screen.getAllByText('Cần đồng ý')).toHaveLength(2);
    await fireEvent.press(screen.getByLabelText('Camera bị khoá — cần đồng ý ghi hình để bật'));
    expect(props.onConsentLocked).toHaveBeenCalledTimes(1);
    expect(props.onToggleCamera).not.toHaveBeenCalled();
  });

  it('KHÔNG có nút "Bật mic người khác" (P0)', async () => {
    await render(<MeetingControlBar {...makeProps({ role: 'HOST' })} />);

    expect(screen.queryByText(/người khác/i)).toBeNull();
    expect(screen.queryByLabelText(/mic của/i)).toBeNull();
  });
});
