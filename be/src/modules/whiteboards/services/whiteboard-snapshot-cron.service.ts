import type { CollabSnapshotRunResult } from "../../../shared/collab/collab-snapshot-runners";
import type { IWhiteboardRepository } from "../repositories/whiteboard.repository.interface";
import type { ISnapshotRepository } from "../repositories/snapshot.repository.interface";
import { LIMITS } from "../../../core/constants/limits";
import { getWhiteboardLimits } from "./whiteboard-limits";

const HOUR_MS = 3_600_000;
/** Cửa sổ quét: bảng sửa trong 2 giờ gần nhất (chồng lấp có chủ đích — khoá "đã có AUTO mới hơn lần sửa cuối" giữ cho chụp đúng một lần). */
const SCAN_WINDOW_MS = 2 * HOUR_MS;

/**
 * Runner của bảng trắng cho cron TĨNH `collab.snapshot-hourly` (phút 7 mỗi giờ, dùng chung với tài liệu — `shared/collab`; KHÔNG scheduler theo thực thể): chụp AUTO cho mỗi bảng
 * ACTIVE có thay đổi kể từ bản AUTO gần nhất, giữ `snapshotsAuto` bản mới nhất. Idempotent: chạy lặp/chồng lấp không tạo bản trùng.
 */
export class WhiteboardSnapshotCronService {
  constructor(
    private readonly whiteboards: IWhiteboardRepository,
    private readonly snapshots: ISnapshotRepository,
    private readonly now: () => Date = () => new Date()
  ) {}

  async runHourly(): Promise<CollabSnapshotRunResult> {
    const since = new Date(this.now().getTime() - SCAN_WINDOW_MS);
    const keep = (await getWhiteboardLimits()).snapshotsAuto;
    const batchSize = LIMITS.whiteboard.snapshotBatch;
    const result: CollabSnapshotRunResult = { scanned: 0, created: 0, pruned: 0 };
    let afterId: string | null = null;
    for (;;) {
      const batch = await this.whiteboards.findSnapshotCandidates(since, afterId, batchSize);
      for (const board of batch) {
        result.scanned += 1;
        const latest = await this.snapshots.latestOfKind(board.id, "AUTO");
        if (latest && board.lastEditedAt && latest.at >= board.lastEditedAt) continue;
        const full = await this.whiteboards.findWithState(board.id);
        if (!full?.yjsState || full.yjsState.byteLength === 0) continue;
        await this.snapshots.create({ whiteboardId: board.id, kind: "AUTO", label: null, yjsState: full.yjsState, elementCount: full.elementCount, createdBy: null });
        result.created += 1;
        result.pruned += await this.snapshots.pruneKeepNewest(board.id, "AUTO", keep);
      }
      const last = batch[batch.length - 1];
      if (batch.length < batchSize || !last) break;
      afterId = last.id;
    }
    return result;
  }
}
