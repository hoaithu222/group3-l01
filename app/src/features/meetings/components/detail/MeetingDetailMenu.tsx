import { useState } from 'react';
import { View } from 'react-native';

import { ActionMenu } from '@/shared/ui/action-menu';
import { Button } from '@/shared/ui/button';

import type { MeetingDetailDto } from '../../api/meetings.types';
import { canShareMeeting, shareMeeting } from '../../utils/meeting-link';
import { openEditMeeting } from '../../utils/meeting-navigation';
import { MeetingCancelDialog } from './MeetingCancelDialog';
import { MeetingDangerDialog, type DangerKind } from './MeetingDangerDialog';

/**
 * Hai khe bên phải của `AppBar` màn chi tiết: "Chia sẻ" (icon — việc hay làm nhất sau khi tạo: gửi mã/link mời) và menu "⋯" gom phần còn
 * lại — Sửa, rồi các việc không hoàn tác (Huỷ / Rời / Xoá, màu đỏ, ở CUỐI). Mọi mục theo `myActions` của server; không mục nào hiện ⇒ menu
 * không vẽ nút. Hộp xác nhận của Huỷ/Rời/Xoá đặt ngay đây để việc bấm và việc hỏi lại ở cùng một chỗ.
 */
export function MeetingDetailMenu({ meeting }: { meeting: MeetingDetailDto }) {
  const [cancelOpen, setCancelOpen] = useState(false);
  const [danger, setDanger] = useState<DangerKind | null>(null);
  const a = meeting.myActions;

  return (
    <View className="flex-row items-center gap-2xs">
      {canShareMeeting(meeting) ? (
        <Button
          accessibilityLabel="Chia sẻ lời mời họp"
          iconLeft="share-02"
          iconOnly
          size="sm"
          variant="tertiary"
          onPress={() => void shareMeeting(meeting)}
        />
      ) : null}
      <ActionMenu
        accessibilityLabel="Tuỳ chọn cuộc họp"
        items={[
          {
            hidden: !(a.canEdit || a.canEditLimited),
            icon: 'edit',
            key: 'edit',
            label: 'Sửa cuộc họp',
            onPress: () => openEditMeeting(meeting.id),
          },
          {
            hidden: !a.canCancel,
            icon: 'cancel',
            key: 'cancel',
            label: 'Huỷ cuộc họp',
            onPress: () => setCancelOpen(true),
            tone: 'danger',
          },
          {
            hidden: !a.canLeaveAttendance,
            icon: 'logout',
            key: 'leave',
            label: 'Rời cuộc họp',
            onPress: () => setDanger('leave'),
            tone: 'danger',
          },
          {
            hidden: !a.canDelete,
            icon: 'delete',
            key: 'delete',
            label: 'Xoá cuộc họp',
            onPress: () => setDanger('delete'),
            tone: 'danger',
          },
        ]}
        title="Cuộc họp"
      />
      <MeetingCancelDialog meeting={meeting} visible={cancelOpen} onClose={() => setCancelOpen(false)} />
      <MeetingDangerDialog kind={danger} meeting={meeting} onClose={() => setDanger(null)} />
    </View>
  );
}
