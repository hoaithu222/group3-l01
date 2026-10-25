import { LIMITS } from "../../../core/constants/limits";
import { logger } from "../../../infrastructure/logger";
import { buildTalentIndexDoc } from "../domain/talent-index.builder";
import type { TalentIndexDoc } from "../entities/recruiter.interface";
import type { RecruiterDeps } from "./recruiter.deps";

const DAY_MS = 24 * 3600 * 1000;
/** Trần số lô mỗi lượt đối soát (chống chạy vô hạn khi index lớn — lượt sau tiếp tục). */
const MAX_BATCHES = 40;

export type RebuildOutcome = "upserted" | "removed" | "unchanged";

/** Trường ảnh hưởng KẾT QUẢ TÌM — đổi thì phải tăng `talent:search:ver`. */
function searchFieldsEqual(a: TalentIndexDoc, b: TalentIndexDoc): boolean {
  const pick = (d: TalentIndexDoc) => JSON.stringify([d.openToWork, d.displayName, d.normalizedText, d.headline, d.preferredRolesKey, d.locationKey, d.skillCodes, d.badgeCount, d.contributionPctX10, d.contributionWorkspaces, d.portfolioUrl, [...d.blockedCompanyIds].sort(), d.avatarAssetId]);
  return pick(a) === pick(b);
}

/**
 * Dựng/cập nhật `TalentSearchIndex` (be.md §5). `rebuild(userId)` ghi ĐÈ toàn bộ theo dữ liệu nguồn (career/contribution/portfolio/chặn), đã lọc quyền riêng tư
 * (`buildTalentIndexDoc`) — idempotent, an toàn chạy lặp. Người không đủ điều kiện (không ACTIVE / tắt Open to work) → XOÁ bản chiếu (tối thiểu hoá dữ liệu).
 * Đường tắt Open to work đi đồng bộ ở `CareerSettingsService`, KHÔNG phụ thuộc job ở đây. Sự kiện đầu vào (`skill.*`, `portfolio.*`, `career.updated`) chỉ xếp job có
 * debounce; đối soát hằng đêm (`reconcile`) vá lệch khi mất sự kiện (không có `contribution.member-updated` — điểm đóng góp cập nhật theo lượt dựng/đối soát).
 */
export class TalentIndexService {
  constructor(private readonly d: RecruiterDeps) {}

  async rebuild(userId: string): Promise<RebuildOutcome> {
    const now = this.d.now();
    const src = await this.d.source.load(userId, now);
    const doc = src ? buildTalentIndexDoc(src) : null;
    const existing = await this.d.index.find(userId);
    if (!doc) {
      if (!existing) return "unchanged";
      await this.d.index.delete(userId);
      await this.d.searchCache.bump();
      return "removed";
    }
    await this.d.index.upsert(doc);
    if (!existing || !searchFieldsEqual(existing, doc)) await this.d.searchCache.bump();
    return "upserted";
  }

  /** Xếp job dựng lại (debounce `indexDebounceSeconds`) — dùng trong sink/worker, ngoài transaction. Lỗi Redis chỉ log: đối soát đêm vá. */
  async schedule(userId: string): Promise<void> {
    try {
      await this.d.rebuildQueue.enqueue(userId, LIMITS.talent.indexDebounceSeconds, this.d.now());
    } catch (err) {
      logger.warn("[recruiter] Không xếp được job dựng lại index", { userId, error: err instanceof Error ? err.message : String(err) });
    }
  }

  /** Đối soát hằng đêm (02:45): (1) người bật Open to work mà thiếu/cũ bản chiếu → dựng lại; (2) bản chiếu của người đã tắt/không còn → xoá; (3) bản cũ hơn `reconcileStaleDays` → dựng lại. */
  async reconcile(): Promise<{ checked: number; rebuilt: number; removed: number }> {
    const batch = LIMITS.talent.reconcileBatch;
    const staleBefore = new Date(this.d.now().getTime() - LIMITS.talent.reconcileStaleDays * DAY_MS);
    let checked = 0;
    let rebuilt = 0;
    let removed = 0;

    let after: string | null = null;
    for (let i = 0; i < MAX_BATCHES; i += 1) {
      const ids = await this.d.careerSettings.listOpenToWork(after, batch);
      if (ids.length === 0) break;
      for (const userId of ids) {
        checked += 1;
        const existing = await this.d.index.find(userId);
        if (existing && existing.rebuiltAt >= staleBefore) continue;
        if ((await this.rebuild(userId)) === "upserted") rebuilt += 1;
      }
      after = ids[ids.length - 1];
    }

    after = null;
    for (let i = 0; i < MAX_BATCHES; i += 1) {
      const ids = await this.d.index.listUserIds(after, batch);
      if (ids.length === 0) break;
      const open = await this.d.careerSettings.openToWorkAmong(ids);
      for (const userId of ids) {
        checked += 1;
        if (open.has(userId)) continue;
        if ((await this.rebuild(userId)) === "removed") removed += 1;
      }
      after = ids[ids.length - 1];
    }

    for (let i = 0; i < MAX_BATCHES; i += 1) {
      const stale = await this.d.index.listStaleUserIds(staleBefore, batch);
      if (stale.length === 0) break;
      for (const userId of stale) {
        checked += 1;
        const outcome = await this.rebuild(userId);
        if (outcome === "upserted") rebuilt += 1;
        if (outcome === "removed") removed += 1;
      }
      if (stale.length < batch) break;
    }
    return { checked, rebuilt, removed };
  }
}
