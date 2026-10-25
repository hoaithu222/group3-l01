import type { PeriodKey } from '../api/contribution.types';

const board = (boardId: string) => ['contribution', 'board', boardId] as const;
const reportsAll = (boardId: string) => [...board(boardId), 'report'] as const;
const memberTasksAll = (boardId: string) => [...board(boardId), 'member-tasks'] as const;
const workspaceHeatmapAll = ['contribution', 'workspace-heatmap'] as const;

/**
 * Khoá React Query (`app.md` §4) — mọi tham số ảnh hưởng kết quả đều nằm trong khoá. Đăng xuất đã `queryClient.clear()` nên không
 * cần dọn riêng. Đổi công thức/`board:updated` làm mới MỌI kỳ của MỘT bảng qua tiền tố `reportsAll` + `memberTasksAll` (heatmap không
 * phụ thuộc công thức nên KHÔNG bị kéo theo).
 */
export const contributionKeys = {
  all: ['contribution'] as const,
  boardMeta: (boardId: string) => ['contribution', 'board-meta', boardId] as const,
  config: (boardId: string) => ['contribution', 'config', boardId] as const,
  export: (exportId: string) => ['contribution', 'export', exportId] as const,
  heatmap: (boardId: string, userId: string | 'all', from: string, to: string) =>
    [...board(boardId), 'heatmap', userId, from, to] as const,
  memberTasks: (boardId: string, userId: string, period: PeriodKey) =>
    [...memberTasksAll(boardId), userId, period] as const,
  memberTasksAll,
  periods: (boardId: string) => [...board(boardId), 'periods'] as const,
  report: (boardId: string, period: PeriodKey) => [...reportsAll(boardId), period] as const,
  reportsAll,
  /** Tiền tố dọn MỌI heatmap cấp nhóm — `features/boards` (`board-derived-cache.ts`) ghi tay chuỗi này khi thẻ đổi (không import chéo). */
  workspaceHeatmapAll,
  /** Heatmap gộp mọi bảng của MỘT nhóm (p4-06): mọi tham số ảnh hưởng kết quả đều nằm trong khoá. */
  workspaceHeatmap: (workspaceId: string, userId: string | 'all', from: string, to: string) =>
    [...workspaceHeatmapAll, workspaceId, userId, from, to] as const,
  workspaceMembers: (workspaceId: string) => ['contribution', 'workspace-members', workspaceId] as const,
  /**
   * Khoá CHUNG `['workspaces','detail',wsId]` với `features/workspaces` (`workspaces.keys.ts#detail`) và `features/boards` (`useWorkspaceBoardAccess`) — cùng một
   * `GET /workspaces/:id` nên ba bên chia sẻ MỘT bản (ghi tay vì không import chéo). ⚠️ Đổi khoá bên kia thì đổi ở đây theo.
   */
  workspaceDetail: (workspaceId: string) => ['workspaces', 'detail', workspaceId] as const,
};
