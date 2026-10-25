/** `GET /admin/workspaces/:workspaceId/media-stats?days=1..92` — quyền `meeting:view`, cờ `meeting` (khớp `admin-media-ops.routes.ts` phía BE). */
export const workspaceMediaStatsApi = {
  stats: (workspaceId: string) =>
    `/admin/workspaces/${encodeURIComponent(workspaceId)}/media-stats`,
} as const;
