import { defineCron, registerJob } from "../../infrastructure/queue";
import { logger } from "../../infrastructure/logger";
import { COLLAB_SNAPSHOT_JOB, runCollabSnapshotHourly } from "./collab-snapshot-runners";

/**
 * Đăng ký job + cron TĨNH `collab.snapshot-hourly` (phút 7 mỗi giờ; KHÔNG scheduler theo thực thể). Gọi từ file job của MỖI module cộng tác
 * (`documents/jobs/document.jobs.ts`, `whiteboards/jobs/whiteboard.jobs.ts`) — idempotent (`registerJob`/`defineCron` ghi đè theo tên), nên module nào
 * được nạp trước cũng được; runner từng loại đăng ký riêng bằng `registerCollabSnapshotRunner`. Scheduler cũ `document.snapshot-hourly` tự bị
 * `syncCronSchedulers` dọn (không còn trong registry).
 *
 * ⚠ KHÔNG export từ barrel `index.ts` của `shared/collab`: file này kéo `infrastructure/queue` (BullMQ/Redis), còn barrel được test/unit import rộng rãi.
 */
export function registerCollabSnapshotHourlyJob(): void {
  registerJob(COLLAB_SNAPSHOT_JOB.queue, COLLAB_SNAPSHOT_JOB.name, async () => {
    const results = await runCollabSnapshotHourly();
    const created = Object.values(results).reduce((sum, r) => sum + r.created, 0);
    if (created > 0) logger.info("[collab.snapshot-hourly] Đã chụp bản lưu tự động", results);
  });
  defineCron({
    schedulerId: COLLAB_SNAPSHOT_JOB.name,
    queue: COLLAB_SNAPSHOT_JOB.queue,
    jobName: COLLAB_SNAPSHOT_JOB.name,
    pattern: "7 * * * *",
    opts: { attempts: 1 },
  });
}
