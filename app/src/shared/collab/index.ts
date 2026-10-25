/**
 * Lớp dùng chung cho cộng tác thời gian thực (Real-time Docs p6-01, sau này Bảng trắng p6-02): xin/làm mới mã kết nối ngắn hạn.
 * Không phụ thuộc feature nào — feature truyền hàm gọi `POST …/collab-token` của riêng nó vào `CollabTokenProvider`.
 */
export { CollabRefreshScheduler } from './collab-refresh-scheduler';
export type { CollabRefreshSchedulerOptions } from './collab-refresh-scheduler';
export { isGrantFresh, parseCollabGrant, refreshDelayMs } from './collab-token';
export { CollabTokenProvider } from './collab-token-provider';
export { COLLAB_REFRESH_SKEW_MS } from './collab-token.types';
export type {
  CollabGrant,
  CollabGrantFetcher,
  CollabKind,
  CollabMode,
  CollabUser,
} from './collab-token.types';
export { useCollabTokenRefresher } from './useCollabTokenRefresher';
export type { UseCollabTokenRefresherOptions } from './useCollabTokenRefresher';
