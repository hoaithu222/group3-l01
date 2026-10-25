import { router } from 'expo-router';
import { useMemo } from 'react';

import { ROOT_FOLDER, type FolderRef } from '../api';
import { resourcesRootHref } from '../utils/resource-routes';

/**
 * Điều hướng trong Resource Hub — MỘT chỗ giữ tên route (app.md p3-01 §1) để
 * đổi đường dẫn không phải sửa rải rác.
 *
 * `goToFolder` (breadcrumb/"Mở thư mục chứa tệp") dùng `dismissTo`: về cấp TRÊN
 * thì lùi ngăn xếp tới đúng màn đó thay vì đẩy thêm một màn — nếu không, bấm
 * breadcrumb 3 lần là nút Back phải bấm 3 lần mới thoát. `openFolder` (đi sâu
 * vào) dùng `push`.
 */
export function useResourceNavigation(wsId: string) {
  return useMemo(
    () => ({
      openFolder: (folderId: string) =>
        router.push({
          pathname: '/workspaces/[wsId]/resources/[folderId]',
          params: { wsId, folderId },
        }),
      goToFolder: (folderId: FolderRef) =>
        folderId === ROOT_FOLDER
          ? router.dismissTo(resourcesRootHref(wsId))
          : router.dismissTo({
              pathname: '/workspaces/[wsId]/resources/[folderId]',
              params: { wsId, folderId },
            }),
      openPreview: (resourceId: string) =>
        router.push({
          pathname: '/workspaces/[wsId]/resources/preview/[resourceId]',
          params: { wsId, resourceId },
        }),
      openTrash: () =>
        router.push({ pathname: '/workspaces/[wsId]/resources/trash', params: { wsId } }),
      back: () => router.back(),
      toWorkspace: () => router.replace({ pathname: '/workspaces/[wsId]', params: { wsId } }),
    }),
    [wsId],
  );
}
