import { useCallback, useState } from 'react';

import { showToast } from '@/shared/utils/toast.utils';

import { useRestoreFolder } from '../queries/folder.queries';
import { usePurgeResource, useRestoreResource } from '../queries/trash.queries';
import { resourceErrorMessage } from '../utils/error-messages';
import type { TrashEntry } from '../utils/trash-entries';

/**
 * Khôi phục / xoá vĩnh viễn trong thùng rác. Khôi phục lỗi (`RSC_002` trùng tên,
 * `RSC_008` vị trí gốc không còn) toast đúng câu của BE — service đã
 * `skipErrorToast` để không toast hai lần. Xoá vĩnh viễn luôn qua hộp thoại xác nhận.
 */
export function useTrashActions(wsId: string) {
  const restoreResource = useRestoreResource(wsId);
  const restoreFolder = useRestoreFolder(wsId);
  const purge = usePurgeResource(wsId);
  const [purgeEntry, setPurgeEntry] = useState<TrashEntry | null>(null);

  const restore = useCallback(
    async (entry: TrashEntry) => {
      try {
        if (entry.kind === 'folder') await restoreFolder.mutateAsync(entry.id);
        else await restoreResource.mutateAsync(entry.id);
        showToast('success', `Đã khôi phục "${entry.name}"`);
      } catch (error) {
        showToast('error', resourceErrorMessage(error));
      }
    },
    [restoreFolder, restoreResource],
  );

  const confirmPurge = useCallback(async () => {
    const entry = purgeEntry;
    if (!entry) return;
    try {
      await purge.mutateAsync(entry.id);
      showToast('success', `Đã xoá vĩnh viễn "${entry.name}"`);
    } catch {
      // Lỗi đã toast tại `apiClient` — chỉ cần đóng hộp thoại.
    } finally {
      setPurgeEntry(null);
    }
  }, [purge, purgeEntry]);

  return {
    busy: restoreResource.isPending || restoreFolder.isPending || purge.isPending,
    closePurge: () => setPurgeEntry(null),
    confirmPurge,
    purgeEntry,
    purgePending: purge.isPending,
    requestPurge: setPurgeEntry,
    restore,
  };
}
