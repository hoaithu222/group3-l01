import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  invitationsService,
  type InvitationStatus,
  type InviteGuestPayload,
  type InviteMembersPayload,
} from '../api';
import { pendingInviteStore } from '../store/pending-invite';
import { invitationKeys } from './invitations.keys';
import { memberKeys } from './members.keys';

/** Một trạng thái/lượt — BE lọc theo `?status` (be.md §4). `enabled=false` cho tab không đang mở. */
export function useInvitations(wsId: string, status: InvitationStatus, enabled = true) {
  return useInfiniteQuery({
    queryKey: invitationKeys.list(wsId, status),
    queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
      invitationsService.list(wsId, status, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.meta.hasMore ? (lastPage.meta.nextCursor ?? undefined) : undefined,
    enabled: Boolean(wsId) && enabled,
    staleTime: 15_000,
  });
}

/**
 * Mời lại một địa chỉ đã HẾT HẠN/ĐÃ THU HỒI đổi cả dòng ở tab đó (không chỉ thêm dòng vào "Đang chờ") — làm mới mọi tab
 * (mỗi tab chỉ tải lại khi đang hiện, các tab khác chỉ bị đánh dấu cũ).
 */
function useInvalidatePendingInvitations(wsId: string) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: invitationKeys.listAll(wsId) });
  };
}

/** `idempotencyKey` sinh lúc mở form, giữ tới khi gửi được (app.md §4). */
export function useInviteMembers(wsId: string) {
  const invalidate = useInvalidatePendingInvitations(wsId);
  return useMutation({
    mutationFn: ({ payload, idempotencyKey }: { payload: InviteMembersPayload; idempotencyKey: string }) =>
      invitationsService.inviteMembers(wsId, payload, idempotencyKey),
    onSuccess: invalidate,
  });
}

export function useInviteGuest(wsId: string) {
  const invalidate = useInvalidatePendingInvitations(wsId);
  return useMutation({
    mutationFn: ({ payload, idempotencyKey }: { payload: InviteGuestPayload; idempotencyKey: string }) =>
      invitationsService.inviteGuest(wsId, payload, idempotencyKey),
    onSuccess: invalidate,
  });
}

/** Thu hồi/gửi lại đổi TRẠNG THÁI → mọi tab của workspace này có thể đổi dòng, nên invalidate cả tiền tố. */
function useInvalidateAllInvitations(wsId: string) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: invitationKeys.listAll(wsId) });
  };
}

export function useRevokeInvitation(wsId: string) {
  const invalidate = useInvalidateAllInvitations(wsId);
  return useMutation({
    mutationFn: (invitationId: string) => invitationsService.revoke(invitationId),
    onSuccess: invalidate,
    // 409 (đã không còn PENDING): danh sách cũ → tải lại để dòng đó đổi tab.
    onError: invalidate,
  });
}

export function useResendInvitation(wsId: string) {
  const invalidate = useInvalidateAllInvitations(wsId);
  return useMutation({
    mutationFn: (invitationId: string) => invitationsService.resend(invitationId),
    onSuccess: invalidate,
  });
}

/**
 * ⛔ `gcTime: 0` + `retry: false`: token là BÍ MẬT — không để bản xem trước nằm
 * lại bộ nhớ sau khi rời màn, và 410/404/403 là trạng thái nghiệp vụ (thử lại
 * không đổi kết quả). Cùng mẫu `useInvitePreview` của link mời.
 */
export function useInvitationPreview(token: string | undefined) {
  return useQuery({
    queryKey: invitationKeys.byToken(token ?? ''),
    queryFn: () => invitationsService.preview(token as string),
    enabled: Boolean(token),
    retry: false,
    gcTime: 0,
  });
}

/** Lời mời email gửi tới tài khoản của mình (p3-04 §13.3) — chỉ có khi email ĐÃ XÁC MINH. */
export function useMyInvitations() {
  return useQuery({
    queryKey: invitationKeys.mine(),
    queryFn: () => invitationsService.mine(),
    staleTime: 15_000,
  });
}

/** Chấp nhận theo id: nhóm mới hiện trong tab "Nhóm", dòng vừa nhận rời danh sách. */
export function useAcceptMyInvitation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (invitationId: string) => invitationsService.acceptMine(invitationId),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: invitationKeys.mine() });
      void queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      void queryClient.invalidateQueries({ queryKey: memberKeys.listAll(result.workspaceId) });
    },
    // 404/410: lời mời đã đổi (thu hồi/hết hạn) — tải lại để dòng đó biến mất.
    onError: () => void queryClient.invalidateQueries({ queryKey: invitationKeys.mine() }),
  });
}

/**
 * `onSuccess`: xoá `pendingInvite` (đã dùng xong), mời `workspaces.*` tải lại
 * (nhóm mới vào hiện ngay trong tab "Nhóm") và danh sách thành viên nhóm đó.
 */
export function useAcceptInvitation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (token: string) => invitationsService.accept(token),
    onSuccess: async (result) => {
      await pendingInviteStore.clear();
      void queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      void queryClient.invalidateQueries({ queryKey: memberKeys.listAll(result.workspaceId) });
      // Lời mời vừa nhận (qua link e-mail) vẫn nằm trong "Lời mời của tôi" nếu không làm mới danh sách đó.
      void queryClient.invalidateQueries({ queryKey: invitationKeys.mine() });
    },
  });
}
