/**
 * Đường dẫn endpoint lời mời ĐÍCH DANH theo email + khách + duyệt tham gia
 * (be.md p3-04 §4). Tách khỏi `invites.api.ts` (link mời p1-02): hai thứ khác
 * hẳn nhau — link ai cầm cũng dùng được, lời mời email gắn với MỘT địa chỉ.
 *
 * ⛔ `token` nằm NGAY TRONG URL (`/invitations/by-token/:token`) — `core/api/client.ts`
 * che nó khỏi log (`sanitizeLogUrl`), đừng ghép URL này vào chỗ khác có ghi log.
 */
export function workspaceInvitationsPath(workspaceId: string): string {
  return `/workspaces/${workspaceId}/invitations`;
}

export function workspaceGuestInvitationsPath(workspaceId: string): string {
  return `/workspaces/${workspaceId}/guests/invitations`;
}

export function invitationRevokePath(invitationId: string): string {
  return `/invitations/${invitationId}/revoke`;
}

export function invitationResendPath(invitationId: string): string {
  return `/invitations/${invitationId}/resend`;
}

export function invitationByTokenPath(token: string): string {
  return `/invitations/by-token/${token}`;
}

export function invitationAcceptPath(token: string): string {
  return `${invitationByTokenPath(token)}/accept`;
}

/** `GET` — lời mời PENDING khớp email ĐÃ XÁC MINH của tôi (BE trả `[]` nếu email chưa xác minh). */
export function myInvitationsPath(): string {
  return '/me/invitations';
}

/** `POST` — chấp nhận theo id (không cần token); người khác/email không khớp → 404 trung tính. */
export function myInvitationAcceptPath(invitationId: string): string {
  return `${myInvitationsPath()}/${invitationId}/accept`;
}

/** `PATCH` hạn + kênh chỉ định của một khách (OWNER/ADMIN). */
export function guestMemberPath(workspaceId: string, userId: string): string {
  return `/workspaces/${workspaceId}/members/${userId}/guest`;
}

export function joinRequestsPath(workspaceId: string): string {
  return `/workspaces/${workspaceId}/join-requests`;
}

export function joinRequestDecisionPath(
  workspaceId: string,
  userId: string,
  decision: 'approve' | 'reject',
): string {
  return `${joinRequestsPath(workspaceId)}/${userId}/${decision}`;
}

/** Kênh của nhóm — bộ chọn kênh chỉ định cho khách. Khai ĐỘC LẬP với `channels` (không import chéo feature). */
export function workspaceChannelsForGuestPath(workspaceId: string): string {
  return `/workspaces/${workspaceId}/channels`;
}
