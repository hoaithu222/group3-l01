import { LIMITS } from "../../../core/constants/limits";
import type { IDocumentRepository } from "../repositories/document.repository.interface";
import type { ISnapshotRepository } from "../repositories/snapshot.repository.interface";
import { getDocumentLimits } from "./document-limits";

const HOUR_MS = 3_600_000;
/** Cửa sổ quét: tài liệu sửa trong 2 giờ gần nhất (chồng lấp có chủ đích — khoá "đã có AUTO mới hơn lần sửa cuối" giữ cho chụp đúng một lần). */
const SCAN_WINDOW_MS = 2 * HOUR_MS;

export interface SnapshotRunResult {
  scanned: number;
  created: number;
  pruned: number;
}

/**
 * Runner của tài liệu cho cron TĨNH `collab.snapshot-hourly` (phút 7 mỗi giờ, dùng chung với bảng trắng; KHÔNG scheduler theo thực thể — xem be_cron_dynamic_scheduler_cleanup): chụp AUTO cho mỗi tài liệu ACTIVE
 * có thay đổi kể từ bản AUTO gần nhất, giữ `snapshotsAuto` bản mới nhất. Idempotent: chạy lặp/chồng lấp không tạo bản trùng.
 */
export class DocumentSnapshotCronService {
  constructor(
    private readonly documents: IDocumentRepository,
    private readonly snapshots: ISnapshotRepository,
    private readonly now: () => Date = () => new Date()
  ) {}

  async runHourly(): Promise<SnapshotRunResult> {
    const since = new Date(this.now().getTime() - SCAN_WINDOW_MS);
    const keep = (await getDocumentLimits()).snapshotsAuto;
    const result: SnapshotRunResult = { scanned: 0, created: 0, pruned: 0 };
    let afterId: string | null = null;
    for (;;) {
      const batch = await this.documents.findSnapshotCandidates(since, afterId, LIMITS.document.snapshotBatch);
      for (const doc of batch) {
        result.scanned += 1;
        const latest = await this.snapshots.latestOfKind(doc.id, "AUTO");
        if (latest && doc.lastEditedAt && latest.at >= doc.lastEditedAt) continue;
        const full = await this.documents.findWithState(doc.id);
        if (!full?.yjsState || full.yjsState.byteLength === 0) continue;
        await this.snapshots.create({ documentId: doc.id, kind: "AUTO", label: null, yjsState: full.yjsState, yjsVersion: full.yjsVersion, createdBy: null });
        result.created += 1;
        result.pruned += await this.snapshots.pruneKeepNewest(doc.id, "AUTO", keep);
      }
      const last = batch[batch.length - 1];
      if (batch.length < LIMITS.document.snapshotBatch || !last) break;
      afterId = last.id;
    }
    return result;
  }

  /** Admin `POST /admin/collab/cleanup-snapshots`: dọn AUTO vượt `snapshotsAuto` ở MỌI tài liệu (dùng sau khi admin hạ trần). */
  async pruneAllAuto(): Promise<{ scanned: number; pruned: number }> {
    const keep = (await getDocumentLimits()).snapshotsAuto;
    let scanned = 0;
    let pruned = 0;
    let afterId: string | null = null;
    for (;;) {
      const batch = await this.documents.findSnapshotCandidates(new Date(0), afterId, LIMITS.document.snapshotBatch);
      for (const doc of batch) {
        scanned += 1;
        pruned += await this.snapshots.pruneKeepNewest(doc.id, "AUTO", keep);
      }
      const last = batch[batch.length - 1];
      if (batch.length < LIMITS.document.snapshotBatch || !last) break;
      afterId = last.id;
    }
    return { scanned, pruned };
  }
}
