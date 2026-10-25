import type { Job } from "bullmq";
import { registerJob } from "../../../infrastructure/queue";
import { createContextLogger } from "../../../infrastructure/logger";
import { getPlagiarismContainer } from "../plagiarism.container";
import { PLAGIARISM_SCAN_JOB, PLAGIARISM_SCAN_QUEUE } from "../plagiarism.events";

const log = createContextLogger({ service: "PlagiarismScanJob" });

/**
 * `plagiarism.scan` (queue `reports`, be.md §7) — outbox `plagiarism.scan-requested` → chạy một lượt quét
 * (`ScanRunnerService.run`, tự CAS trạng thái, idempotent theo đích). Cũng nhận job "chờ lập chỉ mục" tự xếp lại bởi
 * chính `ScanRunnerService` (jobId khác, xem ghi chú trong `scan-runner.service.ts`).
 */
registerJob(PLAGIARISM_SCAN_QUEUE, PLAGIARISM_SCAN_JOB, async (job: Job) => {
  const { scanId } = job.data as { scanId: string };
  try {
    await getPlagiarismContainer().scanRunner.run(scanId);
  } catch (err) {
    log.error("[plagiarism.scan] Lỗi chạy lượt quét", { scanId, error: err instanceof Error ? err.message : String(err) });
    throw err;
  }
});
