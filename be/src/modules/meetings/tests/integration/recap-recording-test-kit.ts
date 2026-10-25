/**
 * Bộ dựng dùng chung cho test tích hợp BIÊN BẢN & GHI HÌNH (p2-06, Mongo in-memory replset thật): dựng trên `installRoomHarness` (container `calls` thật + Redis
 * in-memory + LiveKit giả) và thêm storage/capability giả cho tệp ghi hình. KHÔNG phải test (không khớp `*.test.ts`).
 */
import { LIMITS } from "../../../../core/constants/limits";
import { prisma } from "../../../../infrastructure/database";
import type { MediaEgress, NormalizedLiveKitEvent } from "../../../../infrastructure/media";
import type { MeetingsContainerOverrides } from "../../meetings.container";
import type { RecordingCapability, RecordingRuntimeLimits, RecordingStoragePort } from "../../services/recording-runtime";
import { cleanupRoomWorld, connectClient, createMeeting, installRoomHarness, joinMeeting, startMeeting, type RoomHarness } from "./meeting-room-test-kit";
import type { Api, World } from "./meetings-test-kit";

/** Storage giả: tệp "tồn tại" khi test `put` vào; URL ký mã hoá TTL để assert 900 s/60 s; ghi lại các khoá đã xoá. */
export class FakeRecordingStorage implements RecordingStoragePort {
  readonly objects = new Map<string, number>();
  readonly deleted: string[] = [];
  put(key: string, size: number): void {
    this.objects.set(key, size);
  }
  head(key: string): Promise<{ size: number } | null> {
    const size = this.objects.get(key);
    return Promise.resolve(size === undefined ? null : { size });
  }
  signedUrl(key: string, ttlSeconds: number): Promise<string> {
    return Promise.resolve(`https://s3.test/${key}?ttl=${ttlSeconds}`);
  }
  deleteObjects(keys: string[]): Promise<void> {
    for (const k of keys) {
      this.objects.delete(k);
      this.deleted.push(k);
    }
    return Promise.resolve();
  }
}

export class FakeCapability implements RecordingCapability {
  isAvailable = true;
  isEnabled = true;
  available(): boolean {
    return this.isAvailable;
  }
  enabled(): Promise<boolean> {
    return Promise.resolve(this.isEnabled);
  }
  keyPrefix(): string {
    return "recordings/";
  }
}

export const defaultRecordingLimits = (): RecordingRuntimeLimits => ({
  retentionDays: LIMITS.recording.retentionDays,
  concurrentMax: LIMITS.recording.concurrentMax,
  maxMinutes: LIMITS.recording.maxMinutes,
  consentRequestTtlSeconds: LIMITS.recording.consentRequestTtlSeconds,
  playbackUrlTtlSeconds: LIMITS.recording.playbackUrlTtlSeconds,
  downloadUrlTtlSeconds: LIMITS.recording.downloadUrlTtlSeconds,
  importMaxAttempts: LIMITS.recording.importMaxAttempts,
  attachmentsMax: LIMITS.meetingRecap.attachmentsMax,
  contentMax: LIMITS.meetingRecap.contentMax,
});

export interface RecordingHarness extends RoomHarness {
  storage: FakeRecordingStorage;
  capability: FakeCapability;
  limits: RecordingRuntimeLimits;
}

export function installRecordingHarness(over: MeetingsContainerOverrides = {}): RecordingHarness {
  const storage = new FakeRecordingStorage();
  const capability = new FakeCapability();
  const limits = defaultRecordingLimits();
  const h = installRoomHarness({ recordingStorage: storage, recordingCapability: capability, recordingLimits: () => Promise.resolve({ ...limits }), ...over });
  return { ...h, storage, capability, limits };
}

