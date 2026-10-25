import type { OutboxEventInput } from "../../infrastructure/queue";

export const PLAGIARISM_SCAN_QUEUE = "reports" as const;
export const PLAGIARISM_SCAN_JOB = "plagiarism.scan";

export function scanJobId(scanId: string): string {
  return `plagiarism.scan:scan:${scanId}`.replace(/:/g, "_");
}

/** Outbox `plagiarism.scan-requested` (be.md §5.2 bước 3) — kích job `plagiarism.scan`. */
export function scanRequestedEvent(scanId: string): OutboxEventInput {
  return {
    type: "plagiarism.scan-requested",
    aggregateType: "PlagiarismScan",
    aggregateId: scanId,
    queue: PLAGIARISM_SCAN_QUEUE,
    jobName: PLAGIARISM_SCAN_JOB,
    dedupeKey: `plagiarism.scan-requested:scan:${scanId}`,
    payload: { scanId },
  };
}

export const PLAGIARISM_NOTIFICATION_TYPES = {
  SCAN_COMPLETED: "plagiarism.scan-completed",
  SCAN_FAILED: "plagiarism.scan-failed",
} as const;
