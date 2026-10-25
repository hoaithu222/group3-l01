import { useQueryClient } from '@tanstack/react-query';

import { SocketEvent, useSocketEvent, type PermissionRevokedPayload } from '@/core/socket';

import type { ResourceChangedPayload } from '../api';
import { invalidateWorkspaceResources } from '../queries/resource-cache';
import { resourceKeys } from '../queries/resources.keys';
import { dropWorkspaceUploads } from '../store/reset-resource-stores';

/**
 * Vòng đời của Resource Hub theo workspace, mount ở `resources/_layout.tsx`:
 *  · `resource:changed` (P1, BE `ws:{id}`): người khác (hoặc máy khác của mình) đổi kho ⇒ làm cũ
 *    danh sách/thư mục/thùng rác/hạn mức của workspace — CHỈ truy vấn đang mở mới refetch. Payload
 *    KHÔNG có tên tệp nên không vá cache tại chỗ, chỉ invalidate (BE "emit lặp vô hại").
 *  · Mất quyền workspace đang mở (`permission:revoked`, app.md p3-01 §5): xoá cache
 *    `['resources', *, wsId]`, huỷ hàng đợi tải lên của workspace đó.
 *
 * ⚠️ Việc RỜI màn do `useWorkspaceSocket` (`[wsId]/_layout.tsx`) đảm nhận —
 * `router.replace('/workspaces')` — nên KHÔNG điều hướng lần nữa ở đây.
 * Cũng vì khoá query KHÔNG theo khuôn `matchesScope()`, xử lý chung của
 * `core/permission` không dọn được cache này: phải dọn tại chỗ. Chi tiết tệp
 * (`detail`/`url`/`text`) khoá theo `resourceId` nên khớp qua `data.workspaceId`.
 */
export function useResourcesScope(wsId: string): void {
  const queryClient = useQueryClient();

  useSocketEvent<ResourceChangedPayload>(SocketEvent.RESOURCE_CHANGED, (payload) => {
    if (payload.workspaceId !== wsId) return;
    invalidateWorkspaceResources(queryClient, wsId);
    // Chi tiết/URL/text khoá theo `resourceId` (không có `wsId` ở vị trí 3) nên làm cũ riêng.
    if (payload.kind === 'RESOURCE' && payload.subjectId) {
      void queryClient.invalidateQueries({ queryKey: resourceKeys.detail(payload.subjectId) });
    }
  });

  useSocketEvent<PermissionRevokedPayload>(SocketEvent.PERMISSION_REVOKED, (payload) => {
    if (payload.scopeType !== 'WORKSPACE' || payload.scopeId !== wsId) return;
    queryClient.removeQueries({
      predicate: (query) =>
        query.queryKey[0] === 'resources' &&
        (query.queryKey[2] === wsId ||
          (query.state.data as { workspaceId?: string } | undefined)?.workspaceId === wsId),
    });
    dropWorkspaceUploads(wsId);
  });
}
