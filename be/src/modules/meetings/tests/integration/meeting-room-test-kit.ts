/**
 * Bộ dựng dùng chung cho test tích hợp PHÒNG HỌP (p2-05, Mongo in-memory replset thật): container `calls` thật với Redis in-memory + LiveKit giả
 * (`InMemoryMediaServer`), container `meetings` gắn cổng gọi thật (`CallsRoomAdapter`), đồng hồ có thể tua, bộ ghi socket/job. KHÔNG phải test.
 */
import { randomUUID } from "crypto";
import { prisma } from "../../../../infrastructure/database";
import { InMemoryMediaServer, setMediaServerForTests, type NormalizedLiveKitEvent } from "../../../../infrastructure/media";
import { createCallsContainer, setCallsContainerForTests, type CallsContainer } from "../../../calls";
import { PrismaCallRepository } from "../../../calls/repositories/call.repository.prisma";
import { registerCallPermissionResolver } from "../../../calls/services/call-scope.resolver";
import { InMemoryCallRedisPort } from "../../../calls/services/call-redis.store";
import type { MeetingsContainerOverrides } from "../../meetings.container";
import { InMemoryMeetingRedisPort } from "../../services/meeting-room.store";
import { cleanupWorld, drainMeetingOutbox, idemKey, installHarness, meetingBody, slot, type Api, type MeetingsHarness, type World } from "./meetings-test-kit";

export interface Clock {
  offsetMs: number;
  now(): Date;
  advanceMinutes(minutes: number): void;
  advanceSeconds(seconds: number): void;
}

export function makeClock(): Clock {
  const clock: Clock = {
    offsetMs: 0,
    now: () => new Date(Date.now() + clock.offsetMs),
    advanceMinutes: (m) => {
      clock.offsetMs += m * 60_000;
    },
    advanceSeconds: (s) => {
      clock.offsetMs += s * 1000;
    },
  };
  return clock;
}

export interface RoomHarness extends MeetingsHarness {
  media: InMemoryMediaServer;
  callRedis: InMemoryCallRedisPort;
  roomRedis: InMemoryMeetingRedisPort;
  calls: CallsContainer;
  clock: Clock;
  reconciles: Array<{ callId: string; delayMs: number }>;
  graces: Array<{ meetingId: string; callId: string; delayMs: number }>;
  finalizes: Array<{ meetingId: string; callId: string }>;
  callEmitted: Array<{ target: "users" | "room"; to: string[] | string; event: string; payload: Record<string, unknown> }>;
}

export function installRoomHarness(over: MeetingsContainerOverrides = {}): RoomHarness {
  const clock = makeClock();
  const media = new InMemoryMediaServer();
  setMediaServerForTests(media);
  const callRedis = new InMemoryCallRedisPort();
  const roomRedis = new InMemoryMeetingRedisPort(() => clock.now().getTime());
  const reconciles: RoomHarness["reconciles"] = [];
  const graces: RoomHarness["graces"] = [];
  const finalizes: RoomHarness["finalizes"] = [];
  const callEmitted: RoomHarness["callEmitted"] = [];

  const calls = createCallsContainer({
    redisPort: callRedis,
    now: () => clock.now(),
    emitter: {
      toUsers: (to, event, payload) => callEmitted.push({ target: "users", to, event, payload: payload as Record<string, unknown> }),
      toRoom: (to, event, payload) => callEmitted.push({ target: "room", to, event, payload: payload as Record<string, unknown> }),
    },
    notify: () => Promise.resolve(),
    jobs: {
      scheduleReconcile: (callId, delayMs) => {
        reconciles.push({ callId, delayMs });
        return Promise.resolve();
      },
      scheduleHostFailover: () => Promise.resolve(),
    },
  });
  setCallsContainerForTests(calls);
  registerCallPermissionResolver(new PrismaCallRepository()); // guard room `call:{id}` + `revokeScope` scope CALL

  const h = installHarness({
    now: () => clock.now(),
    roomRedis,
    media: () => media,
    roomJobs: {
      scheduleHostGrace: (i, delayMs) => {
        graces.push({ ...i, delayMs });
        return Promise.resolve();
      },
      enqueueAttendanceFinalize: (i) => {
        finalizes.push(i);
        return Promise.resolve();
      },
    },
    ...over,
  });
  return { ...h, media, callRedis, roomRedis, calls, clock, reconciles, graces, finalizes, callEmitted };
}

export const deviceId = (): string => `dev-${randomUUID()}`;

