import { useServerSyncedState } from '@/shared/hooks/useServerSyncedState';

import type { NotifyMode, WorkspaceDetail } from '../api';
import { useWorkspaceMe } from '../queries/workspaces.queries';

/**
 * "Yêu thích" + chế độ thông báo CỦA MÌNH ở màn Cài đặt nhóm — đổi LẠC QUAN, lỗi thì trả về giá trị server.
 *
 * ⚠️ Không `useState(workspace.isFavorite)` trần: giá trị đầu chỉ đọc một lần lúc mở màn — đổi ở máy khác/tải lại nền
 * thì công tắc vẫn hiện giá trị cũ, và mutation lỗi thì công tắc nằm luôn ở giá trị chưa lưu được.
 */
export function useWorkspacePersonalPrefs(wsId: string, workspace: WorkspaceDetail) {
  const updateMe = useWorkspaceMe(wsId);
  const [isFavorite, setIsFavorite] = useServerSyncedState(workspace.isFavorite);
  const [notifyMode, setNotifyMode] = useServerSyncedState<NotifyMode>(workspace.notifyMode);

  const changeFavorite = (value: boolean) => {
    setIsFavorite(value);
    updateMe.mutate({ isFavorite: value }, { onError: () => setIsFavorite(workspace.isFavorite) });
  };

  const changeNotifyMode = (mode: NotifyMode) => {
    setNotifyMode(mode);
    updateMe.mutate({ notifyMode: mode }, { onError: () => setNotifyMode(workspace.notifyMode) });
  };

  return { changeFavorite, changeNotifyMode, isFavorite, notifyMode };
}
