/**
 * Cổng đọc số chưa đọc/mention theo workspace — do `p1-07` (read-state) cài
 * đặt khi module đó ra đời (be.md §4 ghi chú "trước khi p1-07 xong trả 0 và
 * cờ unreadAvailable=false"). Chưa đăng ký → `list()` trả `unreadAvailable:
 * false`, KHÔNG throw (giống `WorkspaceOverviewRegistry` — phần chưa có thì bỏ).
 */
export interface UnreadSummary {
  unreadCount: number;
  mentionCount: number;
}

export type UnreadSummaryPort = (userId: string, workspaceIds: string[]) => Promise<Map<string, UnreadSummary>>;

let port: UnreadSummaryPort | null = null;

export function registerUnreadSummaryPort(resolver: UnreadSummaryPort): void {
  port = resolver;
}

/** Chỉ dùng trong test để cô lập giữa các case. */
export function clearUnreadSummaryPort(): void {
  port = null;
}

export async function getUnreadSummaries(userId: string, workspaceIds: string[]): Promise<Map<string, UnreadSummary>> {
  if (!port || workspaceIds.length === 0) return new Map();
  return port(userId, workspaceIds);
}
