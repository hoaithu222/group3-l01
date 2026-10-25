import { useState } from 'react';

import { useDisclosure } from '@/shared/hooks';
import { Button, ConfirmWithReasonModal } from '@/shared/ui';

import { WORKSPACE_IMAGE_LABEL } from '../constants/workspace.constants';
import { useRemoveWorkspaceImage } from '../service/workspace.queries';
import type { AdminWorkspaceRow, WorkspaceImageKind } from '../types/workspace.types';

export interface WorkspaceImageActionsProps {
  workspace: Pick<AdminWorkspaceRow, 'id' | 'name' | 'avatarUrl' | 'coverUrl'>;
}

/** Hậu quả nói trong hộp thoại — BE báo chủ nhóm; ảnh bị gỡ không khôi phục được (chủ nhóm tải ảnh mới). */
const IMPACT: Readonly<Record<WorkspaceImageKind, string>> = {
  AVATAR:
    'Nhóm hiện lại chữ cái đầu tên thay cho ảnh; chủ nhóm được thông báo. Không hoàn tác được — chủ nhóm phải tải ảnh mới.',
  COVER:
    'Bìa nhóm quay về nền màu mặc định; chủ nhóm được thông báo. Không hoàn tác được — chủ nhóm phải tải ảnh mới.',
};

/**
 * Nút gỡ ảnh đại diện / ảnh bìa VI PHẠM (chỉ hiện khi nhóm đang có ảnh loại đó) + hộp thoại lý do. Nơi dùng tự gác quyền
 * `workspace:update`. BE ghi audit `workspace.image-remove`, báo chủ nhóm; nhóm đã lưu trữ vẫn gỡ được.
 *
 * MỘT hộp thoại cho cả hai loại: `kind` giữ nguyên khi đóng nên tiêu đề không nháy rỗng trong lúc hộp thoại khép lại.
 */
export default function WorkspaceImageActions({ workspace }: WorkspaceImageActionsProps) {
  const modal = useDisclosure();
  const [kind, setKind] = useState<WorkspaceImageKind>('AVATAR');
  const removeImage = useRemoveWorkspaceImage(workspace.id);

  const present: Record<WorkspaceImageKind, boolean> = {
    AVATAR: !!workspace.avatarUrl,
    COVER: !!workspace.coverUrl,
  };
  const actionLabel = (k: WorkspaceImageKind) => `Gỡ ${WORKSPACE_IMAGE_LABEL[k]}`;
  const openFor = (k: WorkspaceImageKind) => {
    setKind(k);
    modal.open();
  };

  return (
    <>
      {(['AVATAR', 'COVER'] as const)
        .filter((k) => present[k])
        .map((k) => (
          <Button key={k} size="sm" skin="danger" variant="stroke" onClick={() => openFor(k)}>
            {actionLabel(k)}
          </Button>
        ))}
      {/* Luôn mount (đóng): gỡ xong nhóm hết ảnh, nút biến mất nhưng hộp thoại vẫn khép lại bình thường. */}
      <ConfirmWithReasonModal
        confirmLabel={actionLabel(kind)}
        confirmTone="danger"
        impact={IMPACT[kind]}
        open={modal.isOpen}
        title={`${actionLabel(kind)} — ${workspace.name}`}
        onConfirm={async (reason) => {
          await removeImage.mutateAsync({ kind, reason });
        }}
        onOpenChange={(next) => !next && modal.close()}
      />
    </>
  );
}
