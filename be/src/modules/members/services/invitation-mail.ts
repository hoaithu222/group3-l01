import { encryptAesGcm, decryptAesGcm } from "../../../core/utils/crypto";

/**
 * Token lời mời KHÔNG được nằm nguyên văn trong `OutboxEvent.payload` (Mongo) hay job BullMQ. be.md §5.3 đề xuất
 * `redactAfterDispatch` nhưng relay hiện tại CHƯA hỗ trợ → mã hoá bằng `ENCRYPTION_KEY` (AES-256-GCM) trong payload; chỉ
 * consumer `invitation.mail` giải mã ngay lúc dựng email.
 */
export function sealInvitationToken(token: string): string {
  return encryptAesGcm(token);
}

export function openInvitationToken(sealed: string): string {
  return decryptAesGcm(sealed);
}

export const INVITATION_MAIL_JOB = "invitation.mail";

/** `invitation.mail:invitation:<id>:s<sendCount>` — 1 dòng outbox/lần gửi (tạo + mỗi lần gửi lại). */
export function invitationMailKey(invitationId: string, sendCount: number): string {
  return `${INVITATION_MAIL_JOB}:invitation:${invitationId}:s${sendCount}`;
}

export interface InvitationMailPayload {
  invitationId: string;
  sendCount: number;
  tokenSealed: string;
  /** "created" | "resent" — chỉ để quan sát. */
  event: "created" | "resent";
}
