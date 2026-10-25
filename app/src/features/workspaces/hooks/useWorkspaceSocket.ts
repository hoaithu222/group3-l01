import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';

import { SocketEvent, useSocketEvent, type PermissionRevokedPayload } from '@/core/socket';
import { useAuthStore } from '@/shell/store/slices/auth';
import { PATHS } from '@/shell/config';
import { showToast } from '@/shared/utils/toast.utils';

import type { WorkspaceCoverPreset, WorkspaceDetail, WorkspaceListItem } from '../api';
import { workspaceKeys } from '../queries/workspaces.keys';
import { guestRevokeMessage, readCachedGuest } from '../utils/guest-revoke.utils';

interface WorkspaceUpdatedPayload {
  id: string;
  name?: string;
  description?: string | null;
  avatarUrl?: string | null;
  /** Đi kèm `avatarUrl` — BE gộp cả `workspaceImagesOf()` vào MỌI `workspace:updated` (`workspace-events.consumer.ts`). */
  coverUrl?: string | null;
  coverThumbUrl?: string | null;
  coverPreset?: WorkspaceCoverPreset | null;
  status?: 'ACTIVE' | 'ARCHIVED';
  version?: number;
}

interface WorkspaceArchivedPayload {
  id: string;
  status: 'ARCHIVED';
  archivedReason: 'MANUAL' | 'PLATFORM' | null;
}

interface MemberUpdatedPayload {
  workspaceId: string;
  userId: string;
  role: string;
  status: string;
}

/**
 * Tiền tố CHỈ các danh sách nhóm (`workspaceKeys.list(status)`).
 *
 * ⛔ KHÔNG vá theo `workspaceKeys.all`: tiền tố đó khớp cả `detail`/`overview`/`transfer-candidates` (object, không phải
 * mảng) ⇒ `list.map` NÉM `TypeError` ngay ở cache đầu tiên không phải mảng — các danh sách đứng sau không được vá, và
 * listener `workspace:*` của màn khác (cùng sự kiện) cũng không chạy.
 */
const LIST_PREFIX = workspaceKeys.lists();

function patchListItem(
  list: WorkspaceListItem[] | undefined,
  id: string,
  patch: Partial<WorkspaceListItem>,
): WorkspaceListItem[] | undefined {
  if (!Array.isArray(list)) return list;
  return list.map((item) => (item.id === id ? { ...item, ...patch } : item));
}

/**
 * Đồng bộ cache React Query theo sự kiện realtime `workspace:*`/`member:updated`/
 * `permission:revoked` (app.md p1-01 §4). Mount ở `WorkspaceListScreen` (đồng bộ
 * danh sách xuyên suốt tab "Nhóm") VÀ ở `[wsId]/_layout.tsx` (điều hướng ra
 * ngay khi mất quyền với ĐÚNG workspace đang mở) — gọi nhiều lần vô hại, mỗi
 * lần chỉ đăng ký thêm một listener độc lập, không có state chia sẻ giữa các lần gọi.
 *
 * Room `ws:{id}` server tự join lúc connect (không cần `room:join`), nên sự
 * kiện của MỌI workspace người dùng đang là thành viên đều tới, bất kể màn nào
 * đang mở — vì vậy hàm patch cache không giả định "đang xem đúng workspace này".
 */
