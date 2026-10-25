import { registerJob } from "../../../infrastructure/queue";
import { logger } from "../../../infrastructure/logger";
import { mailService } from "../../../infrastructure/mail";
import { env } from "../../../core/config";
import { PrismaInvitationRepository } from "../repositories";
import { INVITATION_MAIL_JOB, openInvitationToken, type InvitationMailPayload } from "../services/invitation-mail";
import { maskEmail } from "../services/invitation-rules";

/**
 * `invitation.mail` (queue `notifications`, be.md p3-04 §5.3/§7) — outbox `workspace-invitation.created|resent` → dựng email
 * mời rồi đẩy vào hàng đợi mail hiện có (`mailService.enqueueMail` → `mail.send`, retry 5 lần) — KHÔNG gửi trực tiếp.
 *
 * Token nằm trong payload dưới dạng MÃ HOÁ (`tokenSealed`); giải mã ngay tại đây và chỉ đưa vào URL của email. Không log
 * token/email đầy đủ. Bỏ qua khi lời mời không còn PENDING hoặc đã được gửi lại (`sendCount` lệch — token cũ vô hiệu).
 */
const invitations = new PrismaInvitationRepository();

const ROLE_LABEL = { MEMBER: "thành viên", GUEST: "khách" } as const;

registerJob("notifications", INVITATION_MAIL_JOB, async (job) => {
  const payload = job.data as InvitationMailPayload;
  const invitation = await invitations.findById(payload.invitationId);
  if (!invitation || invitation.status !== "PENDING" || invitation.sendCount !== payload.sendCount) {
    logger.info("[invitation.mail] Bỏ qua — lời mời không còn hiệu lực hoặc đã có lần gửi mới", { invitationId: payload.invitationId });
    return;
  }

  const [workspace, inviter, channels] = await Promise.all([
    invitations.findWorkspace(invitation.workspaceId),
    invitations.findUserById(invitation.invitedBy),
    invitation.role === "GUEST" ? invitations.listChannels(invitation.workspaceId, invitation.guestChannelIds) : Promise.resolve([]),
  ]);
  if (!workspace || workspace.status === "ARCHIVED") return;

  const token = openInvitationToken(payload.tokenSealed);
  const inviterName = inviter?.name ?? "Một thành viên";
  const roleLabel = ROLE_LABEL[invitation.role];
  const summary =
    invitation.role === "GUEST"
      ? `${inviterName} mời bạn tham gia nhóm "${workspace.name}" với tư cách khách trong ${invitation.guestDays ?? 0} ngày.`
      : `${inviterName} mời bạn tham gia nhóm "${workspace.name}" với tư cách ${roleLabel}.`;

  await mailService.enqueueMail(
    "workspace-invitation",
    invitation.email,
    {
      subject: `Lời mời tham gia nhóm "${workspace.name}"`,
      summary,
      // Chỉ tên kênh ĐÃ CHỈ ĐỊNH cho chính người nhận (không lộ kênh riêng tư nào khác).
      channels: channels.length > 0 ? `Kênh bạn được vào: ${channels.map((c) => c.name).join(", ")}.` : "",
      message: invitation.message ? `Lời nhắn: ${invitation.message}` : "",
      expires: `Lời mời có hiệu lực đến ${invitation.expiresAt.toLocaleDateString("vi-VN", { timeZone: env.CRON_TZ })}.`,
      url: `${env.PUBLIC_APP_LINK_BASE}/invite/e/${token}`,
    },
    `invitation:${invitation.id}:s${invitation.sendCount}`
  );
  logger.info("[invitation.mail] Đã xếp email mời", { invitationId: invitation.id, to: maskEmail(invitation.email) });
});
