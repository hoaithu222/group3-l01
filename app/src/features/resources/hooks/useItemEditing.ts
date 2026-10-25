import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';

import { RESOURCE_ERROR } from '../constants/resource-error-codes.constants';
import type { ResourceLimits } from '../constants/resource-limits.constants';
import { useUpdateFolder } from '../queries/folder.queries';
import { invalidateWorkspaceResources } from '../queries/resource-cache';
import { useUpdateResource } from '../queries/resources.queries';
import { extractErrorCode, resourceErrorMessage } from '../utils/error-messages';
import type { ExplorerItem } from '../utils/explorer-items';
import type { MoveTarget } from '../components/MoveToFolderSheet';
import type { RenameTarget } from '../components/RenameSheet';

type Mode = 'move' | 'rename';

/**
 * Đổi tên / di chuyển MỘT tệp hoặc thư mục, kèm `expectedVersion` (app.md p3-01 §4).
 *
 * Giữ KHOÁ của mục đang sửa (không giữ cả object) rồi tra lại trong `items` mỗi
 * lần vẽ: khi `RES_003` (đã bị sửa chỗ khác) ta làm mới danh sách và `version`
 * mới tự tới lần thử kế tiếp, MÀ VẪN GIỮ tấm đang mở (không văng người dùng ra).
 * Mục biến mất khỏi danh sách (bị xoá chỗ khác) ⇒ tấm tự đóng.
 */
export function useItemEditing(
  wsId: string,
  items: readonly ExplorerItem[],
  limits: ResourceLimits,
) {
  const queryClient = useQueryClient();
  const updateFolder = useUpdateFolder(wsId);
  const updateResource = useUpdateResource(wsId);
  const [editing, setEditing] = useState<{ key: string; mode: Mode } | null>(null);
  const [error, setError] = useState<string | undefined>();

  const item = useMemo(
    () => items.find((candidate) => candidate.key === editing?.key) ?? null,
    [editing, items],
  );
  const pending = updateFolder.isPending || updateResource.isPending;

  const start = useCallback((key: string, mode: Mode) => {
    setError(undefined);
    setEditing({ key, mode });
  }, []);
  const close = useCallback(() => setEditing(null), []);

  const submit = useCallback(
    async (change: { folderId?: string | null; name?: string; parentId?: string | null }) => {
      if (!item) return;
      try {
        if (item.kind === 'folder') {
          const { name, parentId } = change;
          await updateFolder.mutateAsync({
            folderId: item.folder.id,
            payload: {
              expectedVersion: item.folder.version,
              ...(name !== undefined && { name }),
              ...(parentId !== undefined && { parentId }),
            },
          });
        } else {
          const { folderId, name } = change;
          await updateResource.mutateAsync({
            resourceId: item.resource.id,
            payload: {
              expectedVersion: item.resource.version,
              ...(name !== undefined && { name }),
              ...(folderId !== undefined && { folderId }),
            },
          });
        }
        setEditing(null);
      } catch (caught) {
        setError(resourceErrorMessage(caught));
        if (extractErrorCode(caught) === RESOURCE_ERROR.VERSION_CONFLICT)
          invalidateWorkspaceResources(queryClient, wsId);
      }
    },
    [item, queryClient, updateFolder, updateResource, wsId],
  );

  const renameTarget: RenameTarget | null =
    item && editing?.mode === 'rename'
      ? { kind: item.kind, name: item.kind === 'folder' ? item.folder.name : item.resource.name }
      : null;

  const moveTarget: MoveTarget | null =
    item && editing?.mode === 'move'
      ? item.kind === 'folder'
        ? {
            currentParentId: item.folder.parentId,
            id: item.folder.id,
            kind: 'folder',
            name: item.folder.name,
          }
        : {
            currentParentId: item.resource.folderId,
            id: item.resource.id,
            kind: 'resource',
            name: item.resource.name,
          }
      : null;

  return {
    close,
    error,
    maxNameLength: item?.kind === 'folder' ? limits.folderNameMax : limits.resourceNameMax,
    moveTarget,
    pending,
    renameTarget,
    start,
    submitMove: (destinationId: string | null) =>
      submit(item?.kind === 'folder' ? { parentId: destinationId } : { folderId: destinationId }),
    submitRename: (name: string) => submit({ name }),
  };
}
