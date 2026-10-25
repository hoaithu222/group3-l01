import { registerJob } from "../../../infrastructure/queue";
import { logger } from "../../../infrastructure/logger";
import { registerCollabSnapshotRunner } from "../../../shared/collab/collab-snapshot-runners";
import { registerCollabSnapshotHourlyJob } from "../../../shared/collab/collab-snapshot-hourly";
import { registerDocumentsModule } from "..";
import { getDocumentsContainer } from "../documents.container";
import { DOCUMENT_JOBS, type AccessRevokedPayload, type DocumentEventPayload, type PlaintextPayload } from "../services/document-events";

/**
 * Job của Real-time Docs (be.md §7) — nạp bởi `infrastructure/queue/register-jobs.ts` ở CẢ API (PROCESS_ROLE=all) lẫn worker riêng.
 * Worker không import `router.ts` nên đăng ký registry (resolver DOCUMENT, loại thông báo, listener thu hồi quyền) ngay đây.
 *
 *  - `notifications/document.events` (outbox): phát `document:updated` tới đúng khán giả (`emitToUsers`, chạy được ở worker nhờ cầu nối socket).
 *  - `reports/document.plaintext` (outbox, trễ 5 s): trích văn bản phẳng; bỏ nếu `yjsVersion` đã cũ (idempotent).
 *  - `notifications/document.access-revoked`: đóng kết nối collab của người mất quyền (`POST collab /internal/kick`).
 *  - cron TĨNH `collab.snapshot-hourly` (phút 7, dùng chung với bảng trắng — `shared/collab`): chụp AUTO cho tài liệu có thay đổi, dọn AUTO > 30 — KHÔNG scheduler theo thực thể.
 */
registerDocumentsModule();

registerJob(DOCUMENT_JOBS.events.queue, DOCUMENT_JOBS.events.name, async (job) => {
  await getDocumentsContainer().events.publish(job.data as DocumentEventPayload);
});

registerJob(DOCUMENT_JOBS.plaintext.queue, DOCUMENT_JOBS.plaintext.name, async (job) => {
  const outcome = await getDocumentsContainer().plaintext.process(job.data as PlaintextPayload);
  if (outcome === "done") logger.debug("[document.plaintext] đã trích văn bản", { documentId: (job.data as PlaintextPayload).documentId });
});

registerJob(DOCUMENT_JOBS.accessRevoked.queue, DOCUMENT_JOBS.accessRevoked.name, async (job) => {
  await getDocumentsContainer().revoked.process(job.data as AccessRevokedPayload);
});

// (p6-02) Cron chụp AUTO nay DÙNG CHUNG với bảng trắng: runner riêng của tài liệu + job/cron `collab.snapshot-hourly` ở `shared/collab`.
registerCollabSnapshotRunner("document", () => getDocumentsContainer().cron.runHourly());
registerCollabSnapshotHourlyJob();
