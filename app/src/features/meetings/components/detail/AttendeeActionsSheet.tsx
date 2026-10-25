import { BottomSheet, SheetList } from '@/shared/ui/bottom-sheet';
import { IconTile } from '@/shared/ui/icon-tile';
import { ListItem } from '@/shared/ui/list';

import type { MeetingAttendeeDto } from '../../api/meetings.types';
import type { AttendeeActions } from '../../utils/attendee-actions';

export interface AttendeeActionsSheetProps {
  actions: AttendeeActions;
  attendee: MeetingAttendeeDto | null;
  onClose: () => void;
  onRemove: () => void;
  onSetCoHost: (grant: boolean) => void;
  onTransfer: () => void;
}

/**
 * Menu thao tác trên MỘT người tham dự (app.md p2-04 §3 `AttendeeList`): cấp/thu đồng chủ trì, giao chủ trì, xoá khỏi cuộc họp. Chỉ
 * hiện mục người xem được phép (`attendeeActions`, do server + vai trò quyết). Chọn một mục thì đóng menu; bước xác nhận (giao chủ
 * trì/xoá — nêu tên) do nơi gọi mở, đổi vai đồng chủ trì thì làm ngay (hoàn tác được bằng chính menu này).
 */
export function AttendeeActionsSheet({
  actions,
  attendee,
  onClose,
  onRemove,
  onSetCoHost,
  onTransfer,
}: AttendeeActionsSheetProps) {
  const pick = (run: () => void) => () => {
    onClose();
    run();
  };
  return (
    <BottomSheet
      padded={false}
      title={attendee?.name || 'Người tham dự'}
      visible={attendee !== null}
      onClose={onClose}
    >
      {/* `SheetList`: tấm `padded={false}` + `ListItem` trần ⇒ icon dính sát mép tấm (`ListItem` không tự có lề). */}
      <SheetList accessibilityRole="menu" className="pb-md">
        {/* Ô icon có tông (khuôn `MeNavRow`): mỗi việc một tông, việc phá huỷ (xoá) tông đỏ và đứng CUỐI. */}
        {actions.coHost ? (
          <ListItem
            divider={Boolean(actions.transfer || actions.remove)}
            emphasis="title"
            label={actions.coHost === 'grant' ? 'Đặt làm đồng chủ trì' : 'Bỏ vai đồng chủ trì'}
            leading={<IconTile name="user-setting-1" size="sm" tone="brand" />}
            onPress={pick(() => onSetCoHost(actions.coHost === 'grant'))}
          />
        ) : null}
        {actions.transfer ? (
          <ListItem
            divider={actions.remove}
            emphasis="title"
            label="Giao quyền chủ trì"
            leading={<IconTile name="arrow-data-transfer-vertical" size="sm" tone="info" />}
            onPress={pick(onTransfer)}
          />
        ) : null}
        {actions.remove ? (
          <ListItem
            emphasis="danger"
            label="Xoá khỏi cuộc họp"
            leading={<IconTile name="delete" size="sm" tone="danger" />}
            onPress={pick(onRemove)}
          />
        ) : null}
      </SheetList>
    </BottomSheet>
  );
}
