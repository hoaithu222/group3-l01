import { Card } from '@/shared/ui/card';
import { Section } from '@/shared/ui/section';

import type { WorkspaceDetail } from '../api';
import { WorkspaceActionRow, type WorkspaceActionRowProps } from './WorkspaceActionRow';

export interface WorkspaceDangerZoneCardProps {
  workspace: WorkspaceDetail;
  restoreLoading: boolean;
  onTransfer: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onLeave: () => void;
}

/**
 * Thẻ "Vùng nguy hiểm" trong `WorkspaceSettingsScreen` — tách riêng để giữ màn dưới trần 200 dòng.
 *
 * Mỗi việc là MỘT hàng (chữ + icon đỏ cho việc phá huỷ) trong một khung, không phải bốn nút viền đầy bề ngang xếp dọc: cụm nút
 * đỏ ở cuối màn cài đặt quá nổi so với việc ai cũng hiếm khi làm, và dễ bấm nhầm khi cuộn. Việc nào cũng còn một bước xác nhận
 * (sheet/hộp thoại) trước khi thực hiện. Thiếu quyền thì hàng ẩn hẳn; không hàng nào thì không vẽ cả thẻ.
 */
export function WorkspaceDangerZoneCard({
  workspace,
  restoreLoading,
  onTransfer,
  onArchive,
  onRestore,
  onLeave,
}: WorkspaceDangerZoneCardProps) {
  const { myPermissions } = workspace;
  const canRestore =
    myPermissions.canArchive && workspace.status === 'ARCHIVED' && workspace.archivedReason !== 'PLATFORM';

  const rows: (WorkspaceActionRowProps & { key: string })[] = [];
  if (myPermissions.canTransfer) {
    rows.push({
      description: 'Chọn người khác làm chủ nhóm',
      icon: 'user-setting-2',
      key: 'transfer',
      label: 'Chuyển quyền sở hữu',
      onPress: onTransfer,
      // `warning` chứ không `danger`: việc hệ trọng (mất quyền chủ nhóm) nhưng không phá huỷ dữ liệu.
      tileTone: 'warning',
    });
  }
  if (myPermissions.canArchive && workspace.status === 'ACTIVE') {
    rows.push({
      description: 'Nhóm chuyển sang chỉ đọc, có thể khôi phục sau',
      icon: 'lock',
      key: 'archive',
      label: 'Lưu trữ nhóm',
      onPress: onArchive,
      tone: 'danger',
    });
  }
  if (canRestore) {
    rows.push({
      description: restoreLoading ? 'Đang khôi phục…' : 'Cho phép gửi tin và mời thành viên trở lại',
      disabled: restoreLoading,
      icon: 'reload',
      key: 'restore',
      label: 'Khôi phục nhóm',
      onPress: onRestore,
      tileTone: 'success',
    });
  }
  if (myPermissions.canLeave) {
    rows.push({
      description: 'Bạn sẽ không còn thấy nội dung của nhóm',
      icon: 'logout',
      key: 'leave',
      label: 'Rời nhóm',
      onPress: onLeave,
      tone: 'danger',
    });
  }

  if (rows.length === 0) return null;

  return (
    // ✅ "Vùng nguy hiểm" (GitHub/Slack "Danger zone"): viền đỏ NHẠT (`-subtle`, bậc dành cho viền khối cảnh báo) bao cả khung —
    // tách hẳn khỏi các khối cài đặt thường phía trên mà không biến từng hàng thành nút đỏ. Tiêu đề giữ tông chung của mọi `Section`
    // trên màn; chữ + icon của từng hàng vẫn nói nghĩa (màu không phải dấu hiệu duy nhất).
    <Section icon="alert-warning" title="Vùng nguy hiểm">
      <Card className="border-hairline border-border-error-subtle py-2xs">
        {rows.map(({ key, ...row }, index) => (
          <WorkspaceActionRow key={key} {...row} divider={index < rows.length - 1} />
        ))}
      </Card>
    </Section>
  );
}