/** Mongo in-memory không chạy `db push` ⇒ không có unique index — tạo tay những khoá mà luồng phòng họp dựa vào (P2002 → nhánh thua cuộc). */
export async function ensureRoomIndexes(): Promise<void> {
  await prisma.$runCommandRaw({ createIndexes: "Meeting", indexes: [{ key: { code: 1 }, name: "Meeting_code_key", unique: true }] });
  await prisma.$runCommandRaw({ createIndexes: "MeetingAttendee", indexes: [{ key: { meetingId: 1, userId: 1 }, name: "MeetingAttendee_meetingId_userId_key", unique: true }] });
  await prisma.$runCommandRaw({
    createIndexes: "Call",
    indexes: [
      { key: { activeKey: 1 }, name: "Call_activeKey_key", unique: true },
      { key: { livekitRoom: 1 }, name: "Call_livekitRoom_key", unique: true },
      { key: { initiatorId: 1, clientCallId: 1 }, name: "Call_initiatorId_clientCallId_key", unique: true },
    ],
  });
  await prisma.$runCommandRaw({ createIndexes: "CallParticipant", indexes: [{ key: { callId: 1, userId: 1 }, name: "CallParticipant_callId_userId_key", unique: true }] });
}

/** Dọn cả `Call`/`CallParticipant`/outbox `Call` của các cuộc họp trong world TRƯỚC khi dọn world (cần `meetingId`). */
export async function cleanupRoomWorld(worlds: World[]): Promise<void> {
  if (worlds.length === 0) return;
  const meetings = await prisma.meeting.findMany({ where: { workspaceId: { in: worlds.map((w) => w.workspaceId) } }, select: { id: true } });
  const meetingIds = meetings.map((m) => m.id);
  const calls = await prisma.call.findMany({ where: { scopeType: "MEETING", scopeId: { in: meetingIds } }, select: { id: true } });
  const callIds = calls.map((c) => c.id);
  await prisma.callParticipant.deleteMany({ where: { callId: { in: callIds } } });
  await prisma.outboxEvent.deleteMany({ where: { OR: [{ aggregateType: "Call", aggregateId: { in: callIds } }, { aggregateType: "Meeting", aggregateId: { in: meetingIds }, queue: "calls" }] } });
  await prisma.call.deleteMany({ where: { id: { in: callIds } } });
  await cleanupWorld(worlds);
}

export const drainRoomOutbox = (h: MeetingsHarness): Promise<number> => drainMeetingOutbox(h);

/** Sự kiện webhook LiveKit đã chuẩn hoá (JSON thuần) cho phòng `room`. */
export function lkEvent(type: string, room: string, opts: { identity?: string; track?: { sid: string; source: "CAMERA" | "MICROPHONE" | "SCREEN_SHARE" | "SCREEN_SHARE_AUDIO" } } = {}): NormalizedLiveKitEvent {
  return {
    id: `evt-${randomUUID()}`,
    type,
    roomName: room,
    createdAt: new Date().toISOString(),
    room: { sid: "RM_test", numParticipants: 0 },
    participant: opts.identity ? { identity: opts.identity, sid: `PA_${opts.identity}`, state: "ACTIVE", joinedAt: new Date().toISOString() } : null,
    track: opts.track ? { sid: opts.track.sid, source: opts.track.source, kind: opts.track.source === "MICROPHONE" || opts.track.source === "SCREEN_SHARE_AUDIO" ? "AUDIO" : "VIDEO", muted: false } : null,
    egress: null,
  };
}

// ── thao tác API hay dùng ────────────────────────────────────────────────────

export interface CreatedMeeting {
  id: string;
  code: string;
  version: number;
  startAt: string;
  endAt: string;
  myActions: Record<string, unknown>;
}

/** Tạo cuộc họp bắt đầu sau `startInMinutes` phút (mặc định 5 ⇒ đã trong cửa sổ vào phòng 10 phút). */
export async function createMeeting(api: Api, w: World, uid: string, over: Record<string, unknown> = {}, startInMinutes = 5): Promise<CreatedMeeting> {
  const res = await api("post", `/workspaces/${w.workspaceId}/meetings`, uid, meetingBody({ ...slot(startInMinutes, 60), ...over }), idemKey());
  if (res.status !== 201) throw new Error(`Tạo cuộc họp lỗi ${res.status}: ${JSON.stringify(res.body)}`);
  return res.body.data as CreatedMeeting;
}

export const startMeeting = (api: Api, m: { id: string; version: number }, uid: string, extra: Record<string, unknown> = {}) =>
  api("post", `/meetings/${m.id}/start`, uid, { expectedVersion: m.version, deviceId: deviceId(), ...extra });

export const joinMeeting = (api: Api, meetingId: string, uid: string, extra: Record<string, unknown> = {}) =>
  api("post", `/meetings/${meetingId}/join`, uid, { deviceId: deviceId(), ...extra });

/** Mô phỏng client LiveKit đã kết nối bằng token của lượt `join` (server điều khiển thật qua `InMemoryMediaServer`). */
export function connectClient(h: RoomHarness, join: { livekitRoom: string }, userId: string, tracks: Array<{ sid: string; source: "MICROPHONE" | "CAMERA" | "SCREEN_SHARE" }> = []): void {
  h.media.join(join.livekitRoom, {
    identity: userId,
    tracks: tracks.map((t) => ({ sid: t.sid, source: t.source, kind: t.source === "MICROPHONE" ? "AUDIO" : "VIDEO", muted: false })),
  });
}
