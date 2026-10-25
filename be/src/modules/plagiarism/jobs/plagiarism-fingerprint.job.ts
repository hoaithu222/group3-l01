import type { Job } from "bullmq";
import { registerJob } from "../../../infrastructure/queue";
import { createContextLogger } from "../../../infrastructure/logger";
import { registerPlagiarismModule } from "..";
import { getPlagiarismContainer } from "../plagiarism.container";
import { PLAGIARISM_FINGERPRINT_JOB, PLAGIARISM_FINGERPRINT_QUEUE } from "../services/fingerprint-index.service";

const log = createContextLogger({ service: "PlagiarismFingerprintJob" });

// Worker cần loại thông báo đã đăng ký để giao `plagiarism.scan-completed|failed` (job `plagiarism.scan` gọi `notify()`).
registerPlagiarismModule();

interface FingerprintJobData {
  resourceId: string;
  resourceVersion: number;
}

/** `plagiarism.fingerprint` (queue `media`, be.md §7) — lập chỉ mục MỘT `Resource`. CAS trong `runIndexJob`. */
registerJob(PLAGIARISM_FINGERPRINT_QUEUE, PLAGIARISM_FINGERPRINT_JOB, async (job: Job) => {
  const { resourceId, resourceVersion } = job.data as FingerprintJobData;
  try {
    await getPlagiarismContainer().fingerprintIndex.runIndexJob(resourceId, resourceVersion);
  } catch (err) {
    log.error("[plagiarism.fingerprint] Lỗi lập chỉ mục", { resourceId, resourceVersion, error: err instanceof Error ? err.message : String(err) });
    throw err; // để BullMQ retry (3 lần, backoff 30s — be.md §7)
  }
});
