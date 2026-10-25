import { act, fireEvent, screen } from '@testing-library/react-native';

import { MeetingControlBar } from '../../../components/controls/MeetingControlBar';
import { ConsentPromptDialog } from '../../../components/recording/ConsentPromptDialog';
import { RecordingIndicator } from '../../../components/recording/RecordingIndicator';
import { EndedSection } from '../../../screens/StatusSections';
import { meetingRoomApi } from '../../../store/meeting-room.store';
import { makeBrief } from '../../fixtures';
import { renderWithInsets } from '../controls/controls-helpers';

/**
 * Giao diện ghi hình trong phòng (p2-06 app.md §3, §7, §8). ⚠️ Không kiểm style (NativeWind không chạy trong Jest) — chỉ hành vi + nhãn.
 * Tấm "Ghi hình" của chủ trì (`ConsentRequestSheet`) có file riêng: `ConsentRequestSheet.test.tsx` (trần 200 dòng).
 */

describe('RecordingIndicator (RR-19)', () => {
  it('đang ghi → nhãn "● Đang ghi hình" có tên trợ năng; không ghi → không vẽ gì', async () => {
    await renderWithInsets(<RecordingIndicator status="RECORDING" />);
    expect(screen.getByLabelText('Cuộc họp đang được ghi hình')).toBeOnTheScreen();
    await renderWithInsets(<RecordingIndicator status={null} />);
    expect(screen.queryByLabelText('Cuộc họp đang được ghi hình')).toBeNull();
  });
});

describe('ConsentPromptDialog (người tham gia)', () => {
  it('chủ trì hỏi: nói rõ hậu quả + đếm ngược; "Đồng ý" gửi accept, "Không đồng ý" gửi từ chối', async () => {
    const onAccept = jest.fn();
    const onDecline = jest.fn();
    await renderWithInsets(
      <ConsentPromptDialog
        busy={false}
        error={null}
        kind="REQUEST"
        secondsLeft={42}
        visible
        onAccept={onAccept}
        onDecline={onDecline}
      />,
    );
    expect(
      screen.getByText(/Bản ghi lưu 90 ngày và người trong cuộc họp có thể xem\. Còn 42 giây/),
    ).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Đồng ý'));
    await fireEvent.press(screen.getByText('Không đồng ý'));
    expect(onAccept).toHaveBeenCalledTimes(1);
    expect(onDecline).toHaveBeenCalledTimes(1);
  });

  it('người vào sau: "Chỉ xem và nghe" (không mặc định đồng ý)', async () => {
    const onDecline = jest.fn();
    await renderWithInsets(
      <ConsentPromptDialog
        busy={false}
        error={null}
        kind="LATE"
        secondsLeft={null}
        visible
        onAccept={jest.fn()}
        onDecline={onDecline}
      />,
    );
    expect(screen.getByText('Cuộc họp đang được ghi hình')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Chỉ xem và nghe'));
    expect(onDecline).toHaveBeenCalled();
  });
});

describe('MeetingControlBar khi chưa đồng ý ghi hình (RR-10)', () => {
  it('mic/camera KHOÁ kèm nhãn "Cần đồng ý"; bấm mở lại hộp thoại đồng ý, KHÔNG bật mic', async () => {
    const onToggleMic = jest.fn();
    const onConsentLocked = jest.fn();
    const noop = jest.fn();
    await renderWithInsets(
      <MeetingControlBar
        camOn={false}
        consentLocked
        handRaised={false}
        micOn={false}
        participantCount={3}
        role="MEMBER"
        onConsentLocked={onConsentLocked}
        onLeave={noop}
        onOpenChat={noop}
        onOpenMore={noop}
        onOpenParticipants={noop}
        onOpenReactions={noop}
        onToggleCamera={noop}
        onToggleHand={noop}
        onToggleMic={onToggleMic}
      />,
    );
    await fireEvent.press(screen.getByLabelText('Micro bị khoá — cần đồng ý ghi hình để bật'));
    expect(onConsentLocked).toHaveBeenCalled();
    expect(onToggleMic).not.toHaveBeenCalled();
    expect(screen.getAllByText('Cần đồng ý')).toHaveLength(2);
  });
});

describe('EndedSection — "Viết biên bản" (p2-06)', () => {
  it('chỉ hiện với người sửa được biên bản của cuộc họp bắt buộc biên bản', async () => {
    const onWriteRecap = jest.fn();
    meetingRoomApi.reset();
    meetingRoomApi.patch({
      brief: makeBrief({
        myActions: { ...makeBrief().myActions, canEditRecap: true },
        recapRequired: true,
      }),
      phase: 'ENDED',
    });
    await renderWithInsets(<EndedSection onExit={jest.fn()} onWriteRecap={onWriteRecap} />);
    await fireEvent.press(screen.getByText('Viết biên bản'));
    expect(onWriteRecap).toHaveBeenCalled();

    await act(async () => meetingRoomApi.patch({ brief: makeBrief({ recapRequired: true }) }));
    await renderWithInsets(<EndedSection onExit={jest.fn()} onWriteRecap={onWriteRecap} />);
    expect(screen.queryByText('Viết biên bản')).toBeNull();
  });
});
