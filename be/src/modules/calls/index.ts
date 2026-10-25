/**
 * Barrel của module `calls` (p2-01) — mirror `modules/read-state/index.ts`. `router.ts` gọi `registerCallsModule()` NGAY SAU
 * khi import `calls.routes.ts`: đăng ký resolver scope `CALL` (guard room `call:{id}` ở `socket.guards.ts` dùng nó), loại
 * thông báo cuộc gọi, listener thu hồi quyền và (p2-03) bản đọc "ai đang trong phòng thoại" cho danh sách kênh. Worker đăng ký
 * các phần tương ứng khi import `jobs/call.jobs.ts`.
 */
import { registerChannelVoiceActivityReader } from "../../shared/ports/channel-voice-activity.port";
import { PrismaCallRepository } from "./repositories/call.repository.prisma";
import { registerCallPermissionResolver } from "./services/call-scope.resolver";
import { registerCallNotificationTypes } from "./services/call-notification-types";
import { CallChannelVoiceActivityReader } from "./services/channel-voice-activity.reader";
import { registerCallRevokeListener } from "./jobs/call-revoke-listener";

export function registerCallsModule(): void {
  const repo = new PrismaCallRepository();
  registerCallPermissionResolver(repo);
  registerCallNotificationTypes();
  registerCallRevokeListener();
  registerChannelVoiceActivityReader(new CallChannelVoiceActivityReader(repo));
}

export { getCallsContainer, createCallsContainer, setCallsContainerForTests } from "./calls.container";
// (p2-07) Điểm gắn sink cho module ngoài nhận tín hiệu `call.signal-dispatch` (admin media invalidate bảng) — mirror `registerMeetingEventSink`.
export { registerCallSignalSink, clearCallSignalSinks, type CallSignalSink } from "./services/call-signal.dispatcher";
export type { CallSignalPayload } from "./events/call-outbox.events";
export type { CallsContainer, CallsContainerOverrides } from "./calls.container";
