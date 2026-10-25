import type { WhiteboardsFilter } from '../api/whiteboard.types';

/** Khoá React Query Bảng trắng — MỌI tham số ảnh hưởng kết quả nằm trong khoá (đổi bộ lọc mà dữ liệu không đổi là lỗi cache). */
export const whiteboardKeys = {
  all: ['whiteboard'] as const,
  ws: (wsId: string) => ['whiteboard', 'ws', wsId] as const,
  access: (wsId: string) => ['whiteboard', 'ws', wsId, 'access'] as const,
  members: (wsId: string) => ['whiteboard', 'ws', wsId, 'members'] as const,
  /** Tiền tố của mọi danh sách của nhóm (mọi bộ lọc) — để vá/làm mới hàng loạt. */
  listsOf: (wsId: string) => ['whiteboard', 'ws', wsId, 'list'] as const,
  list: (wsId: string, filter: WhiteboardsFilter) =>
    ['whiteboard', 'ws', wsId, 'list', filter] as const,
  detail: (wbId: string) => ['whiteboard', 'board', wbId] as const,
  collaborators: (wbId: string) => ['whiteboard', 'board', wbId, 'collaborators'] as const,
  snapshots: (wbId: string) => ['whiteboard', 'board', wbId, 'snapshots'] as const,
};
