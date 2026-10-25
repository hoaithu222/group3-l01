import { env } from "../../../core/config";
import { buildIcs, type IcsMethod } from "../../../infrastructure/mail/ics/ics-builder";
import type { MailOptions } from "../../../infrastructure/mail";
import type { MeetingEntity } from "../entities/meeting.interface";
import type { MeetingDeps } from "./meeting.deps";

export interface MailPort {
  sendRaw(options: MailOptions): Promise<void>;
}

/** `UID` ổn định cho mọi lần cập nhật (lịch khách gộp về ĐÚNG MỘT mục). */
export const meetingIcsUid = (meetingId: string): string => `${meetingId}@superapp.vcijsc.com`;

const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** Ngày giờ theo múi giờ CỦA cuộc họp + nhãn múi giờ ("Thứ Hai, 15/06/2026 09:00 – 10:00 (Asia/Ho_Chi_Minh)"). */
export function formatMeetingTime(m: Pick<MeetingEntity, "startAt" | "endAt" | "timezone">): string {
  const day = new Intl.DateTimeFormat("vi-VN", { timeZone: m.timezone, weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" }).format(m.startAt);
  const hm = new Intl.DateTimeFormat("vi-VN", { timeZone: m.timezone, hour: "2-digit", minute: "2-digit", hour12: false });
  return `${day} ${hm.format(m.startAt)} – ${hm.format(m.endAt)} (${m.timezone})`;
}

/** Dựng nội dung `.ics` + email mời/cập nhật/huỷ cho 1 cuộc họp (be.md §5.7 `meeting-ics.service.ts`). */
export class MeetingIcsService {
  constructor(
    private readonly d: MeetingDeps,
    private readonly mail: MailPort,
    private readonly cfg: { webBaseUrl: string; organizerEmail: string } = {
      webBaseUrl: (env.PUBLIC_WEB_BASE_URL ?? env.FRONTEND_URL).replace(/\/+$/, ""),
      organizerEmail: env.MAIL_ICS_ORGANIZER_EMAIL ?? env.SMTP_FROM ?? env.SMTP_USER ?? "no-reply@superapp.vcijsc.com",
    }
  ) {}

  meetingUrl(m: Pick<MeetingEntity, "code">): string {
    return `${this.cfg.webBaseUrl}/m/${m.code}`;
  }

  /** VCALENDAR cho 1 cuộc họp. Mô tả chỉ có link `/m/<mã>` + agenda (link nền tảng ngoài để trong `URL`/`LOCATION` khi có). */
  build(m: MeetingEntity, method: IcsMethod, opts: { sequence?: number; attendeeEmails?: string[]; now?: Date } = {}): string {
    const link = this.meetingUrl(m);
    const description = [m.agenda ?? "", `Mở cuộc họp: ${link}`].filter(Boolean).join("\n\n");
    return buildIcs({
      method,
      uid: meetingIcsUid(m.id),
      sequence: opts.sequence ?? m.version,
      summary: m.title,
      description,
      location: m.location ?? (m.platform !== "INTERNAL" ? (m.externalUrl ?? undefined) : link),
      url: m.platform !== "INTERNAL" && m.externalUrl ? m.externalUrl : link,
      startAt: m.startAt,
      endAt: m.endAt,
      timezone: m.timezone,
      organizer: { email: this.cfg.organizerEmail, name: "Super App" },
      attendeeEmails: opts.attendeeEmails,
      now: opts.now,
    });
  }

  /** `.ics` cho nút "Thêm vào lịch" ở app (`GET /meetings/:id/ics`) — `METHOD:PUBLISH`. */
  buildPublish(m: MeetingEntity): string {
    return this.build(m, "PUBLISH");
  }

  /**
   * Gửi email cho 1 người (job `meeting.ics-send`, một job/người nên retry không gửi trùng người khác). `REQUEST` chỉ khi người
   * đó CÒN là người tham dự và cuộc họp còn hiệu lực; `CANCEL` cho huỷ/bị xoá khỏi danh sách. Trả `false` khi bỏ qua.
   */
  async sendOne(meetingId: string, userId: string, kind: "REQUEST" | "CANCEL", sequence: number, updated = false): Promise<boolean> {
    const meeting = await this.d.repo.findById(meetingId, { includeDeleted: true });
    if (!meeting) return false;
    if (kind === "REQUEST") {
      const attendee = await this.d.repo.findAttendee(meetingId, userId);
      if (!attendee || attendee.removedAt || meeting.status === "CANCELLED" || meeting.deletedAt) return false;
    }
    const user = (await this.d.dir.getUsers([userId])).get(userId);
    if (!user?.email) return false;

    const ics = this.build(meeting, kind, { sequence, attendeeEmails: [user.email] });
    const link = this.meetingUrl(meeting);
    const when = formatMeetingTime(meeting);
    const subject = kind === "CANCEL" ? `Huỷ cuộc họp: ${meeting.title}` : `${updated ? "Cập nhật cuộc họp" : "Lời mời họp"}: ${meeting.title}`;
    const headline = kind === "CANCEL" ? "Cuộc họp đã bị huỷ hoặc bạn không còn trong danh sách tham dự." : updated ? "Cuộc họp đã được cập nhật." : "Bạn được mời tham dự cuộc họp.";
    const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#333">
<h2>${esc(meeting.title)}</h2><p>${esc(headline)}</p>
<p><b>Thời gian:</b> ${esc(when)}</p>${meeting.location ? `<p><b>Địa điểm:</b> ${esc(meeting.location)}</p>` : ""}
${kind === "REQUEST" ? `<p><a href="${esc(link)}" style="display:inline-block;padding:10px 20px;background:#4f46e5;color:#fff;text-decoration:none;border-radius:6px">Mở cuộc họp</a></p>` : ""}</div>`;
    const text = [meeting.title, headline, `Thời gian: ${when}`, kind === "REQUEST" ? `Mở cuộc họp: ${link}` : ""].filter(Boolean).join("\n");
    await this.mail.sendRaw({ to: user.email, subject, html, text, icalEvent: { method: kind, content: ics, filename: "invite.ics" } });
    return true;
  }
}
