import type { AuthUser } from "../../../core/types/express";
import { decodeCursor, encodeCursor } from "../../../core/utils/cursor";
import { offerClosedKey } from "../domain/company-keys";
import { offerFromStatuses } from "../domain/state-machines";
import type { DeclineDto, MyOffersQuery } from "../dtos";
import type { JobOffer } from "../entities/recruiter.interface";
import type { TxHandle } from "../repositories/tx";
import { RECRUITER_NOTIFICATION_TYPES } from "../notifications/recruiter.notification-types";
import { OfferViews } from "./offer-views";
import { offerEventRow } from "./recruiter-outbox-rows";
import type { StudentOfferDetail, StudentOfferItem } from "./recruiter.presenter";
import type { RecruiterDeps } from "./recruiter.deps";
import { recruiterErrors } from "./recruiter.errors";

/**
 * Lời mời phía SINH VIÊN (be.md §4/§5): hộp thư, đọc (SENT → READ lần đầu), Quan tâm (tuỳ chọn chia sẻ email — ảnh chụp lúc bấm), Từ chối khéo (kèm mã lý do). Mọi thao tác chỉ trên lời mời
 * GỬI CHO CHÍNH MÌNH (người khác → 404 trung tính). Chuyển trạng thái bằng CAS theo trạng thái nguồn (`transition`): hai lần bấm/hai thiết bị → đúng một bên thắng, bên kia `RECR_009`.
 * Công ty đang tạm ngưng: vẫn ĐỌC và TỪ CHỐI được, KHÔNG "Quan tâm" được (`RECR_002`).
 */
export class StudentOfferService {
  readonly views: OfferViews;

  constructor(private readonly d: RecruiterDeps) {
    this.views = new OfferViews(d);
  }

  async list(user: AuthUser, q: MyOffersQuery): Promise<{ data: StudentOfferItem[]; meta: { nextCursor: string | null; hasMore: boolean; limit: number } }> {
    const before = q.cursor ? (decodeCursor(q.cursor) ?? undefined) : undefined;
    const rows = await this.d.offers.listForStudent(user.id, { status: q.status, before, take: q.limit + 1 });
    const page = rows.slice(0, q.limit);
    const last = page[page.length - 1];
    const hasMore = rows.length > q.limit;
    return { data: await this.views.studentItems(page), meta: { nextCursor: hasMore && last ? encodeCursor(last.sentAt, last.id) : null, hasMore, limit: q.limit } };
  }

  /** `GET /me/offers/:offerId` — lần đầu mở (SENT) → READ và báo HR (`offer:updated`). */
  async get(user: AuthUser, offerId: string): Promise<StudentOfferDetail> {
    let offer = await this.mine(user, offerId);
    if (offer.status === "SENT") {
      const now = this.d.now();
      const read = await this.d.tx.run(async (tx) => {
        const u = await this.d.offers.transition(offer.id, offerFromStatuses("read"), { status: "READ", readAt: now }, tx);
        if (u) await this.d.outbox.add(tx, offerEventRow("responded", u, now));
        return u;
      });
      // `null` = đã có thiết bị khác chuyển (đọc/trả lời) — đọc lại bản mới nhất.
      offer = read ?? (await this.mine(user, offerId));
    }
    return this.views.studentDetail(offer, user);
  }

  async interested(user: AuthUser, offerId: string, shareEmail: boolean): Promise<StudentOfferDetail> {
    const offer = await this.mine(user, offerId);
    const company = await this.d.companies.findById(offer.companyId);
    if (!company) throw recruiterErrors.offerNotFound();
    if (company.status !== "APPROVED") throw recruiterErrors.notApproved();
    const email = shareEmail ? ((await this.d.directory.findUser(user.id))?.email ?? null) : null;
    const now = this.d.now();
    const updated = await this.d.tx.run(async (tx) => {
      const u = await this.d.offers.transition(offer.id, offerFromStatuses("interested"), { status: "INTERESTED", respondedAt: now, sharedEmail: email }, tx);
      if (u) await this.respondedEffects(tx, u, company.name, now);
      return u;
    });
    if (!updated) throw recruiterErrors.invalidState({ status: (await this.mine(user, offerId)).status });
    return this.views.studentDetail(updated, user);
  }

  async decline(user: AuthUser, offerId: string, dto: DeclineDto): Promise<StudentOfferDetail> {
    const offer = await this.mine(user, offerId);
    const company = await this.d.companies.findById(offer.companyId);
    const now = this.d.now();
    const updated = await this.d.tx.run(async (tx) => {
      const u = await this.d.offers.transition(
        offer.id,
        offerFromStatuses("decline"),
        { status: "DECLINED", declineReason: dto.reason, respondedAt: now, threadLocked: true, activeKey: offerClosedKey(offer.id) },
        tx
      );
      if (u) await this.respondedEffects(tx, u, company?.name ?? "", now);
      return u;
    });
    if (!updated) throw recruiterErrors.invalidState({ status: (await this.mine(user, offerId)).status });
    return this.views.studentDetail(updated, user);
  }

  // ── nội bộ ──────────────────────────────────────────────────────────────────

  /** Outbox `job-offer.responded` (socket cho HR) + thông báo cho HR đã gửi (chỉ id + trạng thái, không nội dung). */
  private async respondedEffects(tx: TxHandle, u: JobOffer, companyName: string, now: Date): Promise<void> {
    await this.d.outbox.add(tx, offerEventRow("responded", u, now));
    await this.d.notifier.notify(tx, {
      type: RECRUITER_NOTIFICATION_TYPES.OFFER_RESPONDED,
      scope: null,
      actorId: u.studentId,
      source: { type: "JobOffer", id: `job-offer:${u.id}:responded:v${u.version}` },
      refs: { offerId: u.id, companyId: u.companyId, companyName, status: u.status },
      recipients: [{ userId: u.recruiterId }],
      dedupeKey: `job-offer.responded:offer:${u.id}:v${u.version}`,
    });
  }

  private async mine(user: AuthUser, offerId: string): Promise<JobOffer> {
    const o = await this.d.offers.findById(offerId);
    if (!o || o.studentId !== user.id) throw recruiterErrors.offerNotFound();
    return o;
  }
}
