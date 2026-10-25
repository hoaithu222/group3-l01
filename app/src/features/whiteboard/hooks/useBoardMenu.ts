import { router } from 'expo-router';

import { showToast } from '@/shared/utils/toast.utils';

import { useArchiveWhiteboard, useUnarchiveWhiteboard } from '../queries/whiteboard.mutations';
import { whiteboardErrorMessage } from '../utils/whiteboard-errors';
import { whiteboardHistoryHref, whiteboardShareHref } from '../utils/whiteboard-routes';
import { useDisclosure } from './useSheetTarget';

/**
 * Các thao tác của menu "⋯" trên màn vẽ: đổi tên, lưu phiên bản, lưu trữ (xác nhận bằng Dialog), khôi phục bảng, kiểu vẽ, và hai lối sang màn Chia sẻ /
 * Lịch sử. Gom một chỗ để `WhiteboardStage` chỉ còn nối dây, không phải giữ chín state/handler của menu.
 */
export function useBoardMenu(wsId: string, wbId: string) {
  const rename = useDisclosure();
  const version = useDisclosure();
  const style = useDisclosure();
  const archiveDialog = useDisclosure();
  const archive = useArchiveWhiteboard();
  const unarchive = useUnarchiveWhiteboard();

  return {
    archive: {
      confirm: () =>
        archive.mutate(wbId, {
          onError: (error) => showToast('error', whiteboardErrorMessage(error)),
          onSettled: archiveDialog.close,
          onSuccess: () => showToast('success', 'Đã lưu trữ bảng trắng'),
        }),
      dialog: archiveDialog,
      pending: archive.isPending,
    },
    history: () => router.push(whiteboardHistoryHref(wsId, wbId)),
    rename,
    restore: () =>
      unarchive.mutate(wbId, {
        onError: (error) => showToast('error', whiteboardErrorMessage(error)),
        onSuccess: () => showToast('success', 'Đã khôi phục bảng trắng'),
      }),
    share: () => router.push(whiteboardShareHref(wsId, wbId)),
    style,
    version,
  };
}