export function useWorkspaceSocket(activeWorkspaceId?: string): void {
  const queryClient = useQueryClient();
  const currentUserId = useAuthStore((state) => state.user?.id);

  useSocketEvent<WorkspaceUpdatedPayload>(SocketEvent.WORKSPACE_UPDATED, (payload) => {
    const detailKey = workspaceKeys.detail(payload.id);
    const current = queryClient.getQueryData<WorkspaceDetail>(detailKey);
    if (current && (payload.version === undefined || payload.version > current.version)) {
      queryClient.setQueryData<WorkspaceDetail>(detailKey, {
        ...current,
        ...(payload.name !== undefined && { name: payload.name }),
        ...(payload.description !== undefined && { description: payload.description }),
        ...(payload.avatarUrl !== undefined && { avatarUrl: payload.avatarUrl }),
        ...(payload.coverUrl !== undefined && { coverUrl: payload.coverUrl }),
        ...(payload.coverThumbUrl !== undefined && { coverThumbUrl: payload.coverThumbUrl }),
        ...(payload.coverPreset !== undefined && { coverPreset: payload.coverPreset }),
        ...(payload.status !== undefined && { status: payload.status }),
        ...(payload.version !== undefined && { version: payload.version }),
      });
    }
    queryClient.setQueriesData<WorkspaceListItem[]>({ queryKey: LIST_PREFIX }, (list) =>
      patchListItem(list, payload.id, {
        ...(payload.name !== undefined && { name: payload.name }),
        ...(payload.avatarUrl !== undefined && { avatarUrl: payload.avatarUrl }),
        ...(payload.coverUrl !== undefined && { coverUrl: payload.coverUrl }),
        ...(payload.coverThumbUrl !== undefined && { coverThumbUrl: payload.coverThumbUrl }),
        ...(payload.coverPreset !== undefined && { coverPreset: payload.coverPreset }),
        ...(payload.status !== undefined && { status: payload.status }),
      }),
    );
    // Màn Tổng quan đọc tên/ảnh/mô tả/trạng thái từ `overview.workspace` (bản chép riêng) — vá `detail` không tới được đó.
    void queryClient.invalidateQueries({ queryKey: workspaceKeys.overview(payload.id) });
  });

  useSocketEvent<WorkspaceArchivedPayload>(SocketEvent.WORKSPACE_ARCHIVED, (payload) => {
    const detailKey = workspaceKeys.detail(payload.id);
    const current = queryClient.getQueryData<WorkspaceDetail>(detailKey);
    if (current) {
      queryClient.setQueryData<WorkspaceDetail>(detailKey, {
        ...current,
        status: 'ARCHIVED',
        archivedReason: payload.archivedReason,
      });
    }
    queryClient.setQueriesData<WorkspaceListItem[]>({ queryKey: LIST_PREFIX }, (list) =>
      patchListItem(list, payload.id, { status: 'ARCHIVED' }),
    );
    void queryClient.invalidateQueries({ queryKey: workspaceKeys.overview(payload.id) });
  });

  useSocketEvent<MemberUpdatedPayload>(SocketEvent.MEMBER_UPDATED, (payload) => {
    // Chỉ mình mình đổi vai trò mới cần vẽ lại nút hành động (myPermissions) —
    // vai trò người khác đổi không ảnh hưởng gì tới cache phía mình lúc này
    // (danh sách thành viên do `useMemberSocket` lo).
    if (payload.userId !== currentUserId) return;
    void queryClient.invalidateQueries({ queryKey: workspaceKeys.detail(payload.workspaceId) });
    void queryClient.invalidateQueries({ queryKey: workspaceKeys.overview(payload.workspaceId) });
    // Thẻ nhóm ở tab "Nhóm" hiện huy hiệu vai trò/trạng thái (PENDING → ACTIVE) của CHÍNH MÌNH từ danh sách.
    void queryClient.invalidateQueries({ queryKey: LIST_PREFIX });
  });

  useSocketEvent<PermissionRevokedPayload>(SocketEvent.PERMISSION_REVOKED, (payload) => {
    if (payload.scopeType !== 'WORKSPACE') return;
    const workspaceId = payload.scopeId;
    // p3-04: phải đọc vai trò/hạn KHÁCH TRƯỚC khi xoá cache ngay bên dưới.
    const guestMessage = guestRevokeMessage(payload.reason, readCachedGuest(queryClient, workspaceId));
    queryClient.removeQueries({ queryKey: workspaceKeys.detail(workspaceId) });
    queryClient.removeQueries({ queryKey: workspaceKeys.overview(workspaceId) });
    void queryClient.invalidateQueries({ queryKey: LIST_PREFIX });
    if (activeWorkspaceId === workspaceId) {
      router.replace(PATHS.WORKSPACES);
      // Chỉ toast khi ĐANG ở trong nhóm: ở ngoài thì không có gì để giải thích (không thấy nhóm biến mất).
      if (guestMessage) showToast('info', guestMessage);
    }
  });
}