/** Phòng họp LIVE: C chủ trì, B đồng chủ trì (lịch), D/E được mời — B/D/E/C đã vào phòng (có mic + camera); A được mời nhưng CHƯA vào. */
export async function liveRoom(h: RoomHarness, api: Api, w: World, over: Record<string, unknown> = {}) {
  const m = await createMeeting(api, w, w.u.C!, { attendeeIds: [w.u.D!, w.u.E!, w.u.B!, w.u.A!], coHostIds: [w.u.B!], lobbyMode: "OFF", ...over });
  const s = await startMeeting(api, m, w.u.C!);
  if (s.status !== 200) throw new Error(`Bắt đầu họp lỗi ${s.status}: ${JSON.stringify(s.body)}`);
  const callId = s.body.data.callId as string;
  const room = s.body.data.livekitRoom as string;
  const joins: Record<string, { livekitRoom: string } & Record<string, unknown>> = { [w.u.C!]: s.body.data };
  for (const uid of [w.u.B!, w.u.D!, w.u.E!]) joins[uid] = (await joinMeeting(api, m.id, uid)).body.data;
  for (const [uid, j] of Object.entries(joins)) connectClient(h, j, uid, [{ sid: `mic-${uid}`, source: "MICROPHONE" }, { sid: `cam-${uid}`, source: "CAMERA" }]);
  await h.calls.reconcile.reconcile(callId);
  return { m, callId, room, joins };
}

/** Sự kiện webhook egress đã chuẩn hoá cho phòng `room`. */
export function egressEvent(type: "egress_started" | "egress_updated" | "egress_ended", room: string, egress: Partial<MediaEgress> & { egressId: string }): NormalizedLiveKitEvent {
  return {
    id: `evt-${Math.random().toString(36).slice(2)}`,
    type,
    roomName: room,
    createdAt: new Date().toISOString(),
    room: null,
    participant: null,
    track: null,
    egress: { roomName: room, status: "ACTIVE", startedAt: new Date().toISOString(), endedAt: null, error: null, files: [], ...egress },
  };
}

/** Bản ghi mới nhất của cuộc họp (đọc thẳng DB). */
export const latestRecording = (meetingId: string) => prisma.meetingRecording.findFirstOrThrow({ where: { meetingId }, orderBy: { createdAt: "desc" } });

/** Dọn dữ liệu p2-06 của các world (bản ghi, biên bản, asset/link, hàng outbox) TRƯỚC khi dọn world/phòng họp. */
export async function cleanupRecapWorld(worlds: World[]): Promise<void> {
  if (worlds.length === 0) return;
  const workspaceIds = worlds.map((w) => w.workspaceId);
  const recordings = await prisma.meetingRecording.findMany({ where: { workspaceId: { in: workspaceIds } }, select: { id: true } });
  const recaps = await prisma.meetingRecap.findMany({ where: { workspaceId: { in: workspaceIds } }, select: { id: true } });
  const targetIds = [...recordings.map((r) => r.id), ...recaps.map((r) => r.id)];
  const links = await prisma.assetLink.findMany({ where: { targetId: { in: targetIds } }, select: { assetId: true } });
  await prisma.assetLink.deleteMany({ where: { targetId: { in: targetIds } } });
  await prisma.asset.deleteMany({ where: { OR: [{ id: { in: links.map((l) => l.assetId) } }, { workspaceId: { in: workspaceIds } }] } });
  const meetings = await prisma.meeting.findMany({ where: { workspaceId: { in: workspaceIds } }, select: { id: true } });
  await prisma.outboxEvent.deleteMany({ where: { OR: [{ aggregateType: "MeetingRecording", aggregateId: { in: recordings.map((r) => r.id) } }, { aggregateType: "Meeting", jobName: "meeting.recap-reminder", aggregateId: { in: meetings.map((m) => m.id) } }] } });
  await prisma.meetingRecording.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
  await prisma.meetingRecap.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
  await cleanupRoomWorld(worlds);
}

