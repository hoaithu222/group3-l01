import {
  channelModeFromChoice,
  choiceFromChannelMode,
  NotifyModeSheet,
  type NotifyChoice,
} from '@/shared/notifications';
import { Dialog } from '@/shared/ui/modal';
import type { SelectOption } from '@/shared/ui/select';

import type { NotifyMode } from '../api';
import { ArchiveChannelSheet } from './ArchiveChannelSheet';

export interface ChannelInfoSheetsProps {
  archiveLoading: boolean;
  archiveSheetOpen: boolean;
  isDefault: boolean;
  leaveDialogOpen: boolean;
  leaveLoading: boolean;
  /** Giá trị mà "Theo mặc định" sẽ kế thừa thực tế (nhóm làm việc → tài khoản) — `undefined` khi chưa biết. */
  notifyInherited?: Exclude<NotifyChoice, 'INHERIT'>;
  notifyMode: NotifyMode;
  notifySheetOpen: boolean;
  onArchiveClose: () => void;
  onArchiveConfirm: (replacementDefaultChannelId?: string) => void;
  onLeaveClose: () => void;
  onLeaveConfirm: () => void;
  onNotifyChange: (mode: NotifyMode) => void;
  onNotifyClose: () => void;
  replacementOptions: SelectOption[];
}

/** Các lớp phủ của `ChannelInfoScreen` (thông báo · lưu trữ · rời kênh) — tách riêng để giữ màn dưới trần 200 dòng. */
export function ChannelInfoSheets({
  archiveLoading,
  archiveSheetOpen,
  isDefault,
  leaveDialogOpen,
  leaveLoading,
  notifyInherited,
  notifyMode,
  notifySheetOpen,
  onArchiveClose,
  onArchiveConfirm,
  onLeaveClose,
  onLeaveConfirm,
  onNotifyChange,
  onNotifyClose,
  replacementOptions,
}: ChannelInfoSheetsProps) {
  return (
    <>
      {/* Kênh không có thời lượng tắt tiếng (`PATCH /channels/:id/me` chỉ nhận `notifyMode`) nên KHÔNG `supportsDuration`. */}
      <NotifyModeSheet
        current={choiceFromChannelMode(notifyMode)}
        inherited={notifyInherited}
        title="Thông báo"
        visible={notifySheetOpen}
        onClose={onNotifyClose}
        onSelect={(choice) => onNotifyChange(channelModeFromChoice(choice))}
      />

      <ArchiveChannelSheet
        isDefault={isDefault}
        loading={archiveLoading}
        replacementOptions={replacementOptions}
        visible={archiveSheetOpen}
        onArchive={onArchiveConfirm}
        onClose={onArchiveClose}
      />

      <Dialog
        description="Bạn sẽ không còn thấy nội dung của kênh này nữa."
        primaryAction={{ label: 'Rời kênh', loading: leaveLoading, onPress: onLeaveConfirm }}
        secondaryAction={{ label: 'Huỷ', onPress: onLeaveClose }}
        title="Rời kênh này?"
        variant="warning"
        visible={leaveDialogOpen}
        onClose={onLeaveClose}
      />
    </>
  );
}
