import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';

import { useToastStore } from '@/shared/ui/feedback/toast-store';
import { showToast } from '@/shared/utils/toast.utils';

import { foldersService } from '../api';
import { useDeleteFolder } from '../queries/folder.queries';
import { invalidateWorkspaceResources } from '../queries/resource-cache';
import { useDeleteResource } from '../queries/resources.queries';
import { canModifyItem, type ExplorerItem } from '../utils/explorer-items';
import { buildItemActions, type ItemActionKey } from '../utils/item-actions';
import { runFileAction } from '../utils/run-file-action';
import { useResourceNavigation } from './useResourceNavigation';

/**
 * Menu "⋯" + mở + xoá + tải/chia sẻ của FileExplorer. Đổi tên/di chuyển do
 * `useItemEditing` lo (gọi `onEdit`). Giữ KHOÁ mục đang thao tác và tra lại trong
 * `items` mỗi lần vẽ — cùng lý do `useItemEditing`.
 */
export function useExplorerActions(input: {
  inSearch: boolean;
  items: readonly ExplorerItem[];
  online: boolean;
  onEdit: (key: string, mode: 'move' | 'rename') => void;
  wsId: string;
}) {
  const { inSearch, items, online, onEdit, wsId } = input;
  const nav = useResourceNavigation(wsId);
  const queryClient = useQueryClient();
  const deleteFolder = useDeleteFolder(wsId);
  const deleteResource = useDeleteResource(wsId);
  const [menuKey, setMenuKey] = useState<string | null>(null);
  const [deleteKey, setDeleteKey] = useState<string | null>(null);

  const find = useCallback(
    (key: string | null) => items.find((item) => item.key === key) ?? null,
    [items],
  );
  const menuItem = find(menuKey);
  const deleteItem = find(deleteKey);

  const menuActions = useMemo(
    () =>
      menuItem
        ? buildItemActions(menuItem, { canModify: canModifyItem(menuItem), inSearch, online })
        : [],
    [inSearch, menuItem, online],
  );

  const open = useCallback(
    (item: ExplorerItem) =>
      item.kind === 'folder' ? nav.openFolder(item.folder.id) : nav.openPreview(item.resource.id),
    [nav],
  );

  const select = useCallback(
    (key: ItemActionKey, item: ExplorerItem) => {
      if (key === 'open') open(item);
      else if (key === 'locate' && item.kind === 'resource')
        nav.goToFolder(item.resource.folderId ?? 'root');
      else if (key === 'rename' || key === 'move') onEdit(item.key, key);
      else if (key === 'delete') setDeleteKey(item.key);
      else if ((key === 'share' || key === 'download') && item.kind === 'resource') {
        showToast('info', 'Đang chuẩn bị tệp…');
        void runFileAction(item.resource, key);
      }
    },
    [nav, onEdit, open],
  );

  const confirmDelete = useCallback(async () => {
    const item = deleteItem;
    if (!item) return;
    try {
      if (item.kind === 'resource') {
        await deleteResource.mutateAsync(item.resource);
      } else {
        const { folder } = item;
        // Luôn `recursive=true` (hộp thoại đã nói "cùng nội dung bên trong"): BE tự quyết theo vai
        // trò — thư mục rỗng xoá được với mọi người có `canModify`; còn nội dung thì chỉ OWNER/ADMIN
        // (cả cây vào thùng rác cùng lô), người khác nhận `RSC_004` (toast tại `apiClient`). Client
        // KHÔNG đoán vai trò để chọn cờ.
        await deleteFolder.mutateAsync({ folderId: folder.id, recursive: true });
        useToastStore
          .getState()
          .show('success', `Đã chuyển thư mục "${folder.name}" vào thùng rác`, {
            action: {
              label: 'Hoàn tác',
              onPress: () =>
                void foldersService
                  .restore(folder.id)
                  .then(() => invalidateWorkspaceResources(queryClient, wsId))
                  // Lỗi hoàn tác đã toast tại `apiClient` — không để Promise reject vô chủ (LogBox "Uncaught (in promise)").
                  .catch(() => undefined),
            },
            dismissible: true,
          });
      }
    } catch {
      // Lỗi đã toast tại `apiClient` (403/RSC_004…) — chỉ cần đóng hộp thoại.
    } finally {
      setDeleteKey(null);
    }
  }, [deleteFolder, deleteItem, deleteResource, queryClient, wsId]);

  return {
    actions: menuActions,
    closeDelete: () => setDeleteKey(null),
    closeMenu: () => setMenuKey(null),
    confirmDelete,
    deleteItem,
    deletePending: deleteFolder.isPending || deleteResource.isPending,
    menuItem,
    onMore: (item: ExplorerItem) => setMenuKey(item.key),
    open,
    select,
  };
}
