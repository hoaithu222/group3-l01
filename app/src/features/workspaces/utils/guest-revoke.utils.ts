import type { QueryClient } from '@tanstack/react-query';

import type { WorkspaceDetail, WorkspaceOverview } from '../api';
import { workspaceKeys } from '../queries/workspaces.keys';

/** Sai lệch đồng hồ máy/BE chấp nhận được khi so hạn khách với lúc nhận `permission:revoked`. */
const CLOCK_TOLERANCE_MS = 60_000;

export const GUEST_EXPIRED_MESSAGE = 'Quyền khách đã hết hạn.';

export interface CachedGuestInfo {
  wasGuest: boolean;
  expiresAt: string | null | undefined;
}

/**
 * Mình có phải KHÁCH của nhóm này không (và hạn bao giờ) — đọc từ cache NGAY TRƯỚC khi
 * `permission:revoked` xoá nó. `null` khi chưa từng tải nhóm (không biết → không nói gì).
 */
export function readCachedGuest(queryClient: QueryClient, workspaceId: string): CachedGuestInfo | null {
  const detail =
    queryClient.getQueryData<WorkspaceDetail>(workspaceKeys.detail(workspaceId)) ??
    queryClient.getQueryData<WorkspaceOverview>(workspaceKeys.overview(workspaceId))?.workspace;
  return detail ? { wasGuest: detail.myRole === 'GUEST', expiresAt: detail.myExpiresAt } : null;
}

/**
 * Câu toast khi mất quyền workspace vì HẾT HẠN KHÁCH (app.md p3-04 §3: "Quyền khách đã
 * hết hạn"); `null` = không phải ca đó (giữ nguyên hành vi cũ: chỉ điều hướng, không toast).
 *
 * Nhận ra theo HAI dấu hiệu vì BE chưa chốt `reason` (`revokeScope` chưa có `EXPIRED`):
 * `reason === 'EXPIRED'`, hoặc mình từng là khách VÀ hạn đã qua (≤ 1 phút chưa tới) khi
 * bị thu hồi kiểu `REMOVED`. Khách bị quản trị loại GIỮA hạn thì KHÔNG nói "hết hạn" —
 * nói sai còn tệ hơn im lặng.
 */
export function guestRevokeMessage(
  reason: string,
  guest: CachedGuestInfo | null,
  now: number = Date.now(),
): string | null {
  if (!guest?.wasGuest) return null;
  if (reason === 'EXPIRED') return GUEST_EXPIRED_MESSAGE;

  if (reason !== 'REMOVED' || !guest.expiresAt) return null;
  const expiresAtMs = new Date(guest.expiresAt).getTime();
  return !Number.isNaN(expiresAtMs) && expiresAtMs <= now + CLOCK_TOLERANCE_MS ? GUEST_EXPIRED_MESSAGE : null;
}
