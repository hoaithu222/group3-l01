import type { WorkspaceRoleValue } from "./member.interface";

/**
 * Khai ĐỘC LẬP với `modules/workspaces` (không import chéo) — cùng giá trị Prisma `InvitationStatus`/`JoinPolicy`.
 * Lời mời ĐÍCH DANH theo email (p3-04) — KHÁC `InviteLink` (`invite.interface.ts`, p1-02): link ai cầm cũng dùng được.
 */
export const INVITATION_STATUSES = ["PENDING", "ACCEPTED", "REVOKED", "EXPIRED"] as const;
export type InvitationStatusValue = (typeof INVITATION_STATUSES)[number];

export const INVITATION_ROLES = ["MEMBER", "GUEST"] as const;
export type InvitationRoleValue = (typeof INVITATION_ROLES)[number];

export type JoinPolicyValue = "OPEN" | "APPROVAL";

export interface WorkspaceInvitation {
  id: string;
  workspaceId: string;
  /** Hiển thị cho người mời (giữ nguyên chữ hoa/thường người mời gõ). */
  email: string;
  /** lowercase + trim — khoá so khớp với `User.email` đã xác minh. */
  normalizedEmail: string;
  role: InvitationRoleValue;
  guestChannelIds: string[];
  guestDays: number | null;
  message: string | null;
  tokenHash: string;
  invitedBy: string;
  status: InvitationStatusValue;
  /** PENDING → `<workspaceId>:<normalizedEmail>`; rời PENDING → `done:<id>` (không bao giờ null). */
  pendingKey: string;
  expiresAt: Date;
  lastSentAt: Date;
  sendCount: number;
  acceptedBy: string | null;
  acceptedAt: Date | null;
  revokedBy: string | null;
  revokedAt: Date | null;
  createdAt: Date;
}

/** `InvitationDto` — model bỏ `tokenHash`/`pendingKey`/`normalizedEmail`. KHÔNG bao giờ có token. */
export interface InvitationDto {
  id: string;
  workspaceId: string;
  email: string;
  role: InvitationRoleValue;
  guestChannelIds: string[];
  guestDays: number | null;
  message: string | null;
  status: InvitationStatusValue;
  invitedBy: string;
  expiresAt: Date;
  lastSentAt: Date;
  sendCount: number;
  acceptedAt: Date | null;
  createdAt: Date;
}

/** `Workspace.guestPolicy` (JSON) đã chuẩn hoá — nhóm chưa thiết lập → mặc định nền tảng. */
export interface GuestPolicy {
  enabled: boolean;
  maxGuests: number;
  maxDays: number;
  memberCanInvite: boolean;
}

export type InviteSkipReason = "ALREADY_MEMBER" | "PENDING_EXISTS" | "BANNED";

export interface InviteMembersResult {
  created: InvitationDto[];
  skipped: Array<{ email: string; reason: InviteSkipReason }>;
}

/** `GET /invitations/by-token/:token` (be.md §4) — người xem chưa chắc là thành viên nên chỉ lộ tối thiểu. */
export interface InvitationPreview {
  workspace: { name: string; avatarUrl: string | null };
  invitedBy: { name: string };
  role: InvitationRoleValue;
  /** Chỉ khi GUEST: tên các kênh sẽ vào (không lộ id). */
  channels?: Array<{ name: string }>;
  guestDays: number | null;
  expiresAt: Date;
  /** "l***@gmail.com". */
  emailHint: string;
  status: InvitationStatusValue;
}

export interface AcceptInvitationResult {
  workspaceId: string;
  membership: { role: WorkspaceRoleValue; status: "ACTIVE" | "PENDING"; expiresAt: Date | null };
  /** Kênh chỉ định bị bỏ qua lúc chấp nhận (đã lưu trữ/không còn) — be.md §5.3 bước 4. */
  skippedChannels?: Array<{ channelId: string; reason: "NOT_FOUND" | "ARCHIVED" }>;
}

/** Dòng `GET /workspaces/:id/join-requests` (be.md §4). */
export interface JoinRequestRow {
  user: { id: string; name: string; avatarUrl: string | null };
  requestMessage: string | null;
  requestedAt: Date;
  via: "INVITE_LINK";
}
