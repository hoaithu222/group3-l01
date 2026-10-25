import { withTransaction } from "../../../infrastructure/database";
import { notify } from "../../notifications/public";
import { ANNOUNCEMENT_NOTIFICATION_TYPES } from "../announcement.notification-types";
import type { IAnnouncementLookupRepository, IAnnouncementRepository } from "../repositories/announcement.repository.interface";
import type { ReaderIds } from "./announcement-receipts.service";

const CHUNK_SIZE = 500;

export interface AnnouncementNotifyStats {
  skipped?: "not-found" | "cancelled" | "expired" | "deadline-changed" | "message-deleted" | "no-recipients";
  candidates: number;
  notified: number;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Fan-out thông báo của yêu cầu xác nhận (job `announcement.notify`, `announcement.deadline-remind`) — chạy ở worker. Người nhận =
 * người ĐỌC ĐƯỢC kênh (tính LÚC GIAO, không lưu sẵn) trừ người yêu cầu; nhắc hạn chỉ gửi người CHƯA xác nhận. Idempotent: `notify()` bỏ
 * người đã có mục cho cùng nguồn (retry job không nhân đôi), processor kiểm lại huỷ/hết hạn/đổi hạn trước khi gửi.
 */
export class AnnouncementNotifyService {
  constructor(
    private readonly repo: IAnnouncementRepository,
    private readonly lookup: IAnnouncementLookupRepository,
    private readonly readers: ReaderIds,
    private readonly now: () => Date = () => new Date()
  ) {}

  async notifyRequired(messageId: string): Promise<AnnouncementNotifyStats> {
    const request = await this.repo.findByMessageId(messageId);
    if (!request) return { candidates: 0, notified: 0, skipped: "not-found" };
    if (request.cancelledAt) return { candidates: 0, notified: 0, skipped: "cancelled" };
    if (request.deadlineAt && request.deadlineAt <= this.now()) return { candidates: 0, notified: 0, skipped: "expired" };
    if (await this.isMessageGone(messageId)) return { candidates: 0, notified: 0, skipped: "message-deleted" };

    const recipients = (await this.readers(request.channelId)).filter((id) => id !== request.requestedBy);
    return this.send({
      type: ANNOUNCEMENT_NOTIFICATION_TYPES.REQUIRED,
      request,
      recipients,
      sourceId: `announcement.required:${request.id}`,
    });
  }

  /** Nhắc người chưa xác nhận trước hạn; `deadlineAtIso` là hạn lúc xếp lịch (đổi hạn/huỷ → bỏ qua, so-và-đổi). */
  async remind(messageId: string, deadlineAtIso: string): Promise<AnnouncementNotifyStats> {
    const request = await this.repo.findByMessageId(messageId);
    if (!request) return { candidates: 0, notified: 0, skipped: "not-found" };
    if (request.cancelledAt) return { candidates: 0, notified: 0, skipped: "cancelled" };
    if (!request.deadlineAt || request.deadlineAt.toISOString() !== deadlineAtIso) return { candidates: 0, notified: 0, skipped: "deadline-changed" };
    if (request.deadlineAt <= this.now()) return { candidates: 0, notified: 0, skipped: "expired" };
    if (await this.isMessageGone(messageId)) return { candidates: 0, notified: 0, skipped: "message-deleted" };

    const audience = (await this.readers(request.channelId)).filter((id) => id !== request.requestedBy);
    const confirmed = await this.repo.confirmedUserIds(request.id, audience);
    return this.send({
      type: ANNOUNCEMENT_NOTIFICATION_TYPES.REMINDER,
      request,
      recipients: audience.filter((id) => !confirmed.has(id)),
      // Khoá theo HẠN (giây): huỷ rồi khôi phục cùng hạn không nhắc hai lần, đổi hạn thì nhắc lại.
      sourceId: `announcement.reminder:${request.id}:${Math.floor(request.deadlineAt.getTime() / 1000)}`,
    });
  }

  private async isMessageGone(messageId: string): Promise<boolean> {
    const message = await this.lookup.findMessage(messageId);
    return !message || message.deletedAt !== null;
  }

  private async send(input: {
    type: string;
    request: { id: string; messageId: string; channelId: string; workspaceId: string; requestedBy: string; deadlineAt: Date | null };
    recipients: string[];
    sourceId: string;
  }): Promise<AnnouncementNotifyStats> {
    const { request } = input;
    if (input.recipients.length === 0) return { candidates: 0, notified: 0, skipped: "no-recipients" };
    let notified = 0;
    for (const ids of chunk(input.recipients, CHUNK_SIZE)) {
      await withTransaction((tx) =>
        notify(tx, {
          type: input.type,
          actorId: request.requestedBy,
          scope: { type: "CHANNEL", id: request.channelId },
          workspaceId: request.workspaceId,
          source: { type: "Announcement", id: input.sourceId },
          refs: {
            workspaceId: request.workspaceId,
            channelId: request.channelId,
            messageId: request.messageId,
            ...(request.deadlineAt && { deadlineAt: request.deadlineAt.toISOString() }),
          },
          recipients: ids.map((userId) => ({ userId })),
          // Một `Notification` cho cả yêu cầu; `notify()` bỏ người đã có mục nên các lô/lần chạy lại không nhân đôi.
          dedupeKey: input.sourceId,
        })
      );
      notified += ids.length;
    }
    return { candidates: input.recipients.length, notified };
  }
}
