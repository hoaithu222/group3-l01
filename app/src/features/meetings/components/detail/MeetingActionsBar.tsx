import { Text } from 'react-native';

import { Button } from '@/shared/ui/button';
import type { IconName } from '@/shared/ui/icon';
import { BottomActionBar } from '@/shared/ui/navigation';
import { hapticTap } from '@/shared/utils/haptics';

import type { MeetingDetailDto } from '../../api/meetings.types';
import { JOIN_LABEL, PLATFORM_LABEL } from '../../constants/meetings.constants';
import { openExternalMeeting, openMeetingRoom } from '../../utils/meeting-navigation';

export interface MeetingActionsBarProps {
  meeting: MeetingDetailDto;
  /** Còn bao lâu tới lúc phòng chờ mở (giờ SERVER, ms; 0 = đã mở). */
  joinRemainingMs: number;
}

interface Cta {
  disabled?: boolean;
  /** Icon dẫn nhãn — phân biệt "vào phòng" (máy quay) với "mở liên kết ngoài" (mắt xích) ngay khi liếc thanh đáy. */
  icon: IconName;
  key: string;
  label: string;
  onPress?: () => void;
}

/**
 * Vào phòng họp nội bộ: rung nhẹ TRƯỚC khi đẩy màn (`hapticTap`) — màn phòng họp mở chậm (xin quyền, dựng xem trước) nên cú rung
 * là phản hồi tức thì rằng cú chạm đã được nhận, người dùng khỏi bấm lần hai.
 */
function enterRoom(meetingId: string): void {
  hapticTap();
  openMeetingRoom(meetingId);
}

/**
 * Thanh nút CỐ ĐỊNH ở đáy màn chi tiết (app.md p2-04 §3 `MeetingActionsBar`): chỉ những nút ĐI VÀO cuộc họp — MỘT nút chính (`primary`),
 * nếu còn nút nữa thì `secondary`. MỌI nút theo `myActions` của server — client không tự suy quyền từ vai trò/giờ: Bắt đầu (`canStart`),
 * Vào (`canJoin`, nhãn theo `joinVia`), Mở liên kết ngoài (`canOpenExternal`). Sửa/Huỷ/Xoá/Rời và Chia sẻ nằm ở menu "⋯" trên AppBar
 * (`MeetingDetailMenu`) — hành động phá huỷ không tranh chỗ với nút vào họp. Không có nút nào ⇒ không vẽ cả thanh.
 *
 * PHÒNG CHỜ: người tham dự họp nội bộ vào TRƯỚC giờ mở phòng thấy nút "Vào phòng chờ" bị khoá kèm dòng giải thích — không có nút
 * nào để bấm nhầm, và khi tới mốc màn làm mới chi tiết (`useJoinWindowRefetch`) thì server bật `canJoin`. Vào phòng thật là p2-05
 * (`openMeetingRoom` → route `meeting-room/[meetingId]`).
 */
export function MeetingActionsBar({ joinRemainingMs, meeting }: MeetingActionsBarProps) {
  const a = meeting.myActions;
  const waitingRoom =
    !a.canJoin &&
    !a.canStart &&
    meeting.status === 'SCHEDULED' &&
    meeting.platform === 'INTERNAL' &&
    meeting.myRole !== null &&
    joinRemainingMs > 0;
  const externalUrl = a.canOpenExternal ? meeting.externalUrl : null;

  const ctas: Cta[] = [];
  if (a.canStart) {
    ctas.push({
      icon: meeting.status === 'ENDED' ? 'reload' : 'play',
      key: 'start',
      label: meeting.status === 'ENDED' ? 'Bắt đầu lại' : 'Bắt đầu cuộc họp',
      onPress: () => enterRoom(meeting.id),
    });
  }
  if (a.canJoin) {
    ctas.push({
      icon: 'video-camera',
      key: 'join',
      label: JOIN_LABEL[a.joinVia ?? 'DIRECT'],
      onPress: () => enterRoom(meeting.id),
    });
  }
  if (waitingRoom) {
    ctas.push({ disabled: true, icon: 'clock', key: 'waiting', label: 'Vào phòng chờ' });
  }
  if (externalUrl) {
    ctas.push({
      icon: 'link',
      key: 'external',
      label: `Mở ${PLATFORM_LABEL[meeting.platform]}`,
      onPress: () => void openExternalMeeting(externalUrl),
    });
  }
  if (ctas.length === 0) return null;

  return (
    <BottomActionBar>
      {ctas.map((cta, index) => (
        <Button
          key={cta.key}
          disabled={cta.disabled}
          fullWidth
          iconLeft={cta.icon}
          label={cta.label}
          variant={index === 0 ? 'primary' : 'secondary'}
          onPress={cta.onPress}
        />
      ))}
      {waitingRoom ? (
        <Text className="text-center text-caption-lg text-fg-2">
          Nút vào sẽ bật khi phòng chờ mở — bạn không cần tải lại màn hình.
        </Text>
      ) : null}
    </BottomActionBar>
  );
}
