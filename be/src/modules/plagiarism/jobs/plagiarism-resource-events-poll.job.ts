import { defineCron, registerJob } from "../../../infrastructure/queue";
import { createContextLogger } from "../../../infrastructure/logger";
import { pollResourceEvents } from "../listeners/resource-events.listener";
import { getPlagiarismContainer } from "../plagiarism.container";

const log = createContextLogger({ service: "PlagiarismResourceEventsPoll" });

/**
 * `plagiarism.resource-events-poll` (queue `cron`, mỗi 60 giây) — "nối" outbox `resource.*` mà KHÔNG sửa module
 * `resources` (xem chú thích đầy đủ trong `listeners/resource-events.listener.ts`).
 */
registerJob("cron", "plagiarism.resource-events-poll", async () => {
  const count = await pollResourceEvents({ fingerprintIndex: getPlagiarismContainer().fingerprintIndex });
  if (count > 0) log.debug("[plagiarism.resource-events-poll] Đã xử lý", { count });
});

defineCron({ schedulerId: "plagiarism.resource-events-poll", queue: "cron", jobName: "plagiarism.resource-events-poll", everyMs: 60_000 });
