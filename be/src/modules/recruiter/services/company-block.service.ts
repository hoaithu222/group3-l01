import type { AuthUser } from "../../../core/types/express";
import { decodeCursor, encodeCursor } from "../../../core/utils/cursor";
import type { ProfileViewsQuery } from "../dtos";
import { UniqueViolationError } from "../repositories/tx";
import { offerEventRow } from "./recruiter-outbox-rows";
import { presentCompanyBrief, type CompanyBrief } from "./recruiter.presenter";
import type { RecruiterDeps } from "./recruiter.deps";
import { recruiterErrors } from "./recruiter.errors";

export interface BlockedCompanyView {
  company: CompanyBrief;
  blockedAt: string;
}

export interface ProfileViewItem {
  company: CompanyBrief;
  dayKey: string;
  viewCount: number;
  lastViewedAt: string;
}

/**
 * Sinh viên chặn doanh nghiệp + xem "doanh nghiệp đã xem hồ sơ" (P1) (be.md §4/§5). Chặn = ghi `CompanyBlock` + `$addToSet blockedCompanyIds` trên bản chiếu (đồng bộ, cùng transaction)
 * + khoá thread lời mời mở với công ty đó (giữ trạng thái, KHÔNG báo HR lý do — chỉ `threadLocked`) + tăng `talent:search:ver` → công ty biến mất khỏi tìm kiếm/xem hồ sơ/gửi lời mời ngay (CR-12).
 * Bỏ chặn không mở lại thread cũ. Idempotent.
 */
export class CompanyBlockService {
  constructor(private readonly d: RecruiterDeps) {}

  async list(user: AuthUser): Promise<BlockedCompanyView[]> {
    const blocks = await this.d.blocks.listByUser(user.id);
    const companies = await this.d.companies.findMany(blocks.map((b) => b.companyId));
    const logos = await this.d.assets.signThumbs([...companies.values()].flatMap((c) => (c.logoAssetId ? [c.logoAssetId] : [])));
    return blocks.flatMap((b) => {
      const c = companies.get(b.companyId);
      return c ? [{ company: presentCompanyBrief(c, c.logoAssetId ? (logos.get(c.logoAssetId) ?? null) : null), blockedAt: b.createdAt.toISOString() }] : [];
    });
  }

  async block(user: AuthUser, companyId: string): Promise<{ blocked: true }> {
    if (!(await this.d.companies.findById(companyId))) throw recruiterErrors.companyNotFound();
    const now = this.d.now();
    const exists = await this.d.blocks.exists(user.id, companyId);
    try {
      await this.applyBlock(user.id, companyId, !exists, now);
    } catch (err) {
      // Hai yêu cầu chặn đồng thời: bên thua P2002 (tx đã abort) → làm lại phần còn lại KHÔNG chèn.
      if (!(err instanceof UniqueViolationError)) throw err;
      await this.applyBlock(user.id, companyId, false, now);
    }
    await this.d.searchCache.bump();
    return { blocked: true };
  }

  private applyBlock(userId: string, companyId: string, insert: boolean, now: Date): Promise<void> {
    return this.d.tx.run(async (tx) => {
      if (insert) await this.d.blocks.add(userId, companyId, tx);
      await this.d.index.addBlockedCompany(userId, companyId, tx);
      for (const o of await this.d.offers.openByStudentCompany(userId, companyId)) {
        const locked = await this.d.offers.lockThread(o.id, tx);
        if (locked) await this.d.outbox.add(tx, offerEventRow("responded", locked, now));
      }
    });
  }

  async unblock(user: AuthUser, companyId: string): Promise<{ blocked: false }> {
    await this.d.tx.run(async (tx) => {
      await this.d.blocks.remove(user.id, companyId, tx);
      await this.d.index.removeBlockedCompany(user.id, companyId, tx);
    });
    await this.d.searchCache.bump();
    return { blocked: false };
  }

  /** `GET /me/profile-views` (P1) — công ty nào đã xem hồ sơ tôi, theo ngày (không lộ danh tính HR). */
  async profileViews(user: AuthUser, q: ProfileViewsQuery): Promise<{ data: ProfileViewItem[]; meta: { nextCursor: string | null; hasMore: boolean; limit: number } }> {
    const before = q.cursor ? (decodeCursor(q.cursor) ?? undefined) : undefined;
    const rows = await this.d.views.listForStudent(user.id, before, q.limit + 1);
    const page = rows.slice(0, q.limit);
    const last = page[page.length - 1];
    const hasMore = rows.length > q.limit;
    const companies = await this.d.companies.findMany([...new Set(page.map((r) => r.companyId))]);
    const logos = await this.d.assets.signThumbs([...companies.values()].flatMap((c) => (c.logoAssetId ? [c.logoAssetId] : [])));
    const data = page.flatMap((r): ProfileViewItem[] => {
      const c = companies.get(r.companyId);
      if (!c) return [];
      return [{ company: presentCompanyBrief(c, c.logoAssetId ? (logos.get(c.logoAssetId) ?? null) : null), dayKey: r.dayKey, viewCount: r.viewCount, lastViewedAt: r.lastViewedAt.toISOString() }];
    });
    return { data, meta: { nextCursor: hasMore && last ? encodeCursor(last.lastViewedAt, last.id) : null, hasMore, limit: q.limit } };
  }
}
