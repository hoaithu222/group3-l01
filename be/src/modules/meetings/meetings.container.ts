import { runtimeConfig } from "../../core/config/runtime-config";
import { LIMITS } from "../../core/constants/limits";
import { getConversationHooks, type ConversationHooks } from "../../core/permission";
import { withTransaction } from "../../infrastructure/database";
import { logger } from "../../infrastructure/logger";
import { mailService } from "../../infrastructure/mail";
import { emitToRoom, emitToUsers, leaveRooms } from "../../infrastructure/socket/socket.emit";
import { AuditService } from "../audit-log/audit-log.service";
import { createSystemMessageService } from "../messages/public";
import { notify } from "../notifications/public";
import { createRecapRecordingKit, type RecapRecordingKit, type RecapRecordingOverrides } from "./meeting-recap-recording.container";
import { createMeetingRoomKit, type MeetingRoomKit, type MeetingRoomOverrides } from "./meeting-room.container";
import { PrismaMeetingDirectory, type IMeetingDirectory } from "./repositories/meeting-directory.reader";
import { PrismaMeetingRecapRepository } from "./repositories/meeting-recap.repository.prisma";
import type { IMeetingRecapRepository } from "./repositories/meeting-recap.repository.interface";
import { PrismaMeetingRecordingRepository } from "./repositories/meeting-recording.repository.prisma";
import type { IMeetingRecordingRepository } from "./repositories/meeting-recording.repository.interface";
import { PrismaMeetingRepository } from "./repositories/meeting.repository.prisma";
import type { IMeetingRepository } from "./repositories/meeting.repository.interface";
import { PrismaOutboxPort, PrismaTxRunner, type IOutboxPort, type ITxRunner } from "./repositories/tx";
import type { AuditPort, MeetingDeps, MeetingEmitter, MeetingRuntimeLimits } from "./services/meeting.deps";
import { MeetingAttendeeService } from "./services/meeting-attendee.service";
import { MeetingChatGroupService } from "./services/meeting-chat-group.service";
import { MeetingConversationSync } from "./services/meeting-conversation-sync.service";
import { MeetingDtoMapper } from "./services/meeting-dto.mapper";
import { MeetingEventHandler, type NotifyFn } from "./services/meeting-event.handler";
import { MeetingIcsService, type MailPort } from "./services/meeting-ics.service";
import { QueueMeetingJobs, type MeetingJobsPort } from "./services/meeting-jobs.port";
import { MeetingLifecycleService } from "./services/meeting-lifecycle.service";
import { MeetingQueryService } from "./services/meeting-query.service";
import { MeetingReminderService, type SystemMessagePoster } from "./services/meeting-reminder.service";
import { MeetingService } from "./services/meeting.service";

/** Socket qua `socket.emit.ts` — worker (không có `getIO()`) phát qua cầu nối Redis (p0-03); vẫn best-effort, client đồng bộ lại qua REST (`/me/meetings`). */
const defaultEmitter: MeetingEmitter = {
  toUsers(userIds, event, payload) {
    try {
      emitToUsers(userIds, event, payload);
    } catch (err) {
      logger.warn("[meetings] Không phát được socket (user)", { event, error: err instanceof Error ? err.message : String(err) });
    }
  },
  toRoom(room, event, payload) {
    try {
      emitToRoom(room, event, payload);
    } catch (err) {
      logger.warn("[meetings] Không phát được socket (room)", { event, error: err instanceof Error ? err.message : String(err) });
    }
  },
  leaveRooms(userIds, rooms) {
    try {
      leaveRooms(userIds, rooms);
    } catch (err) {
      logger.warn("[meetings] Không đá được khỏi room", { error: err instanceof Error ? err.message : String(err) });
    }
  },
};

const defaultNotify: NotifyFn = async (input) => {
  await withTransaction(async (tx) => {
    await notify(tx, input);
  });
};

async function runtimeLimits(): Promise<MeetingRuntimeLimits> {
  const eff = await runtimeConfig.getEffective("limits.meeting");
  const num = (key: string, fallback: number): number => (typeof eff[key] === "number" ? eff[key] : fallback);
  return {
    attendeesMax: num("attendeesMax", LIMITS.meeting.attendeesMax),
    remindersMax: num("remindersMax", LIMITS.meeting.remindersMax),
    joinWindowMinutes: num("joinWindowMinutes", LIMITS.meeting.joinWindowMinutes),
    maxParticipants: num("maxParticipants", LIMITS.meeting.maxParticipants),
    maxMinutes: num("maxMinutes", LIMITS.meeting.maxMinutes),
    titleMax: num("titleMax", LIMITS.meeting.titleMax),
    agendaMax: num("agendaMax", LIMITS.meeting.agendaMax),
    restartWindowMinutes: num("restartWindowMinutes", LIMITS.meeting.restartWindowMinutes),
  };
}

