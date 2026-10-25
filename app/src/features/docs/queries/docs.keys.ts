import type { DocumentsFilter } from '../api/docs.types';

/** Khoá React Query Real-time Docs — MỌI tham số ảnh hưởng kết quả nằm trong khoá (đổi bộ lọc mà dữ liệu không đổi là lỗi cache). */
export const docsKeys = {
  all: ['docs'] as const,
  ws: (wsId: string) => ['docs', 'ws', wsId] as const,
  access: (wsId: string) => ['docs', 'ws', wsId, 'access'] as const,
  members: (wsId: string) => ['docs', 'ws', wsId, 'members'] as const,
  /** Tiền tố của mọi danh sách của nhóm (mọi bộ lọc) — để vá/làm mới hàng loạt. */
  listsOf: (wsId: string) => ['docs', 'ws', wsId, 'list'] as const,
  list: (wsId: string, filter: DocumentsFilter) => ['docs', 'ws', wsId, 'list', filter] as const,
  assetUrl: (assetId: string) => ['docs', 'asset-url', assetId] as const,
  detail: (docId: string) => ['docs', 'doc', docId] as const,
  collaborators: (docId: string) => ['docs', 'doc', docId, 'collaborators'] as const,
  snapshots: (docId: string) => ['docs', 'doc', docId, 'snapshots'] as const,
  snapshot: (docId: string, snapshotId: string) =>
    ['docs', 'doc', docId, 'snapshot', snapshotId] as const,
};
