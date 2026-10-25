import type { InvitationDto, WorkspaceInvitation } from "../entities/invitation.interface";

/** `InvitationDto` — bỏ `tokenHash`/`pendingKey`/`normalizedEmail`; KHÔNG bao giờ có token (be.md §4). */
export function toInvitationDto(invitation: WorkspaceInvitation): InvitationDto {
  return {
    id: invitation.id,
    workspaceId: invitation.workspaceId,
    email: invitation.email,
    role: invitation.role,
    guestChannelIds: invitation.guestChannelIds,
    guestDays: invitation.guestDays,
    message: invitation.message,
    status: invitation.status,
    invitedBy: invitation.invitedBy,
    expiresAt: invitation.expiresAt,
    lastSentAt: invitation.lastSentAt,
    sendCount: invitation.sendCount,
    acceptedAt: invitation.acceptedAt,
    createdAt: invitation.createdAt,
  };
}
