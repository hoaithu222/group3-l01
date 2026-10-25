/** Khoá cache của `GET /admin/overview` — tách file để `ops-stats.socket.ts` dùng mà không khép vòng với `overview.queries.ts`. */
export const OVERVIEW_KEY = ['admin-overview'] as const;
