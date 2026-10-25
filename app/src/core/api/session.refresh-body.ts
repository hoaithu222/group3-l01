/**
 * Đọc thân phản hồi của `POST /auth/refresh` — tách khỏi `session.ts` (file đó
 * đang ở trần độ dài đã khai trong `scripts/file-size-manifest.json`).
 *
 * Nhận cả hai cách đặt tên (`accessToken`/`access_token`) và cả hai kiểu bọc
 * (`{ data: {...} }` hoặc trần), vì backend nội bộ không nhất quán giữa các
 * endpoint — cùng lý do `unwrapData` ở `unwrap.ts`.
 */

export interface RefreshTokens {
  accessToken: string | undefined;
  refreshToken: string | undefined;
}

interface RefreshResponseBody {
  accessToken?: string;
  access_token?: string;
  refreshToken?: string;
  refresh_token?: string;
}

/** Bóc lớp bọc `{ data: {...} }` nếu backend có bọc. */
function unwrap(raw: unknown): RefreshResponseBody {
  if (raw !== null && typeof raw === 'object' && 'data' in raw) {
    const inner = (raw as { data?: unknown }).data;
    if (inner !== null && typeof inner === 'object') return inner as RefreshResponseBody;
  }
  return (raw ?? {}) as RefreshResponseBody;
}

export function readRefreshTokens(raw: unknown): RefreshTokens {
  const body = unwrap(raw);
  return {
    accessToken: body.accessToken ?? body.access_token,
    refreshToken: body.refreshToken ?? body.refresh_token,
  };
}
