import { defineCron, registerJob } from "../../../infrastructure/queue";
import { createContextLogger } from "../../../infrastructure/logger";
import { getPlagiarismContainer } from "../plagiarism.container";

const log = createContextLogger({ service: "PlagiarismScansExpireJob" });
const SCAN_BATCH = 500;
const ROW_BATCH = 500;

/**
 * `plagiarism.scans-expire` (queue `cron`, `10 4 * * *` — be.md §7): `expiresAt ≤ now` → `EXPIRED` + dọn
 * `PlagiarismResult`/`PlagiarismSection` theo lô 500 (giữ dòng `PlagiarismScan` để còn thấy lịch sử "đã có lượt quét").
 */
registerJob("cron", "plagiarism.scans-expire", async () => {
  const c = getPlagiarismContainer();
  const now = new Date();
  const ids = await c.scans.findExpired(now, SCAN_BATCH);
  if (ids.length === 0) return;
  await c.scans.markExpired(ids);
  for (const scanId of ids) {
    await c.results.deleteByScan(scanId);
    for (;;) {
      const deleted = await c.sections.deleteByScanBatch(scanId, ROW_BATCH);
      if (deleted < ROW_BATCH) break;
    }
  }
  log.info("[plagiarism.scans-expire] Đã hết hạn + dọn báo cáo", { count: ids.length });
});

defineCron({ schedulerId: "plagiarism.scans-expire", queue: "cron", jobName: "plagiarism.scans-expire", pattern: "10 4 * * *", opts: { attempts: 1 } });
