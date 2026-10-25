import { defineCron, registerJob } from "../../../infrastructure/queue";
import { registerLiveKitHandler } from "../../../infrastructure/media";
import { getCallsContainer } from "../calls.container";
import { registerCallNotificationTypes } from "../services/call-notification-types";
import type { CallSignalPayload } from "../events/call-outbox.events";
import type { CallRevocationInput } from "../services/call-revocation.service";
import { registerCallRevokeListener } from "./call-revoke-listener";
import "./call-admin.outbox-handlers"; // (p2-07) consumer `call.force-end` (admin kết thúc cưỡng bức)

/**
 * Side-effect (import từ `register-jobs.ts`, chạy ở worker): đăng ký processor queue `calls` + cron `call.recovery`,
 * handler webhook LiveKit tiền tố `call_` (p0-08 dispatcher), loại thông báo cuộc gọi và listener thu hồi quyền.
 * Toàn bộ nghiệp vụ nằm ở service (`getCallsContainer()`); file này chỉ giải payload rồi gọi.
 */
registerCallNotificationTypes();
registerCallRevokeListener();

registerJob("calls", "call.signal-dispatch", async (job) => {
  await getCallsContainer().dispatcher.dispatch(job.data as CallSignalPayload);
});

registerJob("calls", "call.ring-timeout", async (job) => {
  await getCallsContainer().recovery.ringTimeout((job.data as { callId: string }).callId);
});

registerJob("calls", "call.reconcile", async (job) => {
  await getCallsContainer().reconcile.reconcile((job.data as { callId: string }).callId);
});

registerJob("calls", "call.host-failover", async (job) => {
  await getCallsContainer().host.failover((job.data as { callId: string }).callId);
});

registerJob("calls", "call.summary", async (job) => {
  await getCallsContainer().summary.post((job.data as { callId: string }).callId);
});

registerJob("calls", "call.revocation", async (job) => {
  await getCallsContainer().revocation.handle(job.data as CallRevocationInput);
});

registerJob("cron", "call.recovery", async () => {
  await getCallsContainer().recovery.recover();
});

// Quét mỗi phút: `RINGING` quá hạn (worker từng chết) → timeout; `ACTIVE` lâu không đối soát → `call.reconcile`.
defineCron({ schedulerId: "call.recovery", queue: "cron", jobName: "call.recovery", pattern: "* * * * *", opts: { attempts: 1 } });

registerLiveKitHandler({
  name: "p2-01.calls",
  roomKind: "call",
  types: ["participant_joined", "participant_left", "room_finished", "track_unpublished"],
  handle: (event) => getCallsContainer().reconcile.handleWebhook(event),
});
