import { router } from 'expo-router';
import { useMemo, useState } from 'react';

import { useSearchInput } from '@/shared/ui/search';
import { showToast } from '@/shared/utils/toast.utils';

import type { WhiteboardStatus, WhiteboardView } from '../api/whiteboard.types';
import { useArchiveWhiteboard, useUnarchiveWhiteboard } from '../queries/whiteboard.mutations';
import { useWhiteboards, useWorkspaceWhiteboardAccess } from '../queries/whiteboard.queries';
import { whiteboardErrorMessage } from '../utils/whiteboard-errors';
import {
  whiteboardCanvasHref,
  whiteboardHistoryHref,
  whiteboardShareHref,
} from '../utils/whiteboard-routes';
import { useSheetTarget } from './useSheetTarget';
import { useWhiteboardsSocket } from './useWhiteboardsSocket';

/**
 * Trạng thái + thao tác của màn danh sách bảng trắng: bộ lọc (tìm chạy ở SERVER, debounce 300 ms bằng `useSearchInput` — ô tìm giữ UNCONTROLLED nên
 * không mất dấu khi gõ Telex), tab Đang dùng/Lưu trữ, dữ liệu phân trang, đồng bộ socket, và các thao tác từ menu "⋯" của từng hàng.
 * Lưu trữ cần xác nhận (Dialog); khôi phục thì làm ngay.
 */
export function useWhiteboardList(wsId: string) {
  const search = useSearchInput();
  const [status, setStatus] = useState<WhiteboardStatus>('ACTIVE');
  const filter = useMemo(() => ({ q: search.value.trim(), status }), [search.value, status]);

  const query = useWhiteboards(wsId, filter);
  const access = useWorkspaceWhiteboardAccess(wsId);
  useWhiteboardsSocket(wsId);
  const items = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data]);

  const archive = useArchiveWhiteboard();
  const unarchive = useUnarchiveWhiteboard();

  const [creating, setCreating] = useState(false);
  const menu = useSheetTarget<WhiteboardView>();
  const rename = useSheetTarget<WhiteboardView>();
  const archiveTarget = useSheetTarget<WhiteboardView>();

  const confirmArchive = () => {
    const board = archiveTarget.target;
    if (!board) return;
    archive.mutate(board.id, {
      onError: (error) => showToast('error', whiteboardErrorMessage(error)),
      onSettled: archiveTarget.close,
      onSuccess: () => showToast('success', 'Đã lưu trữ bảng trắng'),
    });
  };

  const restore = (board: WhiteboardView) =>
    unarchive.mutate(board.id, {
      onError: (error) => showToast('error', whiteboardErrorMessage(error)),
      onSuccess: () => showToast('success', 'Đã khôi phục bảng trắng'),
    });

  return {
    access: access.data,
    archive: { ...archiveTarget, confirm: confirmArchive, pending: archive.isPending },
    creating,
    filter,
    items,
    menu,
    open: (board: WhiteboardView) => router.push(whiteboardCanvasHref(wsId, board.id)),
    openCreated: (wbId: string) => router.push(whiteboardCanvasHref(wsId, wbId)),
    openHistory: (board: WhiteboardView) => router.push(whiteboardHistoryHref(wsId, board.id)),
    openShare: (board: WhiteboardView) => router.push(whiteboardShareHref(wsId, board.id)),
    query,
    rename,
    restore,
    search,
    setCreating,
    setStatus,
    status,
  };
}
