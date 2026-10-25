import { apiClient } from '@/core/api/client';
import { unwrapData } from '@/core/api/unwrap';

import {
  invitationAcceptPath,
  invitationByTokenPath,
  invitationResendPath,
  invitationRevokePath,
  myInvitationAcceptPath,
  myInvitationsPath,
  workspaceGuestInvitationsPath,
  workspaceInvitationsPath,
} from './invitations.api';
import type {
  AcceptInvitationResult,
  InvitationDto,
  InvitationListPage,
  InvitationPreview,
  InvitationStatus,
  InviteGuestPayload,
  InviteMembersPayload,
  InviteMembersResult,
  MyInvitationDto,
} from './invitations.types';

export const invitationsService = {
  /** Đọc thẳng `response.data` để giữ `meta` cursor (cùng lý do `invitesService.list`). */
  async list(
    workspaceId: string,
    status: InvitationStatus,
    cursor: string | undefined,
    limit = 20,
  ): Promise<InvitationListPage> {
    const response = await apiClient.get<{ data: InvitationDto[]; meta: InvitationListPage['meta'] }>(
      workspaceInvitationsPath(workspaceId),
      { params: { status, cursor, limit } },
    );
    return { items: response.data.data, meta: response.data.meta };
  },

  /**
   * `skipErrorToast`: 429 hiện NGAY TRONG form (đếm ngược) và lỗi theo chip —
   * toast tự tắt sau 4 giây, người dùng đang sửa danh sách email thì mất lỗi.
   * `idempotencyKey` sinh MỖI LẦN MỞ form (app.md §4), giữ nguyên tới khi gửi được.
   */
  async inviteMembers(
    workspaceId: string,
    payload: InviteMembersPayload,
    idempotencyKey: string,
  ): Promise<InviteMembersResult> {
    const response = await apiClient.post<InviteMembersResult>(
      workspaceInvitationsPath(workspaceId),
      payload,
      { headers: { 'Idempotency-Key': idempotencyKey }, skipErrorToast: true },
    );
    return unwrapData<InviteMembersResult>(response);
  },

  async inviteGuest(
    workspaceId: string,
    payload: InviteGuestPayload,
    idempotencyKey: string,
  ): Promise<InvitationDto> {
    const response = await apiClient.post<InvitationDto>(
      workspaceGuestInvitationsPath(workspaceId),
      payload,
      { headers: { 'Idempotency-Key': idempotencyKey }, skipErrorToast: true },
    );
    return unwrapData<InvitationDto>(response);
  },

  async revoke(invitationId: string): Promise<InvitationDto> {
    const response = await apiClient.post<InvitationDto>(invitationRevokePath(invitationId), undefined, {
      skipErrorToast: true,
    });
    return unwrapData<InvitationDto>(response);
  },

  /** Cooldown 12 giờ phía BE → `RATE_003`. */
  async resend(invitationId: string): Promise<InvitationDto> {
    const response = await apiClient.post<InvitationDto>(invitationResendPath(invitationId), undefined, {
      skipErrorToast: true,
    });
    return unwrapData<InvitationDto>(response);
  },

  /** `optionalAuth` — gọi được cả khi chưa đăng nhập. `skipErrorToast`: 410/404 là NỘI DUNG màn, không phải toast. */
  async preview(token: string): Promise<InvitationPreview> {
    const response = await apiClient.get<InvitationPreview>(invitationByTokenPath(token), {
      skipErrorToast: true,
    });
    return unwrapData<InvitationPreview>(response);
  },

  /** Chỉ lời mời PENDING còn hạn khớp email đã xác minh; email chưa xác minh ⇒ `[]` (không lỗi). */
  async mine(): Promise<MyInvitationDto[]> {
    const response = await apiClient.get<MyInvitationDto[]>(myInvitationsPath());
    return unwrapData<MyInvitationDto[]>(response);
  },

  /**
   * Cùng luật với `accept(token)` (INV_008/010/011; luôn 200 `membership.status: 'ACTIVE'` — lời mời email không qua duyệt, xem
   * `AcceptInvitationResult`) — `skipErrorToast` vì lỗi là NỘI DUNG dòng, không phải toast tự tắt.
   */
  async acceptMine(invitationId: string): Promise<AcceptInvitationResult> {
    const response = await apiClient.post<AcceptInvitationResult>(
      myInvitationAcceptPath(invitationId),
      undefined,
      { skipErrorToast: true },
    );
    return unwrapData<AcceptInvitationResult>(response);
  },

  async accept(token: string): Promise<AcceptInvitationResult> {
    const response = await apiClient.post<AcceptInvitationResult>(invitationAcceptPath(token), undefined, {
      skipErrorToast: true,
    });
    return unwrapData<AcceptInvitationResult>(response);
  },
};
