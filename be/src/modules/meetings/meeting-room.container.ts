import { getLiveKit, type IMediaServer } from "../../infrastructure/media";
import { CallsRoomAdapter } from "./adapters/calls-room.adapter";
import type { MeetingCallPort } from "./services/meeting-call.port";
import type { MeetingAttendeeService } from "./services/meeting-attendee.service";
import type { NotifyFn } from "./services/meeting-event.handler";
import type { MeetingDeps } from "./services/meeting.deps";
import { MeetingForceEndService } from "./services/meeting-force-end.service";
import { MeetingHostControlService } from "./services/meeting-host-control.service";
import { MeetingLobbyService } from "./services/meeting-lobby.service";
import type { SystemMessagePoster } from "./services/meeting-reminder.service";
import { MeetingRoomAccess } from "./services/meeting-room.access";
import type { MeetingRoomDeps, MeetingRoomJobsPort } from "./services/meeting-room.deps";
import { MeetingRoomEventHandler } from "./services/meeting-room.event.handler";
import { MeetingRoomJoinService } from "./services/meeting-room.join.service";
import { QueueMeetingRoomJobs } from "./services/meeting-room.jobs.port";
import { MeetingRoomLeaveService } from "./services/meeting-room.leave.service";
import { MeetingRoomLifecycleService } from "./services/meeting-room.lifecycle.service";
import { MeetingRoomMaintenanceService } from "./services/meeting-room.maintenance.service";
import { MeetingRoomQueryService } from "./services/meeting-room.query.service";
import { MeetingRoomSignals } from "./services/meeting-room.signals";
import { MeetingRoomStore, NodeMeetingRedisPort, type MeetingRedisPort } from "./services/meeting-room.store";
import { MeetingRoomWebhookService } from "./services/meeting-room.webhook.service";

export interface MeetingRoomOverrides {
  /** Cổng sang lõi cuộc gọi — mặc định `CallsRoomAdapter` (container `calls` thật). */
  calls?: MeetingCallPort;
  /** Redis tạm của phòng họp (phòng chờ, cờ duyệt) — test dùng `InMemoryMeetingRedisPort`. */
  roomRedis?: MeetingRedisPort;
  media?: () => IMediaServer;
  roomJobs?: MeetingRoomJobsPort;
}

export interface MeetingRoomKit {
  deps: MeetingRoomDeps;
  access: MeetingRoomAccess;
  signals: MeetingRoomSignals;
  join: MeetingRoomJoinService;
  lifecycle: MeetingRoomLifecycleService;
  lobby: MeetingLobbyService;
  host: MeetingHostControlService;
  leave: MeetingRoomLeaveService;
  query: MeetingRoomQueryService;
  maintenance: MeetingRoomMaintenanceService;
  webhook: MeetingRoomWebhookService;
  /** (p2-07) Consumer `meeting.force-end`: admin nền tảng kết thúc cưỡng bức cuộc họp LIVE. */
  forceEnd: MeetingForceEndService;
  events: MeetingRoomEventHandler;
}

/**
 * Dựng phần PHÒNG HỌP (p2-05) trên `MeetingDeps` của p2-04 — tách khỏi `meetings.container.ts` cho gọn. Toàn bộ tương tác với lõi cuộc gọi đi qua
 * `MeetingCallPort` (`CallsRoomAdapter`), media qua `getLiveKit()` (lười, test đổi `setMediaServerForTests`), trạng thái tạm qua Redis.
 */
export function createMeetingRoomKit(base: MeetingDeps, attendees: MeetingAttendeeService, notifyFn: NotifyFn, messages: SystemMessagePoster, o: MeetingRoomOverrides = {}): MeetingRoomKit {
  const deps: MeetingRoomDeps = {
    ...base,
    calls: o.calls ?? new CallsRoomAdapter(),
    store: new MeetingRoomStore(o.roomRedis ?? new NodeMeetingRedisPort()),
    media: o.media ?? (() => getLiveKit()),
    roomJobs: o.roomJobs ?? new QueueMeetingRoomJobs(),
  };
  const access = new MeetingRoomAccess(deps);
  const signals = new MeetingRoomSignals(deps, access);
  const join = new MeetingRoomJoinService(deps, access, signals);
  const lifecycle = new MeetingRoomLifecycleService(deps, access, signals, join);
  const host = new MeetingHostControlService(deps, access, signals, attendees);
  const maintenance = new MeetingRoomMaintenanceService(deps, signals, lifecycle, host);
  return {
    deps,
    access,
    signals,
    join,
    lifecycle,
    lobby: new MeetingLobbyService(deps, access, signals),
    host,
    leave: new MeetingRoomLeaveService(deps, access, signals, host, maintenance),
    query: new MeetingRoomQueryService(deps, access),
    maintenance,
    webhook: new MeetingRoomWebhookService(deps, signals, lifecycle, maintenance),
    forceEnd: new MeetingForceEndService(deps, lifecycle, notifyFn),
    events: new MeetingRoomEventHandler(deps, signals, lifecycle, notifyFn, messages),
  };
}
