/**
 * Barrel của module `meetings` (p2-04) — mirror `modules/calls/index.ts`. `router.ts` gọi `registerMeetingsModule()` NGAY SAU khi
 * import `meetings.routes.ts`: đăng ký resolver scope `MEETING` (guard room `meet:{id}` ở `socket.guards.ts` dùng nó), loại thông báo
 * cuộc họp và listener thu hồi quyền/đóng workspace. Worker đăng ký các phần tương ứng khi import `jobs/meeting.jobs.ts`.
 */
import { PrismaMeetingRepository } from "./repositories/meeting.repository.prisma";
import { registerMeetingRevokeListener } from "./jobs/meeting-revoke-listener";
import { registerMeetingRoomRevokeListener } from "./jobs/meeting-room-revoke-listener";
import { registerMeetingNotificationTypes } from "./services/meeting-notification-types";
import { getMeetingsContainer } from "./meetings.container";
import { registerMeetingPermissionResolver } from "./services/meeting-scope.resolver";
import { registerMeetingAssetReadResolvers } from "./services/recap-asset-access";

export function registerMeetingsModule(): void {
  registerMeetingPermissionResolver(new PrismaMeetingRepository());
  registerMeetingNotificationTypes();
  registerMeetingRevokeListener();
  registerMeetingRoomRevokeListener();
  // (p2-06) Quyền đọc tệp đính kèm biên bản / tệp ghi hình (`AssetAccessService` tra resolver theo `AssetLinkTarget`); container dựng lười lúc có yêu cầu đọc đầu tiên.
  registerMeetingAssetReadResolvers(() => getMeetingsContainer().room.deps);
}

export { getMeetingsContainer, createMeetingsContainer, setMeetingsContainerForTests } from "./meetings.container";
export type { MeetingsContainer, MeetingsContainerOverrides } from "./meetings.container";
export { registerMeetingEventSink, clearMeetingEventSinks } from "./services/meeting-event.handler";
