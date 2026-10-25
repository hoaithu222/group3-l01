import { LIMITS } from "../../../core/constants/limits";
import type { WorkspaceInvitation } from "../entities/invitation.interface";

export { DEFAULT_GUEST_CONFIG, resolveGuestPolicy, type GuestConfig } from "../../../core/constants/guest-policy";

/** `lowercase + trim` — KHÔNG bỏ dấu chấm gmail (be.md §2 `normalizedEmail`). */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** "lan@gmail.com" → "l***@gmail.com" — gợi ý CHE cho màn chấp nhận và bảng admin (không lộ địa chỉ đầy đủ). */
export function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "***";
  return `${email.slice(0, 1)}***${email.slice(at)}`;
}

/** Khoá "một lời mời PENDING/email/nhóm" (`WorkspaceInvitation.pendingKey`, unique). */
export function pendingKeyFor(workspaceId: string, normalizedEmail: string): string {
  return `${workspaceId}:${normalizedEmail}`;
}

/** Khoá thay thế khi rời PENDING — không null, vẫn unique (quy ước Mongo: null trùng null). */
export function doneKeyFor(invitationId: string): string {
  return `done:${invitationId}`;
}

export type EmailMismatchReason = "EMAIL_MISMATCH" | "EMAIL_NOT_VERIFIED";

/**
 * be.md §5.3 bước 2 — chấp nhận cần tài khoản có email ĐÃ XÁC MINH trùng `normalizedEmail`.
 * Khác email → `EMAIL_MISMATCH` (kể cả chưa xác minh — hướng dẫn "đăng nhập đúng tài khoản" vẫn đúng);
 * đúng email nhưng chưa xác minh → `EMAIL_NOT_VERIFIED`.
 */
export function checkEmailAccess(
  user: { email: string; emailVerified: boolean },
  invitation: Pick<WorkspaceInvitation, "normalizedEmail">
): EmailMismatchReason | null {
  if (normalizeEmail(user.email) !== invitation.normalizedEmail) return "EMAIL_MISMATCH";
  return user.emailVerified ? null : "EMAIL_NOT_VERIFIED";
}

/** PENDING + chưa quá hạn. `EXPIRED` được set LƯỜI (lúc đọc/chấp nhận), nên PENDING quá hạn vẫn coi là không dùng được. */
export function isInvitationUsable(invitation: Pick<WorkspaceInvitation, "status" | "expiresAt">, now: Date): boolean {
  return invitation.status === "PENDING" && invitation.expiresAt > now;
}

/** Hạn khách = `now + days` ngày (giờ UTC). */
export function guestExpiryFrom(now: Date, days: number): Date {
  return new Date(now.getTime() + days * 24 * 3600_000);
}

/** Hạn của lời mời email (`LIMITS.invitation.expiresDays`). */
export function invitationExpiryFrom(now: Date): Date {
  return new Date(now.getTime() + LIMITS.invitation.expiresDays * 24 * 3600_000);
}