export interface MeetingsContainerOverrides extends MeetingRoomOverrides, RecapRecordingOverrides {
  repo?: IMeetingRepository;
  dir?: IMeetingDirectory;
  recaps?: IMeetingRecapRepository;
  recordings?: IMeetingRecordingRepository;
  tx?: ITxRunner;
  outbox?: IOutboxPort;
  audit?: AuditPort;
  emitter?: MeetingEmitter;
  limits?: () => Promise<MeetingRuntimeLimits>;
  now?: () => Date;
  jobs?: MeetingJobsPort;
  notify?: NotifyFn;
  mail?: MailPort;
  systemMessages?: SystemMessagePoster;
  hooks?: () => ConversationHooks | null;
}

export interface MeetingsContainer {
  deps: MeetingDeps;
  jobs: MeetingJobsPort;
  mapper: MeetingDtoMapper;
  meetings: MeetingService;
  attendees: MeetingAttendeeService;
  query: MeetingQueryService;
  ics: MeetingIcsService;
  events: MeetingEventHandler;
  reminders: MeetingReminderService;
  conversationSync: MeetingConversationSync;
  lifecycle: MeetingLifecycleService;
  /** (p2-05) Phòng họp: start/join/leave/end, phòng chờ, điều khiển chủ trì, webhook LiveKit, việc nền. */
  room: MeetingRoomKit;
  /** (p2-05) "Tạo nhóm chat cho cuộc họp" ngay trong phòng. */
  chatGroup: MeetingChatGroupService;
  /** (p2-06) Biên bản họp + ghi hình room-composite: đồng ý, bắt đầu/dừng, webhook egress, import, retention, sink `meeting.events`. */
  recapRecording: RecapRecordingKit;
}

/** Dựng đồ thị phụ thuộc (DI thủ công) dùng chung routes (API) và job (worker) — như `getCallsContainer()`. */
export function createMeetingsContainer(o: MeetingsContainerOverrides = {}): MeetingsContainer {
  const deps: MeetingDeps = {
    repo: o.repo ?? new PrismaMeetingRepository(),
    dir: o.dir ?? new PrismaMeetingDirectory(),
    recaps: o.recaps ?? new PrismaMeetingRecapRepository(),
    recordings: o.recordings ?? new PrismaMeetingRecordingRepository(),
    tx: o.tx ?? new PrismaTxRunner(),
    outbox: o.outbox ?? new PrismaOutboxPort(),
    audit: o.audit ?? new AuditService(),
    emitter: o.emitter ?? defaultEmitter,
    limits: o.limits ?? runtimeLimits,
    now: o.now ?? (() => new Date()),
  };
  const jobs = o.jobs ?? new QueueMeetingJobs();
  const notifyFn = o.notify ?? defaultNotify;
  const mapper = new MeetingDtoMapper();
  const meetings = new MeetingService(deps);
  const attendees = new MeetingAttendeeService(deps);
  const systemMessages = o.systemMessages ?? createSystemMessageService();
  const room = createMeetingRoomKit(deps, attendees, notifyFn, systemMessages, { calls: o.calls, roomRedis: o.roomRedis, media: o.media, roomJobs: o.roomJobs });
  const recapRecording = createRecapRecordingKit(room, notifyFn, systemMessages, { assets: o.assets, recordingStorage: o.recordingStorage, recordingCapability: o.recordingCapability, recordingLimits: o.recordingLimits, adminRecordingReader: o.adminRecordingReader });
  const conversationSync = new MeetingConversationSync(deps, o.hooks ?? getConversationHooks);
  return {
    deps,
    jobs,
    mapper,
    meetings,
    attendees,
    query: new MeetingQueryService(deps, mapper, (m, userId) => (m.currentCallId ? room.deps.calls.isRemoved(m.currentCallId, userId) : Promise.resolve(false))),
    ics: new MeetingIcsService(deps, o.mail ?? mailService),
    events: new MeetingEventHandler(deps, jobs, notifyFn, room.events, recapRecording.events),
    reminders: new MeetingReminderService(deps, jobs, notifyFn, systemMessages),
    conversationSync,
    lifecycle: new MeetingLifecycleService(deps, meetings, attendees),
    room,
    chatGroup: new MeetingChatGroupService(room.deps, room.access, conversationSync),
    recapRecording,
  };
}

let container: MeetingsContainer | null = null;

export function getMeetingsContainer(): MeetingsContainer {
  container ??= createMeetingsContainer();
  return container;
}

/** Test: thay container (`null` = dựng lại mặc định lần sau). */
export function setMeetingsContainerForTests(next: MeetingsContainer | null): void {
  container = next;
}
