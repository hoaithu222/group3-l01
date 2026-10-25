import type { Job } from "bullmq";
import { registerJob } from "../../../infrastructure/queue";
import { createContextLogger } from "../../../infrastructure/logger";
import { getPlagiarismContainer } from "../plagiarism.container";
import { PLAGIARISM_FINGERPRINT_QUEUE } from "../services/fingerprint-index.service";
import { PLAGIARISM_REINDEX_JOB, runReindexBatches } from "../services/admin-plagiarism.service";

const log = createContextLogger({ service: "PlagiarismReindexJob" });

interface ReindexJobData {
  workspaceId?: string;
  algoVersionLessThan: number;
}

/** `plagiarism.reindex` (queue `media`, be.md §7) — việc NẶNG của `POST /admin/plagiarism/reindex` (đặt lại `PENDING` theo lô + xếp `plagiarism.fingerprint` từng tệp), chạy nền để không chặn request admin. */
registerJob(PLAGIARISM_FINGERPRINT_QUEUE, PLAGIARISM_REINDEX_JOB, async (job: Job) => {
  const { workspaceId, algoVersionLessThan } = job.data as ReindexJobData;
  try {
    const queued = await runReindexBatches(getPlagiarismContainer().fingerprints, { workspaceId, algoVersionLessThan });
    log.info("[plagiarism.reindex] Đã xếp hàng lập chỉ mục lại", { workspaceId: workspaceId ?? "ALL", queued });
  } catch (err) {
    log.error("[plagiarism.reindex] Lỗi", { workspaceId, error: err instanceof Error ? err.message : String(err) });
    throw err;
  }
});
