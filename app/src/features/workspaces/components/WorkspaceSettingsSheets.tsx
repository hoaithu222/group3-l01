import { ConfirmSheet } from '@/shared/ui/bottom-sheet';
import { SelectSheet, type SelectOption } from '@/shared/ui/select';

import type { NotifyMode } from '../api';
import type { UseTransferCandidatesResult } from '../hooks/useTransferCandidates';
import { ArchiveConfirmSheet } from './ArchiveConfirmSheet';
import { TransferOwnerSheet } from './TransferOwnerSheet';

export interface WorkspaceSettingsSheetsProps {
  notifyOptions: SelectOption[];
  notifyMode: NotifyMode;
  notifySheetOpen: boolean;
  onNotifyChange: (mode: NotifyMode) => void;
  onNotifyClose: () => void;

  archiveSheetOpen: boolean;
  archiveLoading: boolean;
  onArchiveClose: () => void;
  onArchiveConfirm: () => void;

  transferSheetOpen: boolean;
  transferLoading: boolean;
  /** Danh sách người nhận quyền (từ `useTransferCandidates` của màn cha) — sheet không tự gọi API. */
  transferCandidates: UseTransferCandidatesResult;
  onTransferClose: () => void;
  onTransferConfirm: (input: { toUserId: string; confirmName: string }) => void;

  leaveDialogOpen: boolean;
  leaveLoading: boolean;
  onLeaveClose: () => void;
  onLeaveConfirm: () => void;
}

/** Bốn lớp phủ (sheet/dialog) của `WorkspaceSettingsScreen` — tách riêng để giữ màn dưới trần 200 dòng. */
export function WorkspaceSettingsSheets({
  notifyOptions,
  notifyMode,
  notifySheetOpen,
  onNotifyChange,
  onNotifyClose,
  archiveSheetOpen,
  archiveLoading,
  onArchiveClose,
  onArchiveConfirm,
  transferSheetOpen,
  transferLoading,
  transferCandidates,
  onTransferClose,
  onTransferConfirm,
  leaveDialogOpen,
  leaveLoading,
  onLeaveClose,
  onLeaveConfirm,
}: WorkspaceSettingsSheetsProps) {
  return (
    <>
      <SelectSheet
        options={notifyOptions}
        title="Thông báo"
        value={notifyMode}
        visible={notifySheetOpen}
        onChange={(value) => onNotifyChange(value as NotifyMode)}
        onClose={onNotifyClose}
      />

      <ArchiveConfirmSheet loading={archiveLoading} visible={archiveSheetOpen} onClose={onArchiveClose} onConfirm={onArchiveConfirm} />

      <TransferOwnerSheet
        loading={transferLoading}
        members={transferCandidates.members}
        membersError={transferCandidates.isError}
        membersLoading={transferCandidates.isLoading}
        visible={transferSheetOpen}
        onClose={onTransferClose}
        onConfirm={onTransferConfirm}
        onRetry={transferCandidates.refetch}
        onSearchChange={transferCandidates.setQuery}
      />

      {/* ✅ `ConfirmSheet` tông `danger` thay `Dialog` cảnh báo: cùng khuôn với "Lưu trữ nhóm" ngay cạnh (ô icon + câu hỏi + [Huỷ | Rời
          nhóm] đỏ), và đang gửi thì "Huỷ" + nền mờ khoá — `Dialog` cũ để "Huỷ" bấm được giữa lúc yêu cầu rời nhóm đang bay. */}
      <ConfirmSheet
        confirmLabel="Rời nhóm"
        description="Bạn sẽ không còn thấy nội dung của nhóm này nữa."
        icon="logout"
        loading={leaveLoading}
        title="Rời nhóm này?"
        tone="danger"
        visible={leaveDialogOpen}
        onClose={onLeaveClose}
        onConfirm={onLeaveConfirm}
      />
    </>
  );
}
