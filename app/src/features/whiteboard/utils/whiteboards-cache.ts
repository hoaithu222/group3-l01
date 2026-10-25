import type { InfiniteData, QueryClient } from '@tanstack/react-query';

import type {
  CursorPage,
  WhiteboardsFilter,
  WhiteboardUpdatedPayload,
  WhiteboardView,
} from '../api/whiteboard.types';
import { whiteboardKeys } from '../queries/whiteboard.keys';

type Pages = InfiniteData<CursorPage<WhiteboardView>>;

export type PatchOutcome =
  { data: Pages; kind: 'patched' } | { kind: 'stale' } | { kind: 'unchanged' };

/**
 * Áp một sự kiện `whiteboard:updated` (chỉ metadata: tên/chế độ hiển thị/trạng thái/ảnh thu nhỏ/phiên bản) vào MỘT danh sách đã tải:
 *  · có trong danh sách → đổi trạng thái khác bộ lọc của danh sách (lưu trữ ↔ đang dùng) thì GỠ khỏi danh sách này; còn lại VÁ tại chỗ
 *    (bỏ qua sự kiện có `version` cũ hơn — tới trễ, so `version` như BE khuyến nghị);
 *  · chưa có mà khớp bộ lọc → `stale` (bảng mới/vừa được mời: nơi gọi tải lại danh sách đó thay vì tự chèn — thứ tự do BE quyết định);
 *  · còn lại → không đổi.
 * ⚠️ Sự kiện không mang `thumbnailUrl` (URL ký) nên khi ảnh thu nhỏ đổi thì đánh dấu `stale` để tải lại danh sách lấy URL mới.
 */
export function patchWhiteboardPages(
  data: Pages | undefined,
  payload: WhiteboardUpdatedPayload,
  filter: WhiteboardsFilter,
): PatchOutcome {
  if (!data) return { kind: 'unchanged' };
  const found = data.pages.flatMap((page) => page.items).find((item) => item.id === payload.id);
  if (!found) return payload.status === filter.status ? { kind: 'stale' } : { kind: 'unchanged' };
  if (payload.thumbnailAssetId !== found.thumbnailAssetId && payload.version >= found.version) {
    return { kind: 'stale' };
  }

  const pages = data.pages.map((page) => ({
    ...page,
    items: page.items.flatMap((item): WhiteboardView[] => {
      if (item.id !== payload.id) return [item];
      if (payload.status !== filter.status) return [];
      if (payload.version < item.version) return [item];
      return [
        {
          ...item,
          name: payload.name,
          status: payload.status,
          version: payload.version,
          visibility: payload.visibility,
        },
      ];
    }),
  }));
  return { data: { ...data, pages }, kind: 'patched' };
}

/**
 * Đồng bộ cache React Query theo `whiteboard:updated`: vá/gỡ/làm mới MỌI danh sách của nhóm (mọi bộ lọc) + làm mới chi tiết nếu đang có trong
 * cache và sự kiện MỚI hơn (chi tiết mang `myPermissions` do server tính — đổi chế độ/lưu trữ có thể đổi quyền nên tải lại chứ không tự vá).
 */
export function applyWhiteboardUpdate(qc: QueryClient, payload: WhiteboardUpdatedPayload): void {
  for (const [key, data] of qc.getQueriesData<Pages>({
    queryKey: whiteboardKeys.listsOf(payload.workspaceId),
  })) {
    // Khoá danh sách = ['whiteboard', 'ws', wsId, 'list', filter] (xem `whiteboardKeys.list`).
    const filter = key[4] as WhiteboardsFilter;
    const outcome = patchWhiteboardPages(data, payload, filter);
    if (outcome.kind === 'patched') qc.setQueryData(key, outcome.data);
    else if (outcome.kind === 'stale') void qc.invalidateQueries({ exact: true, queryKey: key });
  }
  const detail = qc.getQueryData<{ version: number }>(whiteboardKeys.detail(payload.id));
  if (detail && payload.version > detail.version) {
    void qc.invalidateQueries({ exact: true, queryKey: whiteboardKeys.detail(payload.id) });
  }
}
