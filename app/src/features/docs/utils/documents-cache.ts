import type { InfiniteData, QueryClient } from '@tanstack/react-query';

import type {
  CursorPage,
  DocumentsFilter,
  DocumentUpdatedPayload,
  DocumentView,
} from '../api/docs.types';
import { docsKeys } from '../queries/docs.keys';

type Pages = InfiniteData<CursorPage<DocumentView>>;

export type PatchOutcome =
  { data: Pages; kind: 'patched' } | { kind: 'stale' } | { kind: 'unchanged' };

/**
 * Áp một sự kiện `document:updated` (chỉ metadata: tiêu đề/chế độ hiển thị/trạng thái/phiên bản) vào MỘT danh sách đã tải:
 *  · có trong danh sách → đổi trạng thái khác bộ lọc của danh sách (lưu trữ ↔ đang dùng) thì GỠ khỏi danh sách này; còn lại VÁ tại chỗ
 *    (bỏ qua sự kiện có `version` cũ hơn — tới trễ, so `version` như BE khuyến nghị);
 *  · chưa có mà khớp bộ lọc → `stale` (tài liệu mới/vừa được mời: nơi gọi tải lại danh sách đó thay vì tự chèn — chèn ở đầu có thể trùng
 *    với trang sau khi cuộn tiếp, vì thứ tự do BE quyết định);
 *  · còn lại → không đổi.
 */
export function patchDocumentPages(
  data: Pages | undefined,
  payload: DocumentUpdatedPayload,
  filter: DocumentsFilter,
): PatchOutcome {
  if (!data) return { kind: 'unchanged' };
  const found = data.pages.some((page) => page.items.some((item) => item.id === payload.id));
  if (!found) return payload.status === filter.status ? { kind: 'stale' } : { kind: 'unchanged' };

  const pages = data.pages.map((page) => ({
    ...page,
    items: page.items.flatMap((item): DocumentView[] => {
      if (item.id !== payload.id) return [item];
      if (payload.status !== filter.status) return [];
      if (payload.version < item.version) return [item];
      return [
        {
          ...item,
          lastEditedAt: payload.lastEditedAt ?? item.lastEditedAt,
          status: payload.status,
          title: payload.title,
          version: payload.version,
          visibility: payload.visibility,
        },
      ];
    }),
  }));
  return { data: { ...data, pages }, kind: 'patched' };
}

/**
 * Đồng bộ cache React Query theo `document:updated`: vá/gỡ/làm mới MỌI danh sách của nhóm (mọi bộ lọc) + làm mới chi tiết nếu đang có
 * trong cache và sự kiện MỚI hơn (chi tiết mang `myPermissions` do server tính — đổi chế độ/lưu trữ có thể đổi quyền nên tải lại chứ không tự vá).
 */
export function applyDocumentUpdate(qc: QueryClient, payload: DocumentUpdatedPayload): void {
  for (const [key, data] of qc.getQueriesData<Pages>({
    queryKey: docsKeys.listsOf(payload.workspaceId),
  })) {
    // Khoá danh sách = ['docs', 'ws', wsId, 'list', filter] (xem `docsKeys.list`).
    const filter = key[4] as DocumentsFilter;
    const outcome = patchDocumentPages(data, payload, filter);
    if (outcome.kind === 'patched') qc.setQueryData(key, outcome.data);
    else if (outcome.kind === 'stale') void qc.invalidateQueries({ exact: true, queryKey: key });
  }
  const detail = qc.getQueryData<{ version: number }>(docsKeys.detail(payload.id));
  if (detail && payload.version > detail.version) {
    void qc.invalidateQueries({ exact: true, queryKey: docsKeys.detail(payload.id) });
  }
}
