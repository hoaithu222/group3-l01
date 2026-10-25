import type { AuthUser } from "../../../core/types/express";
import { decodeCursor, encodeCursor } from "../../../core/utils/cursor";
import { isThreadOpen } from "../domain/state-machines";
import type { OfferMessageDto, OfferMessagesQuery } from "../dtos";
import type { Company, JobOffer, JobOfferMessage, OfferMessageSide } from "../entities/recruiter.interface";
import { RECRUITER_NOTIFICATION_TYPES } from "../notifications/recruiter.notification-types";
import { UniqueViolationError } from "../repositories/tx";
import { presentOfferMessage, type OfferMessageView } from "./recruiter.presenter";
import type { RecruiterDeps } from "./recruiter.deps";
import { recruiterErrors } from "./recruiter.errors";

interface Participant {
  offer: JobOffer;
  company: Company;
  /** Phía của người gọi: sinh viên = CANDIDATE, nhân sự công ty = COMPANY. */
  side: OfferMessageSide;
}

/**
 * Thread trao đổi trong lời mời (be.md §5 "Thread"): participant = sinh viên của lời mời HOẶC nhân sự ACTIVE của công ty (người bị gỡ mất quyền); người ngoài → 404 trung tính.
 * ĐỌC luôn được (kể cả khi khoá/tạm ngưng — bằng chứng không bị xoá). GỬI chỉ khi lời mời INTERESTED, chưa khoá (chặn/thu hồi/ẩn danh) VÀ công ty còn APPROVED → ngược lại `RECR_008`.
 * Idempotent theo `(người gửi, clientMessageId)`. Chỉ chữ. Đếm chưa đọc tách theo phía; mở thread (`list`) đặt lại chưa đọc của phía mình.
 */
export class OfferMessageService {
  constructor(private readonly d: RecruiterDeps) {}

  async list(user: AuthUser, offerId: string, q: OfferMessagesQuery): Promise<{ data: OfferMessageView[]; meta: { nextCursor: string | null; hasMore: boolean; limit: number } }> {
    const p = await this.participant(user, offerId);
    const before = q.cursor ? (decodeCursor(q.cursor) ?? undefined) : undefined;
    const rows = await this.d.messages.list(offerId, before, q.limit + 1);
    const page = rows.slice(0, q.limit);
    const last = page[page.length - 1];
    const hasMore = rows.length > q.limit;
    await this.d.offers.clearUnread(offerId, p.side);
    return { data: page.map(presentOfferMessage), meta: { nextCursor: hasMore && last ? encodeCursor(last.createdAt, last.id) : null, hasMore, limit: q.limit } };
  }

  async send(user: AuthUser, offerId: string, dto: OfferMessageDto): Promise<{ message: OfferMessageView; created: boolean }> {
    const p = await this.participant(user, offerId);
    const replay = await this.d.messages.findByClientId(user.id, dto.clientMessageId);
    if (replay) return { message: presentOfferMessage(replay), created: false };
    if (!isThreadOpen(p.offer, p.company.status)) throw recruiterErrors.threadClosed();

    const now = this.d.now();
    let message: JobOfferMessage;
    try {
      message = await this.d.tx.run(async (tx) => {
        const m = await this.d.messages.create({ id: this.d.newId(), offerId, authorId: user.id, side: p.side, content: dto.content, clientMessageId: dto.clientMessageId }, tx);
        await this.d.offers.addUnread(offerId, p.side, now, tx);
        const recipient = p.side === "COMPANY" ? p.offer.studentId : p.offer.recruiterId;
        await this.d.notifier.notify(tx, {
          type: RECRUITER_NOTIFICATION_TYPES.OFFER_MESSAGE,
          scope: null,
          actorId: user.id,
          source: { type: "JobOffer", id: `job-offer:${offerId}:message:${m.id}` },
          refs: { offerId, companyId: p.company.id },
          recipients: [{ userId: recipient }],
          dedupeKey: `job-offer.message:msg:${m.id}`,
        });
        return m;
      });
    } catch (err) {
      if (err instanceof UniqueViolationError) {
        const dup = await this.d.messages.findByClientId(user.id, dto.clientMessageId);
        if (dup) return { message: presentOfferMessage(dup), created: false };
      }
      throw err;
    }
    const memberIds = await this.d.members.activeUserIds(p.company.id);
    this.d.emitter.offerMessageCreated([p.offer.studentId, ...memberIds], { offerId, messageId: message.id, side: message.side, createdAt: message.createdAt.toISOString() });
    return { message: presentOfferMessage(message), created: true };
  }

  private async participant(user: AuthUser, offerId: string): Promise<Participant> {
    const offer = await this.d.offers.findById(offerId);
    if (!offer) throw recruiterErrors.offerNotFound();
    const company = await this.d.companies.findById(offer.companyId);
    if (!company) throw recruiterErrors.offerNotFound();
    if (offer.studentId === user.id) return { offer, company, side: "CANDIDATE" };
    const member = await this.d.members.findByCompanyUser(offer.companyId, user.id);
    if (member && member.status === "ACTIVE") return { offer, company, side: "COMPANY" };
    throw recruiterErrors.offerNotFound();
  }
}
