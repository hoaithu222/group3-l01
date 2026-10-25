import type { Job } from "bullmq";
import { registerJob } from "../../../infrastructure/queue";
import { createContextLogger } from "../../../infrastructure/logger";
import { getPlagiarismContainer } from "../plagiarism.container";
import { PLAGIARISM_FINGERPRINT_PURGE_JOB, PLAGIARISM_FINGERPRINT_QUEUE } from "../services/fingerprint-index.service";

const log = createContextLogger({ service: "PlagiarismFingerprintPurgeJob" });

/** `plagiarism.fingerprint-purge` (queue `media`, be.md §7) — `resource.purged` → xoá fingerprint + tệp dẫn xuất. Xoá lặp an toàn. */
registerJob(PLAGIARISM_FINGERPRINT_QUEUE, PLAGIARISM_FINGERPRINT_PURGE_JOB, async (job: Job) => {
  const { resourceId } = job.data as { resourceId: string };
  try {
    await getPlagiarismContainer().fingerprintIndex.purge(resourceId);
  } catch (err) {
    log.error("[plagiarism.fingerprint-purge] Lỗi xoá", { resourceId, error: err instanceof Error ? err.message : String(err) });
    throw err;
  }
});
