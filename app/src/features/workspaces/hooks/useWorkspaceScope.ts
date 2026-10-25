import { router } from 'expo-router';
import { useEffect } from 'react';

import { PATHS } from '@/shell/config';

import type { WorkspaceDetail, WorkspaceMyPermissions, WorkspaceRole, WorkspaceStatus } from '../api';
import { useWorkspace } from '../queries/workspaces.queries';
import { isWorkspaceGone } from '../utils/workspace-errors';

export interface WorkspaceScope {
  wsId: string;
  workspace: WorkspaceDetail | undefined;
  myRole: WorkspaceRole | undefined;
  myPermissions: WorkspaceMyPermissions | undefined;
  status: WorkspaceStatus | undefined;
  /** Nhóm đã lưu trữ ⇒ ghi bị chặn ngay (`WS_002`) — màn con khoá nút ghi/composer theo cờ này. */
  isArchived: boolean;
  isLoading: boolean;
  error: unknown;
}

export interface UseWorkspaceScopeOptions {
  /**
   * Nhóm không còn truy cập được (404/403) ⇒ về `/workspaces`. Chỉ bật ở MỘT chỗ
   * (`[wsId]/_layout.tsx`) — màn con cũng gọi hook này, bật ở đó là mỗi màn tự
   * điều hướng một lần. Toast thì interceptor đã hiện đúng một lần cho lỗi đó
   * (`client.ts`), không toast thêm ở đây.
   */
  redirectWhenGone?: boolean;
}

/**
 * Phạm vi MỘT workspace (app.md p1-01 §2 "context wsId + myRole + myPermissions").
 *
 * Không dùng React context: dữ liệu đã nằm ở cache React Query (`workspaceKeys.detail`),
 * `useWorkspaceSocket` cập nhật nó theo `workspace:*`/`member:updated`, nên mọi
 * màn gọi hook này thấy CÙNG một bản mà không cần Provider bọc ngoài — và các
 * feature khác (`channels`) đọc được cùng khoá đó mà không import feature này.
 */
export function useWorkspaceScope(wsId: string | undefined, options: UseWorkspaceScopeOptions = {}): WorkspaceScope {
  const { data, error, isLoading } = useWorkspace(wsId);
  const gone = isWorkspaceGone(error);

  useEffect(() => {
    if (options.redirectWhenGone && gone) router.replace(PATHS.WORKSPACES);
  }, [gone, options.redirectWhenGone]);

  return {
    wsId: wsId ?? '',
    workspace: data,
    myRole: data?.myRole,
    myPermissions: data?.myPermissions,
    status: data?.status,
    isArchived: data?.status === 'ARCHIVED',
    isLoading,
    error,
  };
}
