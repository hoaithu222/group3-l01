import { cancelUploadsByScope } from '@/core/uploads/upload.runner';
import { useUploadStore } from '@/core/uploads/upload.store';

import { clearResourceCache } from '../utils/resource-files';
import { useResourceUploadStore } from './resource-uploads.store';

function removeResourceUploads(matches: (scopeKey: string | undefined) => boolean): void {
  const uploads = useUploadStore.getState();
  Object.values(uploads.items)
    .filter((item) => item.scope === 'RESOURCE' && matches(item.scopeKey))
    .forEach((item) => uploads.removeItem(item.localId));
}

/**
 * Mất quyền workspace (`permission:revoked`, app.md §5): huỷ tải lên, gỡ hàng
 * đợi và đích của workspace đó. ⚠️ Không gọi `POST /assets/:id/abort` — quyền đã
 * mất nên sẽ 404; asset mồ côi để job `assets.cleanup` của BE dọn.
 */
export function dropWorkspaceUploads(workspaceId: string): void {
  cancelUploadsByScope('RESOURCE', workspaceId);
  removeResourceUploads((scopeKey) => scopeKey === workspaceId);
  useResourceUploadStore.getState().clearWorkspace(workspaceId);
}

/**
 * Đăng xuất/đổi tài khoản (app.md §5): dọn hàng đợi tải lên Resource Hub + tệp
 * tạm PDF/text. Cùng mẫu `resetChatStores()` — `shell/session/useLogout.ts` gọi
 * (điều phối viên nối). Cache React Query đã do `queryClient.clear()` ở đó lo.
 */
export function resetResourceStores(): void {
  cancelUploadsByScope('RESOURCE');
  removeResourceUploads(() => true);
  useResourceUploadStore.getState().reset();
  void clearResourceCache();
}