/** Mongo in-memory không chạy `db push` ⇒ không có unique index — tạo tay `MeetingRecap.meetingId` (nhánh P2002 khi hai người cùng tạo bản đầu). */
export async function ensureRecapIndexes(): Promise<void> {
  await prisma.$runCommandRaw({ createIndexes: "MeetingRecap", indexes: [{ key: { meetingId: 1 }, name: "MeetingRecap_meetingId_key", unique: true }] });
}

/** Seed một asset READY của `ownerId` (scope MEETING) — mô phỏng client đã `POST /assets` + `complete`. */
export async function seedAsset(ownerId: string, workspaceId: string, over: { scope?: "MEETING" | "MESSAGE"; status?: "READY" | "UPLOADING"; name?: string } = {}): Promise<string> {
  const a = await prisma.asset.create({
    data: {
      ownerId,
      workspaceId,
      scope: over.scope ?? "MEETING",
      kind: "FILE",
      status: over.status ?? "READY",
      uploadMethod: "API_PUT",
      mime: "application/pdf",
      declaredSize: 1000,
      size: 1000,
      originalName: over.name ?? "bien-ban.pdf",
      storageKey: `test/${ownerId}/${Math.random().toString(36).slice(2)}.pdf`,
    },
  });
  return a.id;
}

/** Thao tác API hay dùng của luồng ghi hình cho MỘT world/harness. */
export function makeFlow(h: RoomHarness, api: Api, w: World) {
  const consentRequest = (meetingId: string, uid: string) => api("post", `/meetings/${meetingId}/recordings/consent-request`, uid, {});
  const consent = (meetingId: string, uid: string, body: Record<string, unknown>) => api("post", `/meetings/${meetingId}/recordings/consent`, uid, body);
  const start = (meetingId: string, uid: string, requestId: string, layout?: string) => api("post", `/meetings/${meetingId}/recordings`, uid, { requestId, ...(layout ? { layout } : {}) });
  const roomEvents = (callId: string, state?: string) => h.emitted.filter((e) => e.target === "room" && e.to === `call:${callId}` && e.event === "call:recording" && (!state || e.payload.state === state));

  /** Chủ trì C hỏi ý kiến, B/D/E đồng ý → `requestId` (A chưa vào phòng nên không tính). */
  async function allConsent(meetingId: string): Promise<string> {
    const req = await consentRequest(meetingId, w.u.C!);
    if (req.status !== 200) throw new Error(`consent-request lỗi ${req.status}: ${JSON.stringify(req.body)}`);
    const requestId = req.body.data.requestId as string;
    for (const uid of [w.u.B!, w.u.D!, w.u.E!]) await consent(meetingId, uid, { requestId, accept: true });
    return requestId;
  }

  /** Phòng LIVE + mọi người đồng ý + bắt đầu ghi (bản ghi STARTING); `chat` = tạo nhóm chat họp trước (để có thẻ tin hệ thống). */
  async function recording(over: Record<string, unknown> = {}, opts: { chat?: boolean } = {}) {
    const room = await liveRoom(h, api, w, over);
    let conversationId: string | null = null;
    if (opts.chat) {
      conversationId = (await api("post", `/meetings/${room.m.id}/chat-group`, w.u.C!)).body.data.conversationId as string;
      w.conversationIds.push(conversationId);
    }
    const requestId = await allConsent(room.m.id);
    const res = await start(room.m.id, w.u.C!, requestId);
    if (res.status !== 201) throw new Error(`Bắt đầu ghi lỗi ${res.status}: ${JSON.stringify(res.body)}`);
    return { ...room, requestId, conversationId, rec: res.body.data as { id: string; status: string } };
  }

  /** Egress kết thúc thành công với một tệp. */
  const complete = (room: string, egressId: string, file = { sizeBytes: 5_000_000, durationSeconds: 61.4 }) =>
    egressEvent("egress_ended", room, { egressId, status: "COMPLETE", endedAt: new Date().toISOString(), files: [{ filename: "a.mp4", location: "s3://bucket/a.mp4", ...file }] });

  return { consentRequest, consent, start, roomEvents, allConsent, recording, complete };
}
