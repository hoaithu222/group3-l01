import { AppError } from "../../../core/exceptions";
import { HttpStatusCode } from "../../../core/constants/http-status";
import { LIMITS } from "../../../core/constants/limits";
import type { AuthUser } from "../../../core/types/express";
import { decodeCursor, encodeCursor } from "../../../core/utils/cursor";
import { ErrorCode } from "../../../core/utils/error.codes";
import { offerClosedKey, offerOpenKey } from "../domain/company-keys";
import { offerFromStatuses } from "../domain/state-machines";
import type { CompanyOffersQuery, SendOfferDto } from "../dtos";
import type { JobOffer } from "../entities/recruiter.interface";
import { UniqueViolationError } from "../repositories/tx";
import { RECRUITER_NOTIFICATION_TYPES } from "../notifications/recruiter.notification-types";
import type { CompanyService } from "./company.service";
import { OfferViews } from "./offer-views";
import { offerEventRow, offerExpireRow } from "./recruiter-outbox-rows";
import type { CompanyOfferDetail, CompanyOfferItem } from "./recruiter.presenter";
import type { RecruiterDeps } from "./recruiter.deps";
import { recruiterErrors } from "./recruiter.errors";

const DAY_MS = 24 * 3600 * 1000;

/**
 * Lời mời phía DOANH NGHIỆP (be.md §5 "Gửi lời mời" + "Thu hồi" + "Hết hạn"). Gửi = MỘT transaction: trừ hạn mức nguyên tử → chèn `JobOffer SENT` (`activeKey` unique: mỗi cặp công
 * ty/sinh viên ≤ 1 lời mời mở) → gắn JD → outbox (`job-offer.sent`, hẹn hết hạn) → thông báo sinh viên. Mọi lý do "không gửi được" (chưa bật Open to work, bị chặn, tài khoản không hợp
 * lệ) trả CÙNG `RECR_007` — không lộ vì sao. Quyền (công ty APPROVED + nhân sự ACTIVE) đã kiểm bởi `companyScope`; service kiểm lại `APPROVED` (phòng thủ chiều sâu).
 */
export class JobOfferService {
  readonly views: OfferViews;

  constructor(
    private readonly d: RecruiterDeps,
    private readonly companies: CompanyService
  ) {
    this.views = new OfferViews(d);
  }

  async send(actor: AuthUser, companyId: string, dto: SendOfferDto, idempotencyKey?: string): Promise<{ offer: CompanyOfferDetail; created: boolean }> {
    const company = await this.companies.load(companyId);
    if (company.status !== "APPROVED") throw recruiterErrors.notApproved();
    const id = this.d.newId();
    const clientRequestId = (idempotencyKey ?? "").trim().slice(0, 100) || `gen:${id}`;

    const prior = await this.d.offers.findByRequest(actor.id, clientRequestId);
    if (prior) return { offer: await this.views.companyDetail(prior, company, actor), created: false };

    await this.assertTargetable(companyId, dto.studentId, actor.id);
    if ((await this.d.offers.openByStudentCompany(dto.studentId, companyId)).length > 0) throw recruiterErrors.openOfferExists();
    if (dto.jdAssetId) await this.assertJd(dto.jdAssetId, actor.id);

    const now = this.d.now();
    await this.companies.quota.ensure(company, now);
    let offer: JobOffer;
    try {
      offer = await this.d.tx.run(async (tx) => {
        await this.companies.quota.consume(tx, company, now);
        const created = await this.d.offers.create(
          {
            id,
            companyId,
            recruiterId: actor.id,
            studentId: dto.studentId,
            title: dto.title,
            message: dto.message,
            employmentType: dto.employmentType,
            location: dto.location ?? null,
            jdAssetId: dto.jdAssetId ?? null,
            activeKey: offerOpenKey(companyId, dto.studentId),
            clientRequestId,
            sentAt: now,
            expiresAt: new Date(now.getTime() + LIMITS.offer.expiresDays * DAY_MS),
          },
          tx
        );
        if (dto.jdAssetId) await this.d.assets.attachJd(tx, { offerId: id, assetId: dto.jdAssetId, actorId: actor.id });
        await this.d.outbox.add(tx, offerEventRow("sent", created, now));
        await this.d.outbox.add(tx, offerExpireRow(created));
        await this.d.notifier.notify(tx, {
          type: RECRUITER_NOTIFICATION_TYPES.OFFER_RECEIVED,
          scope: null,
          actorId: actor.id,
          source: { type: "JobOffer", id: `job-offer:${id}:received` },
          refs: { offerId: id, companyId, companyName: company.name },
          recipients: [{ userId: dto.studentId }],
          dedupeKey: `job-offer.received:offer:${id}`,
        });
        return created;
      });
    } catch (err) {
      if (!(err instanceof UniqueViolationError)) throw err;
      if (err.key.includes("clientRequestId")) {
        const dup = await this.d.offers.findByRequest(actor.id, clientRequestId);
        if (dup) return { offer: await this.views.companyDetail(dup, company, actor), created: false };
      }
      throw recruiterErrors.openOfferExists();
    }
    return { offer: await this.views.companyDetail(offer, company, actor), created: true };
  }

