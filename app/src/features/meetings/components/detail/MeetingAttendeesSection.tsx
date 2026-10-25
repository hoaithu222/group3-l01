import { useState } from 'react';
import { View } from 'react-native';

import { useRefetchOnFocus } from '@/shared/hooks/useRefetchOnFocus';
import { Button } from '@/shared/ui/button';
import { Dialog } from '@/shared/ui/modal';
import { Section } from '@/shared/ui/section';
import { Skeleton } from '@/shared/ui/skeleton';
import { showToast } from '@/shared/utils/toast.utils';

import type { MeetingAttendeeDto, MeetingDetailDto } from '../../api/meetings.types';
import {
  useRemoveAttendee,
  useSetAttendeeRole,
  useTransferHost,
} from '../../queries/meetings.mutations';
import { useMeetingAttendees } from '../../queries/meetings.queries';
import {
  type AttendeeActions,
  attendeeActions,
  hasAnyAttendeeAction,
} from '../../utils/attendee-actions';
import { classifyMeetingError } from '../../utils/meeting-errors';
import { AttendeeActionsSheet } from './AttendeeActionsSheet';
import { AttendeePickerSheet } from './AttendeePickerSheet';
import { AttendeeRow } from './AttendeeRow';

type Confirm = { attendee: MeetingAttendeeDto; kind: 'remove' | 'transfer' } | null;

const NO_ACTIONS: AttendeeActions = { coHost: null, remove: false, transfer: false };

/**
 * Người tham dự (cursor, tải thêm bằng nút — nằm trong `ScrollView` của màn nên không dùng `FlatList` lồng). Cuộc họp chỉ có
 * metadata (`isMetadataOnly`) không tải danh sách — BE cũng từ chối. Quản lý theo quyền SERVER (`canManageAttendees` thêm/xoá,
 * `canManageRoles` đổi vai/giao chủ trì): thêm người (`AttendeePickerSheet`), menu hàng (cấp/thu đồng chủ trì, giao chủ trì, xoá —
 * xác nhận nêu tên). Mọi thay đổi làm mới danh sách + chi tiết (`attendeeCount`, `myActions`).
 */
export function MeetingAttendeesSection({ meeting }: { meeting: MeetingDetailDto }) {
  const attendees = useMeetingAttendees(meeting.id, !meeting.isMetadataOnly);
  // RSVP của người khác chỉ phát tới CHỦ TRÌ — người tham dự thường thấy danh sách mới khi quay lại màn (chi tiết giữ mounted dưới
  // Sửa/Biên bản/Bản ghi).
  useRefetchOnFocus(attendees, !meeting.isMetadataOnly);
  const transfer = useTransferHost(meeting.id);
  const remove = useRemoveAttendee(meeting.id);
  const setRole = useSetAttendeeRole(meeting.id);
  const [menuFor, setMenuFor] = useState<MeetingAttendeeDto | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [adding, setAdding] = useState(false);
  if (meeting.isMetadataOnly) return null;

  const rows = attendees.data?.pages.flatMap((page) => page.items) ?? [];
  const open = meeting.status === 'SCHEDULED' || meeting.status === 'LIVE';
  const onError = (error: unknown) => showToast('error', classifyMeetingError(error).message);
  const name = (confirm?.attendee ?? menuFor)?.name || 'người này';

  const changeRole = (attendee: MeetingAttendeeDto, grant: boolean) =>
    setRole.mutate(
      { role: grant ? 'CO_HOST' : 'ATTENDEE', userId: attendee.userId },
      {
        onError,
        onSuccess: () =>
          showToast('success', grant ? `${name} đã là đồng chủ trì.` : 'Đã bỏ vai đồng chủ trì.'),
      },
    );

  const runConfirm = () => {
    if (!confirm) return;
    const done = (message: string) => () => {
      showToast('success', message);
      setConfirm(null);
    };
    if (confirm.kind === 'transfer') {
      transfer.mutate(
        { expectedVersion: meeting.version, toUserId: confirm.attendee.userId },
        { onError, onSuccess: done(`Đã giao chủ trì cho ${name}.`) },
      );
    } else {
      remove.mutate(confirm.attendee.userId, {
        onError,
        onSuccess: done(`Đã xoá ${name} khỏi cuộc họp.`),
      });
    }
  };

  const isTransfer = confirm?.kind === 'transfer';

  return (
    <Section
      action={
        open && meeting.myActions.canManageAttendees ? (
          <Button
            iconLeft="add-team"
            label="Thêm người"
            size="sm"
            variant="secondary"
            onPress={() => setAdding(true)}
          />
        ) : undefined
      }
      icon="add-team"
      title={`Người tham dự (${String(meeting.attendeeCount)})`}
    >
      <View className="gap-2xs">
        {/* Khung xương hình HÀNG người (avatar + tên) lúc danh sách đang tải — khối không trống trơn dưới tiêu đề. */}
        {attendees.isPending ? (
          <>
            <Skeleton className="h-11 rounded-sm" />
            <Skeleton className="h-11 rounded-sm" />
          </>
        ) : null}
        {attendees.isError && rows.length === 0 ? (
          <Button
            iconLeft="reload"
            label="Tải lại danh sách"
            size="sm"
            variant="tertiary"
            onPress={() => void attendees.refetch()}
          />
        ) : null}
        {rows.map((attendee) => (
          <AttendeeRow
            key={attendee.userId}
            attendee={attendee}
            onMore={
              hasAnyAttendeeAction(attendeeActions(meeting, attendee))
                ? () => setMenuFor(attendee)
                : undefined
            }
          />
        ))}
        {attendees.hasNextPage ? (
          <Button
            label="Xem thêm"
            loading={attendees.isFetchingNextPage}
            size="sm"
            variant="tertiary"
            onPress={() => void attendees.fetchNextPage()}
          />
        ) : null}
      </View>
      <AttendeeActionsSheet
        actions={menuFor ? attendeeActions(meeting, menuFor) : NO_ACTIONS}
        attendee={menuFor}
        onClose={() => setMenuFor(null)}
        onRemove={() => menuFor && setConfirm({ attendee: menuFor, kind: 'remove' })}
        onSetCoHost={(grant) => menuFor && changeRole(menuFor, grant)}
        onTransfer={() => menuFor && setConfirm({ attendee: menuFor, kind: 'transfer' })}
      />
      <AttendeePickerSheet
        existingIds={new Set(rows.map((row) => row.userId))}
        meeting={meeting}
        visible={adding}
        onClose={() => setAdding(false)}
      />
      <Dialog
        description={
          isTransfer
            ? `${name} sẽ thành chủ trì; bạn trở thành đồng chủ trì.`
            : `${name} sẽ không còn trong danh sách và mất quyền xem cuộc họp này.`
        }
        primaryAction={{
          label: isTransfer ? 'Giao chủ trì' : 'Xoá',
          loading: transfer.isPending || remove.isPending,
          onPress: runConfirm,
        }}
        secondaryAction={{ label: 'Thôi', onPress: () => setConfirm(null) }}
        title={isTransfer ? 'Chuyển quyền chủ trì?' : 'Xoá khỏi cuộc họp?'}
        variant="warning"
        visible={confirm !== null}
        onClose={() => setConfirm(null)}
      />
    </Section>
  );
}
