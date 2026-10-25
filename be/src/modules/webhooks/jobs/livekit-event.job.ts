import { registerJob } from "../../../infrastructure/queue";
import { logger } from "../../../infrastructure/logger";
import { LIVEKIT_EVENT_TYPES, registerLiveKitHandler } from "../../../infrastructure/media";
import { LIVEKIT_EVENT_JOB, LIVEKIT_EVENT_QUEUE, type LiveKitEventJobData } from "../livekit-event.queue";
import { getWebhooksContainer } from "../webhooks.container";

// P0 chỉ đăng ký handler `spike` (log + metric qua `LiveKitEventProcessor`); Phase 2 đăng ký `call` (p2-01/p2-03),
// `meeting` (p2-05) và `*` cho `egress_*` (p2-06) từ file job của module đó — infrastructure không import module.
registerLiveKitHandler({
  name: "p0-08.spike-log",
  roomKind: "spike",
  types: LIVEKIT_EVENT_TYPES,
  handle: (event) => {
    logger.info("[livekit.spike] Sự kiện phòng spike", {
      type: event.type,
      room: event.roomName,
      identity: event.participant?.identity,
    });
    return Promise.resolve("PROCESSED");
  },
});

/**
 * `livekit.event` (queue `calls`, jobId `livekit.event_<event.id>`, retry 5 × backoff mũ 2 s) — chạy handler theo tiền
 * tố phòng cho 1 `WebhookEvent` đã ghi (p0-08 be.md §5.4/§7).
 */
registerJob(LIVEKIT_EVENT_QUEUE, LIVEKIT_EVENT_JOB, async (job) => {
  const { webhookEventId } = job.data as LiveKitEventJobData;
  await getWebhooksContainer().processor.process(webhookEventId);
});
