import type { CompanyStatusChangedPayload, JobOfferEventPayload } from "../../../shared/events/domain-events";
import { effectiveThreadLocked } from "../domain/state-machines";
import { releasedNameKey, releasedTaxCodeKey } from "../domain/company-keys";
import type { TxHandle } from "../repositories/tx";
import { RECRUITER_NOTIFICATION_TYPES } from "../notifications/recruiter.notification-types";
import { companyStatusRow, offerEventRow } from "./recruiter-outbox-rows";
import type { RecruiterDeps } from "./recruiter.deps";

/** Trần số nhân sự vận hành nhận thông báo "công ty cần xử lý" (admin/manager ACTIVE). */
const OPS_RECIPIENTS_MAX = 100;
/** Trần số lời mời mở phát lại `offer:updated` khi công ty đổi trạng thái. */
const OFFERS_EMIT_MAX = 500;
const SYSTEM_REASON_OWNER_LEFT = "Chủ sở hữu duy nhất đã xoá tài khoản";

const hourBucket = (d: Date): string => d.toISOString().slice(0, 13).replace(/[-T]/g, "");

/**
 * Consumer sự kiện của recruiter (chạy ở worker): phát socket `offer:updated` / `company:updated`, thông báo chủ công ty và vận hành, dọn dữ liệu khi sinh viên/nhân sự
 * bị ẩn danh hoá (D-02). Mọi hàm IDEMPOTENT (job retry ≤ 5): thông báo dedupe theo `dedupeKey`, CAS theo trạng thái nguồn.
 */
export class RecruiterEventService {
  constructor(private readonly d: RecruiterDeps) {}

  /** `job-offer.sent|responded` → `offer:updated` tới sinh viên + mọi nhân sự ACTIVE (payload không có nội dung). `threadLocked` = HIỆU LỰC (tính cả tạm ngưng). */
  async onOfferEvent(p: JobOfferEventPayload): Promise<void> {
    const company = await this.d.companies.findById(p.companyId);
    const memberIds = await this.d.members.activeUserIds(p.companyId);
    this.d.emitter.offerUpdated([p.studentId, ...memberIds], {
      offerId: p.offerId,
      companyId: p.companyId,
      status: p.status,
      threadLocked: company ? effectiveThreadLocked({ threadLocked: p.threadLocked }, company.status) : true,
    });
  }

  /** `company.status-changed` → `company:updated` cho nhân sự; OWNER nhận thông báo (khi `notifyOwner`); vận hành nhận thông báo gộp theo giờ (khi `notifyOps`); lời mời mở phát lại `offer:updated`. */
  async onCompanyStatus(p: CompanyStatusChangedPayload): Promise<void> {
    const memberIds = await this.d.members.activeUserIds(p.companyId);
    this.d.emitter.companyUpdated(memberIds, { companyId: p.companyId, status: p.status, tier: p.tier });
    if (p.notifyOwner) await this.notifyOwners(p);
    if (p.notifyOps) await this.notifyOps(p);
    if (p.status === "APPROVED" || p.status === "SUSPENDED" || p.status === "REJECTED") await this.refreshOpenOffers(p.companyId, p.status, memberIds);
  }

  /**
   * `user.anonymized`: xoá bản chiếu, chặn, lượt xem; lời mời của người này → khoá thread + nhả `activeKey` (hiện "Tài khoản đã xoá"); nhân sự → REMOVED; OWNER cuối cùng của công ty → công ty
   * APPROVED bị SUSPENDED (PENDING bị REJECTED) với lý do hệ thống + báo vận hành. Chạy lặp không đổi gì.
   */
  async onUserAnonymized(userId: string): Promise<{ offers: number; memberships: number; suspended: number }> {
    const now = this.d.now();
    await this.d.index.delete(userId);
    await this.d.blocks.deleteByUser(userId);
    await this.d.views.deleteByStudent(userId);
    await this.d.searchCache.bump();

    let offers = 0;
    for (const o of await this.d.offers.openByStudent(userId)) {
      const done = await this.d.tx.run(async (tx) => {
        const ok = await this.d.offers.detachStudent(o.id, tx);
        if (ok) {
          const fresh = await this.d.offers.findById(o.id, tx);
          if (fresh) await this.d.outbox.add(tx, offerEventRow("responded", fresh, now));
        }
        return ok;
      });
      if (done) offers += 1;
    }

    let memberships = 0;
    let suspended = 0;
    for (const m of await this.d.members.activeByUser(userId)) {
      const closed = await this.d.tx.run(async (tx) => {
        await this.d.companies.touch(m.companyId, tx);
        const isLastOwner = m.role === "OWNER" && (await this.d.members.countActiveOwners(m.companyId, tx)) <= 1;
        if (!(await this.d.members.remove(m.id, tx))) return { removed: false, closedCompany: false };
        return { removed: true, closedCompany: isLastOwner && (await this.closeOrphanCompany(m.companyId, now, tx)) };
      });
      if (closed.removed) memberships += 1;
      if (closed.closedCompany) suspended += 1;
      if (closed.removed) await this.afterMembershipChange(m.companyId, userId);
    }
    return { offers, memberships, suspended };
  }

