import type { MembershipWithUser } from "../repositories/membership.repository.interface";
import type { MemberRow, MemberCard, MemberActions, AdminMemberRow } from "../entities/member.interface";
import type { PresenceStateValue } from "../entities/member.interface";
import { NO_CONTACT_ABILITY, type MemberContactAbility } from "../../../shared/ports/member-contact.port";
import { avatarUrlOf } from "../../../shared/media";
import { outranks } from "./member-rank.policy";

/** OWNER/ADMIN mới thấy hạn của khách (be.md p3-04 §6 `member:updated.expiresAt`). */
function canSeeGuestExpiry(viewerRole: MemberRow["role"] | undefined): boolean {
  return viewerRole === "OWNER" || viewerRole === "ADMIN";
}

/**
 * `avatarUrl` = URL ảnh hiển thị TUYỆT ĐỐI ký sẵn dựng từ `User.avatarAssetId` (đã nạp cùng truy vấn user của repository) —
 * client dùng thẳng làm nguồn ảnh; chưa đặt ảnh/tài khoản đã ẩn danh hoá → `null`.
 */
export function toMemberRow(
  row: MembershipWithUser,
  viewerId: string,
  presence: PresenceStateValue,
  viewerRole?: MemberRow["role"]
): MemberRow {
  return {
    userId: row.user.id,
    name: row.user.name,
    displayName: row.membership.displayName,
    avatarUrl: avatarUrlOf(row.user.avatarAssetId),
    role: row.membership.role,
    status: row.membership.status,
    joinedAt: row.membership.joinedAt,
    presence,
    isMe: row.user.id === viewerId,
    ...(row.membership.role === "GUEST" && canSeeGuestExpiry(viewerRole) && { expiresAt: row.membership.expiresAt }),
    ...(row.membership.displayTag && { displayTag: row.membership.displayTag }),
  };
}

/**
 * `canMessage`/`canCall` do SERVER tính qua `MemberContactPort` (điều kiện nhắn 1-1 D-16 + chặn + luật khách của `conversations`, cờ `voice` cho gọi) và
 * truyền vào đây; không truyền (vd hàm chỉ dựng quyền quản trị) = `false` — client không bao giờ tự suy. Các quyền quản trị (`canChangeRole/canRemove/canBan`)
 * tính tại chỗ từ thứ bậc vai trò.
 */
export function buildMemberActions(
  viewerRole: MemberRow["role"],
  target: MembershipWithUser,
  viewerId: string,
  contact: MemberContactAbility = NO_CONTACT_ABILITY
): MemberActions {
  const isSelf = target.user.id === viewerId;
  const viewerOutranksTarget = !isSelf && outranks(viewerRole, target.membership.role);
  return {
    canMessage: contact.canMessage,
    canCall: contact.canCall,
    canChangeRole: !isSelf && viewerRole === "OWNER" && target.membership.role !== "OWNER",
    canRemove: viewerOutranksTarget,
    canBan: viewerOutranksTarget,
  };
}

export function toMemberCard(
  row: MembershipWithUser,
  viewerId: string,
  viewerRole: MemberRow["role"],
  presence: PresenceStateValue,
  guestChannelIds?: string[],
  contact?: MemberContactAbility
): MemberCard {
  const guestForAdmin = row.membership.role === "GUEST" && canSeeGuestExpiry(viewerRole);
  return {
    ...toMemberRow(row, viewerId, presence, viewerRole),
    actions: buildMemberActions(viewerRole, row, viewerId, contact),
    // `version` = `expiryVersion` (WorkspaceMembership không có trường `version` riêng) — `expectedVersion` của `PATCH …/guest`.
    ...(guestForAdmin && { version: row.membership.expiryVersion ?? 0, guestChannelIds: guestChannelIds ?? [] }),
  };
}

export function toAdminMemberRow(row: MembershipWithUser, includeEmail: boolean): AdminMemberRow {
  return {
    user: { id: row.user.id, name: row.user.name, ...(includeEmail && { email: row.user.email }) },
    role: row.membership.role,
    status: row.membership.status,
    joinedAt: row.membership.joinedAt,
    invitedBy: row.membership.invitedBy,
    expiresAt: row.membership.expiresAt,
    banReason: row.membership.banReason,
    requestedAt: row.membership.requestedAt ?? null,
  };
}
