import { Text, View } from 'react-native';

import { EmptyState } from '@/shared/ui/empty-state';
import { Skeleton } from '@/shared/ui/skeleton';
import { Toggle } from '@/shared/ui/toggle';
import { hapticSelection } from '@/shared/utils/haptics';
import { showToast } from '@/shared/utils/toast.utils';

import { useShareWorkspace, useUnshareWorkspace } from '../queries/wellbeing-share.mutations';
import { useMyWorkspacesForSharing, useWellbeingShares } from '../queries/wellbeing.queries';
import { isNotEnabled, isNotMember, wellbeingErrorMessage } from '../utils/wellbeing-errors';

export interface ShareWithWorkspaceListProps {
  disabled?: boolean;
}

/**
 * Chia sẻ mức rủi ro với trưởng nhóm (P1, app.md §3 "Cài đặt" · be.md §2/§4/§5) — MỘT công tắc mỗi nhóm mình đang là thành viên. Không lạc
 * quan: đợi BE đồng ý rồi mới đổi công tắc (`useShareWorkspace`/`useUnshareWorkspace` không optimistic) — cần biết CHẮC trưởng nhóm đã
 * được cấp quyền xem trước khi hiện "Đã chia sẻ".
 *
 * `WELL_001` (đã tắt theo dõi ở máy khác) và `WELL_002` (rời nhóm giữa chừng) đều là ca BÌNH THƯỜNG, không phải lỗi kỹ thuật — toast câu
 * riêng thay vì câu lỗi chung.
 */
export function ShareWithWorkspaceList({ disabled = false }: ShareWithWorkspaceListProps) {
  const workspaces = useMyWorkspacesForSharing(true);
  const shares = useWellbeingShares(true);
  const share = useShareWorkspace();
  const unshare = useUnshareWorkspace();

  const sharedIds = new Set((shares.data ?? []).map((s) => s.workspaceId));
  const pending = share.isPending || unshare.isPending;

  const toggle = async (workspaceId: string, value: boolean): Promise<void> => {
    try {
      if (value) await share.mutateAsync(workspaceId);
      else await unshare.mutateAsync(workspaceId);
    } catch (error) {
      if (isNotEnabled(error)) {
        showToast('info', 'Theo dõi đã được tắt ở thiết bị khác');
        return;
      }
      if (isNotMember(error)) {
        showToast('error', 'Bạn không còn là thành viên của nhóm này');
        return;
      }
      showToast('error', wellbeingErrorMessage(error));
    }
  };

  if (workspaces.isLoading) {
    return (
      <View className="gap-sm">
        <Skeleton className="h-10 w-full rounded-md" />
        <Skeleton className="h-10 w-full rounded-md" />
      </View>
    );
  }

  if (!workspaces.data || workspaces.data.length === 0) {
    // `compact` vì nằm trong thẻ; icon + tông của phân hệ Nhóm (`add-team` · `info`) như ở Trang chủ.
    return (
      <EmptyState
        description="Bạn chưa tham gia nhóm nào để chia sẻ."
        icon="add-team"
        size="compact"
        tone="info"
      />
    );
  }

  return (
    <View className="gap-md">
      <Text className="text-body-md text-fg-2">
        Trưởng nhóm chỉ thấy mức Thấp/Trung bình/Cao — không thấy số phút hay điểm số của bạn.
      </Text>
      <View className="gap-sm">
        {workspaces.data.map((ws) => (
          <Toggle
            key={ws.id}
            disabled={disabled || pending}
            label={ws.name}
            value={sharedIds.has(ws.id)}
            onChange={(value) => {
              hapticSelection();
              void toggle(ws.id, value);
            }}
          />
        ))}
      </View>
    </View>
  );
}
