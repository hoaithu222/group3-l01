import { useQueryClient } from '@tanstack/react-query';

import { SocketEvent, useSocketEvent } from '@/core/socket';
import { useAuthStore } from '@/shell/store/slices/auth';

import type { MemberCard, MembershipStatus, WorkspaceRole } from '../api';
import { memberKeys } from '../queries/members.keys';
import { invalidateMemberCopies, updateMemberLists } from '../queries/members.queries';

/** Payload `member:updated` → `ws:{id}` (be.md p1-02 §6). */
interface MemberUpdatedPayload {
  v: number;
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  status: MembershipStatus;
  displayName: string | null;
  /** p6-03 — chỉ có khi membership mang nhãn (`"MENTOR"`); bản gửi riêng cho OWNER/ADMIN (kèm `expiresAt`) KHÔNG có trường này. */
  displayTag?: string;
  /** p3-04 — hạn của khách, CHỈ trong bản gửi riêng cho OWNER/ADMIN (`emitToUsers`). */
  expiresAt?: string;
}

/**
 * Đồng bộ cache theo `member:updated` (app.md p1-02 §4). Mount ở
 * `MemberListScreen` — danh sách sống theo thời gian thực khi ai đó vào/rời/đổi
 * vai trò, kể cả khi không phải mình bấm.
 *
 * ⛔ `permission:revoked` (mất quyền, bị loại/chặn CHÍNH MÌNH) KHÔNG xử lý ở
 * đây — đã có `useWorkspaceSocket(wsId)` của p1-01 mount SẴN ở
 * `(app)/workspaces/[wsId]/_layout.tsx`, bọc quanh mọi màn con (kể cả
 * `members.tsx`/`invite.tsx`), nên điều hướng-ra-ngay đã hoạt động mà không
 * cần lặp lại logic đó ở đây (app.md §4: "xử lý chung ở p1-01 useWorkspaceSocket").
 *
 * ⛔ `presence:updated` cũng KHÔNG xử lý ở đây — `bindPresenceHeartbeat()`
 * (p0-03, mount một lần ở `AppProviders`) đã ghi thẳng vào `usePresenceStore`
 * dùng chung; `MemberRow` đọc qua `usePresence(userId)`, không cần một đường
 * ống thứ hai cho cùng một sự kiện.
 */
export function useMemberSocket(wsId: string): void {
  const queryClient = useQueryClient();
  const currentUserId = useAuthStore((state) => state.user?.id);

  useSocketEvent<MemberUpdatedPayload>(SocketEvent.MEMBER_UPDATED, (payload) => {
    if (payload.workspaceId !== wsId) return;

    const isActive = payload.status === 'ACTIVE';
    // Chỉ GHI khi payload CÓ trường: hai bản `member:updated` của cùng một thay đổi mang tập trường khác nhau (nhãn ở bản của cả nhóm, hạn ở bản
    // của OWNER/ADMIN) — vắng mặt là "bản này không nói", KHÔNG phải "đã xoá", nên không được ghi đè bằng null. Nhãn cố vấn bị gỡ đi kèm đổi
    // vai/trạng thái (`isMentorTag` kiểm cả vai KHÁCH; người rời nhóm thì dòng bị bỏ).
    const extras = {
      ...(payload.displayTag ? { displayTag: payload.displayTag } : {}),
      ...(payload.expiresAt ? { expiresAt: payload.expiresAt } : {}),
    };

    updateMemberLists(queryClient, wsId, payload.userId, (row) =>
      isActive
        ? {
            ...row,
            role: payload.role,
            status: payload.status,
            displayName: payload.displayName,
            ...extras,
          }
        : null,
    );

    queryClient.setQueryData<MemberCard>(memberKeys.card(wsId, payload.userId), (prev) =>
      prev
        ? {
            ...prev,
            role: payload.role,
            status: payload.status,
            displayName: payload.displayName,
            ...extras,
          }
        : prev,
    );

    // Vá tại chỗ không THÊM được dòng (người mới vào nhóm, vừa được gỡ chặn) và không sửa tổng số — lấy lại bản server,
    // cùng các bản chép tên/vai trò ở kênh (xem `invalidateMemberCopies`).
    invalidateMemberCopies(queryClient, wsId);

    if (payload.userId === currentUserId) {
      void queryClient.invalidateQueries({ queryKey: ['workspaces', 'detail', wsId] });
      void queryClient.invalidateQueries({ queryKey: ['workspaces', 'overview', wsId] });
    }
  });
}
