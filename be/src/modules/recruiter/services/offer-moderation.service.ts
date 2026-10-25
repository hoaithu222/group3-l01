import type { AuthUser } from "../../../core/types/express";
import { offerClosedKey } from "../domain/company-keys";
import { offerFromStatuses } from "../domain/state-machines";
import { offerEventRow } from "./recruiter-outbox-rows";
import type { RecruiterDeps } from "./recruiter.deps";
import { recruiterErrors } from "./recruiter.errors";

export interface ReportedOfferView {
  id: string;
  company: { id: string; name: string };
  title: string;
  message: string;
  employmentType: string;
  location: string | null;
  status: string;
  sentAt: string;
}

/**
 * Kiểm duyệt LỜI MỜI bị báo cáo (admin.md §2.3, D-06): vận hành CHỈ xem được nội dung lời mời khi có ≥ 1 báo cáo về nó (người báo cáo là chính người nhận), KHÔNG có thread, KHÔNG tên
 * người nhận; mỗi lần xem ghi audit `job-offer.view-reported`. Thu hồi lời mời vi phạm (`withdraw`) → WITHDRAWN + khoá thread + đóng báo cáo mở (`CONTENT_REMOVED`) + audit; không hoàn lượt.
 * Quyền: `recruiter:approve` theo VAI HỆ THỐNG (route).
 */
export class OfferModerationService {
  constructor(private readonly d: RecruiterDeps) {}

  async view(actor: AuthUser, offerId: string): Promise<ReportedOfferView> {
    const offer = await this.d.offers.findById(offerId);
    if (!offer || !(await this.d.directory.hasReport("JOB_OFFER", offerId))) throw recruiterErrors.offerNotFound();
    const company = await this.d.companies.findById(offer.companyId);
    await this.d.audit.record({ actorId: actor.id, actorRole: actor.role, action: "job-offer.view-reported", targetType: "JobOffer", targetId: offerId, metadata: { companyId: offer.companyId } });
    return {
      id: offer.id,
      company: { id: offer.companyId, name: company?.name ?? "" },
      title: offer.title,
      message: offer.message,
      employmentType: offer.employmentType,
      location: offer.location,
      status: offer.status,
      sentAt: offer.sentAt.toISOString(),
    };
  }

  async withdraw(actor: AuthUser, offerId: string, reason: string): Promise<{ id: string; status: string }> {
    const offer = await this.d.offers.findById(offerId);
    if (!offer || !(await this.d.directory.hasReport("JOB_OFFER", offerId))) throw recruiterErrors.offerNotFound();
    const now = this.d.now();
    const updated = await this.d.tx.run(async (tx) => {
      const u = await this.d.offers.transition(offer.id, offerFromStatuses("withdraw"), { status: "WITHDRAWN", withdrawnAt: now, threadLocked: true, activeKey: offerClosedKey(offer.id) }, tx);
      if (u) await this.d.outbox.add(tx, offerEventRow("responded", u, now));
      return u;
    });
    if (!updated) throw recruiterErrors.invalidState({ status: offer.status });
    await this.d.audit.record({ actorId: actor.id, actorRole: actor.role, action: "job-offer.admin-withdraw", targetType: "JobOffer", targetId: offerId, reason, metadata: { companyId: offer.companyId } });
    await this.d.reports.closeOpenByTarget({ targetType: "JOB_OFFER", targetId: offerId, actor: { id: actor.id, role: actor.role }, resolution: "CONTENT_REMOVED", reason });
    return { id: updated.id, status: updated.status };
  }
}