  async list(companyId: string, q: CompanyOffersQuery): Promise<{ data: CompanyOfferItem[]; meta: { nextCursor: string | null; hasMore: boolean; limit: number } }> {
    const company = await this.companies.load(companyId);
    const before = q.cursor ? (decodeCursor(q.cursor) ?? undefined) : undefined;
    const rows = await this.d.offers.listForCompany(companyId, { status: q.status, recruiterId: q.recruiterId, before, take: q.limit + 1 });
    const page = rows.slice(0, q.limit);
    const last = page[page.length - 1];
    const hasMore = rows.length > q.limit;
    return { data: await this.views.companyItems(page, company), meta: { nextCursor: hasMore && last ? encodeCursor(last.sentAt, last.id) : null, hasMore, limit: q.limit } };
  }

  async get(actor: AuthUser, companyId: string, offerId: string): Promise<CompanyOfferDetail> {
    const company = await this.companies.load(companyId);
    return this.views.companyDetail(await this.ofOfCompany(companyId, offerId), company, actor);
  }

  /** `POST /companies/:companyId/offers/:offerId/withdraw` — mọi trạng thái mở → WITHDRAWN (không hoàn lượt, khoá thread). */
  async withdraw(actor: AuthUser, companyId: string, offerId: string): Promise<CompanyOfferDetail> {
    const company = await this.companies.load(companyId);
    const offer = await this.ofOfCompany(companyId, offerId);
    const now = this.d.now();
    const updated = await this.d.tx.run(async (tx) => {
      const u = await this.d.offers.transition(offer.id, offerFromStatuses("withdraw"), { status: "WITHDRAWN", withdrawnAt: now, threadLocked: true, activeKey: offerClosedKey(offer.id) }, tx);
      if (u) await this.d.outbox.add(tx, offerEventRow("responded", u, now));
      return u;
    });
    if (!updated) throw recruiterErrors.invalidState({ status: offer.status });
    await this.d.audit.record({ actorId: actor.id, actorRole: actor.role, action: "job-offer.withdraw", targetType: "JobOffer", targetId: offer.id, metadata: { companyId } });
    return this.views.companyDetail(updated, company, actor);
  }

  /** SENT|READ quá `expiresAt` → EXPIRED (không tốn thêm lượt). CAS trạng thái nên chạy lặp/muộn vô hại. `true` khi vừa chuyển. */
  async expireOne(offerId: string): Promise<boolean> {
    const offer = await this.d.offers.findById(offerId);
    const now = this.d.now();
    if (!offer || offer.expiresAt > now) return false;
    const updated = await this.d.tx.run(async (tx) => {
      const u = await this.d.offers.transition(offer.id, offerFromStatuses("expire"), { status: "EXPIRED", threadLocked: true, activeKey: offerClosedKey(offer.id) }, tx);
      if (u) await this.d.outbox.add(tx, offerEventRow("responded", u, now));
      return u;
    });
    return updated !== null;
  }

  /** Cron quét bù 01:00 (mất job hẹn giờ). */
  async expireDue(limit = 500): Promise<number> {
    let n = 0;
    for (const o of await this.d.offers.findDue(this.d.now(), limit)) if (await this.expireOne(o.id)) n += 1;
    return n;
  }

  // ── nội bộ ──────────────────────────────────────────────────────────────────

  private async ofOfCompany(companyId: string, offerId: string): Promise<JobOffer> {
    const o = await this.d.offers.findById(offerId);
    if (!o || o.companyId !== companyId) throw recruiterErrors.offerNotFound();
    return o;
  }

  /** Mọi lý do không gửi được → CÙNG `RECR_007` (không lộ Open to work/chặn). */
  private async assertTargetable(companyId: string, studentId: string, recruiterId: string): Promise<void> {
    if (studentId === recruiterId) throw recruiterErrors.cannotOffer();
    const [doc, student, blocked] = await Promise.all([this.d.index.find(studentId), this.d.directory.findUser(studentId), this.d.blocks.exists(studentId, companyId)]);
    if (!doc || !doc.openToWork || doc.blockedCompanyIds.includes(companyId) || blocked || !student || student.status !== "ACTIVE") throw recruiterErrors.cannotOffer();
  }

  private async assertJd(assetId: string, userId: string): Promise<void> {
    const a = await this.d.assets.get(assetId);
    if (!a || a.ownerId !== userId) throw new AppError("Tệp không thuộc quyền sử dụng của bạn", HttpStatusCode.FORBIDDEN, ErrorCode.ASSET_005);
    if (a.status !== "READY") throw new AppError("Tệp chưa xử lý xong", HttpStatusCode.CONFLICT, ErrorCode.ASSET_003);
    if (a.scope !== "COMPANY" || a.kind !== "FILE" || a.mime !== "application/pdf") throw new AppError("JD phải là tệp PDF", HttpStatusCode.UNSUPPORTED_MEDIA_TYPE, ErrorCode.ASSET_001);
  }
}