  // ── nội bộ ──────────────────────────────────────────────────────────────────

  private async closeOrphanCompany(companyId: string, now: Date, tx: TxHandle): Promise<boolean> {
    const c = await this.d.companies.findById(companyId, tx);
    if (!c || (c.status !== "APPROVED" && c.status !== "PENDING")) return false;
    const to = c.status === "APPROVED" ? "SUSPENDED" : "REJECTED";
    const next = await this.d.companies.update(
      companyId,
      c.version,
      { status: to, statusReason: SYSTEM_REASON_OWNER_LEFT, reviewedBy: null, reviewedAt: now, ...(to === "REJECTED" ? { nameKey: releasedNameKey(companyId), taxCodeKey: releasedTaxCodeKey(companyId) } : {}) },
      { fromStatuses: [c.status] },
      tx
    );
    if (!next) return false;
    await this.d.outbox.add(tx, companyStatusRow(next, { ops: true }, now));
    return true;
  }

  private async afterMembershipChange(companyId: string, userId: string): Promise<void> {
    await Promise.all([this.d.access.invalidateUsers([userId]), this.d.access.bumpCompany(companyId)]);
  }

  private async notifyOwners(p: CompanyStatusChangedPayload): Promise<void> {
    const owners = (await this.d.members.listByCompany(p.companyId, { activeOnly: true })).filter((m) => m.role === "OWNER").map((m) => m.userId);
    if (owners.length === 0) return;
    await this.d.tx.run((tx) =>
      this.d.notifier.notify(tx, {
        type: RECRUITER_NOTIFICATION_TYPES.COMPANY_STATUS,
        scope: null,
        source: { type: "Company", id: `company:${p.companyId}:v${p.version}` },
        refs: { companyId: p.companyId, status: p.status },
        recipients: owners.map((userId) => ({ userId })),
        dedupeKey: `company.status:${p.companyId}:v${p.version}`,
      })
    );
  }

  /** Vận hành: MỘT thông báo/giờ (dedupe theo giờ) cho admin/manager ACTIVE — gộp mọi đăng ký trong giờ. */
  private async notifyOps(p: CompanyStatusChangedPayload): Promise<void> {
    const ids = await this.d.directory.opsRecipientIds(OPS_RECIPIENTS_MAX);
    if (ids.length === 0) return;
    const bucket = hourBucket(new Date(p.at));
    await this.d.tx.run((tx) =>
      this.d.notifier.notify(tx, {
        type: RECRUITER_NOTIFICATION_TYPES.COMPANY_NEEDS_REVIEW,
        scope: null,
        source: { type: "Company", id: `company.needs-review:h${bucket}` },
        refs: { companyId: p.companyId, status: p.status },
        recipients: ids.map((userId) => ({ userId })),
        dedupeKey: `company.needs-review:h${bucket}`,
      })
    );
  }

  /** Trạng thái công ty đổi → `threadLocked` HIỆU LỰC của mọi lời mời mở đổi theo: phát lại `offer:updated` để app/admin làm mới (không ghi DB). */
  private async refreshOpenOffers(companyId: string, status: string, memberIds: readonly string[]): Promise<void> {
    const open = await this.d.offers.openByCompany(companyId, OFFERS_EMIT_MAX);
    for (const o of open) {
      this.d.emitter.offerUpdated([o.studentId, ...memberIds], { offerId: o.id, companyId, status: o.status, threadLocked: o.threadLocked || status !== "APPROVED" });
    }
  }
}
