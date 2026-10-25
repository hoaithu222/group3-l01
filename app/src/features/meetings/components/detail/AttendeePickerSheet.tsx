import { useState } from 'react';

import { BottomSheet, SheetActions } from '@/shared/ui/bottom-sheet';
import { showToast } from '@/shared/utils/toast.utils';

import type { AddAttendeesResult, MeetingDetailDto } from '../../api/meetings.types';
import { ATTENDEES_MAX } from '../../constants/meetings.constants';
import { useAddAttendees } from '../../queries/meetings.mutations';
import { classifyMeetingError } from '../../utils/meeting-errors';
import { MemberPickList } from '../form/MemberPickList';

export interface AttendeePickerSheetProps {
  /** Người ĐÃ tải trong danh sách — chip khoá. Trang chưa tải thì BE trả `alreadyAttending`, không lỗi. */
  existingIds: ReadonlySet<string>;
  meeting: MeetingDetailDto;
  visible: boolean;
  onClose: () => void;
}

/** Gộp kết quả `POST /attendees` thành MỘT câu: đã thêm / đã có sẵn / bị từ chối (`MEET_014` — không còn là thành viên nhóm). */
export function summarizeAdd(result: AddAttendeesResult): { message: string; ok: boolean } {
  const parts: string[] = [];
  if (result.added.length > 0) parts.push(`Đã thêm ${String(result.added.length)} người.`);
  if (result.alreadyAttending.length > 0) {
    parts.push(`${String(result.alreadyAttending.length)} người đã có trong cuộc họp.`);
  }
  if (result.rejected.length > 0) {
    parts.push(
      `${String(result.rejected.length)} người không thêm được vì không còn là thành viên nhóm.`,
    );
  }
  return { message: parts.join(' ') || 'Không có ai được thêm.', ok: result.added.length > 0 };
}

/** Dòng nhắc trên nút khi đã hết chỗ — không có nó, chạm thêm người mà chip không sáng lên trông như máy đơ. */
function roomHint(room: number, pickedCount: number): string | undefined {
  if (room === 0) return `Cuộc họp đã đủ ${String(ATTENDEES_MAX)} người tham dự.`;
  if (pickedCount >= room) return `Đã chọn đủ ${String(room)} chỗ còn trống.`;
  return undefined;
}

/**
 * Thêm người tham dự sau khi tạo (`POST /meetings/:id/attendees`, SCHEDULED/LIVE — server bật `canManageAttendees`). Chọn từ thành
 * viên ACTIVE của nhóm; vai trò mới luôn là ATTENDEE (cấp đồng chủ trì đi qua menu hàng, chỉ HOST). Mỗi lần MỞ là một lượt chọn mới
 * (xoá lựa chọn cũ ngay trong lúc vẽ khi `visible` bật — không effect), danh sách chỉ dựng khi mở.
 *
 * ✅ Nút "Thêm N người" ở `footer` (đứng yên) thay vì cuối thân cuộn: danh sách dài thì trước đây phải cuộn hết mới thấy nút.
 */
export function AttendeePickerSheet({
  existingIds,
  meeting,
  visible,
  onClose,
}: AttendeePickerSheetProps) {
  const add = useAddAttendees(meeting.id);
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setPicked({});
  }
  const ids = Object.keys(picked);
  const room = Math.max(0, ATTENDEES_MAX - meeting.attendeeCount);

  const toggle = (userId: string, name: string) =>
    setPicked((prev) => {
      if (prev[userId] !== undefined) {
        return Object.fromEntries(Object.entries(prev).filter(([id]) => id !== userId));
      }
      return Object.keys(prev).length >= room ? prev : { ...prev, [userId]: name };
    });

  const submit = () =>
    add.mutate(
      { userIds: ids },
      {
        onError: (error) => showToast('error', classifyMeetingError(error).message),
        onSuccess: (result) => {
          const summary = summarizeAdd(result);
          showToast(summary.ok ? 'success' : 'info', summary.message);
          onClose();
        },
      },
    );

  return (
    <BottomSheet
      footer={
        <SheetActions
          hint={roomHint(room, ids.length)}
          primary={{
            disabled: ids.length === 0,
            label: ids.length > 0 ? `Thêm ${String(ids.length)} người` : 'Chọn người để thêm',
            loading: add.isPending,
            onPress: submit,
          }}
        />
      }
      scrollable
      title="Thêm người tham dự"
      visible={visible}
      onClose={onClose}
    >
      {visible ? (
        <MemberPickList
          disabledIds={existingIds}
          selected={ids}
          workspaceId={meeting.workspaceId}
          onToggle={toggle}
        />
      ) : null}
    </BottomSheet>
  );
}
