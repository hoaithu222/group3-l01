import { router, useLocalSearchParams } from 'expo-router';

import { useCapabilities } from '@/shell/capabilities';
import { Alert } from '@/shared/ui/alert';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { Skeleton } from '@/shared/ui/skeleton';

import { AccessSettingsForm } from '../components/AccessSettingsForm';
import { WorkspaceLoadError } from '../components/WorkspaceLoadError';
import { useWorkspace } from '../queries/workspaces.queries';
import { readGuestLimits } from '../utils/guest-limits';

/**
 * "Quyền truy cập" — `joinPolicy` + `guestPolicy` (app.md p3-04 §3). Chỉ CHỦ NHÓM
 * (`myRole` BE trả; ADMIN không đặt được — be.md README §6); người khác vào thẳng
 * đường dẫn chỉ thấy thông báo, còn BE vẫn là hàng rào thật (`PATCH …/settings` → 403).
 */
export function WorkspaceAccessSettingsScreen() {
  const { wsId } = useLocalSearchParams<{ wsId: string }>();
  const { data: workspace, error, isError, isLoading, refetch } = useWorkspace(wsId);
  const { data: capabilities } = useCapabilities();

  const header = <AppBar title="Quyền truy cập" onBack={router.back} />;

  if (isLoading) {
    return (
      <Screen header={header}>
        <Skeleton className="mt-xs h-40 rounded-md" />
      </Screen>
    );
  }

  if (isError || !workspace) {
    return (
      <Screen header={header}>
        <WorkspaceLoadError error={error} onRetry={() => void refetch()} />
      </Screen>
    );
  }

  return (
    <Screen header={header}>
      {workspace.myRole === 'OWNER' ? (
        // `key`: BE trả version mới (lưu xong / tải lại sau 409) → dựng lại form từ giá trị mới nhất.
        <AccessSettingsForm
          key={`${workspace.id}:${workspace.version}`}
          limits={readGuestLimits(capabilities?.limits)}
          workspace={workspace}
        />
      ) : (
        <Alert
          className="mt-xs"
          description="Chỉ chủ nhóm mới đổi được cách người khác vào nhóm và việc mời khách."
          title="Bạn không đổi được thiết lập này"
          tone="warning"
        />
      )}
    </Screen>
  );
}
