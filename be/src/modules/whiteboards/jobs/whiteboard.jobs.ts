import { registerJob } from "../../../infrastructure/queue";
import { registerCollabSnapshotRunner } from "../../../shared/collab/collab-snapshot-runners";
import { registerCollabSnapshotHourlyJob } from "../../../shared/collab/collab-snapshot-hourly";
import { registerWhiteboardsModule } from "..";
import { getWhiteboardsContainer } from "../whiteboards.container";
import { WHITEBOARD_JOBS, type AccessRevokedPayload, type WhiteboardEventPayload } from "../services/whiteboard-events";

/**
 * Job của Whiteboard (be.md §7) — nạp bởi `infrastructure/queue/register-jobs.ts` ở CẢ API (PROCESS_ROLE=all) lẫn worker riêng.
 * Worker không import `router.ts` nên đăng ký registry (resolver WHITEBOARD, listener thu hồi quyền) ngay đây.
 *
 *  - `notifications/whiteboard.events` (outbox): phát `whiteboard:updated` tới đúng khán giả (`emitToUsers`, chạy được ở worker nhờ cầu nối socket).
 *  - `notifications/whiteboard.access-revoked`: đóng kết nối collab của người mất quyền / mọi kết nối khi lưu trữ (`POST collab /internal/kick`, `kind: "whiteboard"`).
 *  - runner `whiteboard` của cron TĨNH `collab.snapshot-hourly` (phút 7, dùng chung với tài liệu — `shared/collab`): chụp AUTO cho bảng có thay đổi, dọn AUTO vượt `snapshotsAuto`.
 *
 * Không có job `whiteboard.plaintext`/`whiteboard.saved` (bảng trắng không có văn bản để tìm kiếm ở P0; export PNG/PDF là P1).
 */
registerWhiteboardsModule();

registerJob(WHITEBOARD_JOBS.events.queue, WHITEBOARD_JOBS.events.name, async (job) => {
  await getWhiteboardsContainer().events.publish(job.data as WhiteboardEventPayload);
});

registerJob(WHITEBOARD_JOBS.accessRevoked.queue, WHITEBOARD_JOBS.accessRevoked.name, async (job) => {
  await getWhiteboardsContainer().revoked.process(job.data as AccessRevokedPayload);
});

registerCollabSnapshotRunner("whiteboard", () => getWhiteboardsContainer().cron.runHourly());
registerCollabSnapshotHourlyJob();
