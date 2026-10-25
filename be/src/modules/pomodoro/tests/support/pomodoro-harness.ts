/**
 * Bộ dựng dùng chung cho unit test service/runner Pomodoro (repo in-memory + cổng giả, KHÔNG Mongo/Redis/LiveKit thật): đồng hồ có thể tua, outbox
 * ghi lại, cổng `calls` giả cấu hình được, socket ghi lại. KHÔNG phải test (không khớp `*.test.ts`).
 */
import type { AuthUser } from "../../../../core/types/express";
import { newObjectId } from "../../../../core/utils/object-id";
import { InMemoryMediaServer, type MediaTrackSource } from "../../../../infrastructure/media";
import type { OutboxEventInput } from "../../../../infrastructure/queue";
import { createPomodoroContainer, type PomodoroContainer } from "../../pomodoro.container";
import type { PomodoroConfig } from "../../entities/pomodoro.interface";
import { InMemoryPomodoroRepository } from "../../repositories/pomodoro.repository.inmemory";
import type { IOutboxPort, ITxRunner, TxHandle } from "../../repositories/tx";
import { InMemoryPomodoroRedisPort } from "../../services/pomodoro-command.store";
import { defaultPomodoroConfig } from "../../services/pomodoro-config";
import type {
  EnterRequest,
  EnterResult,
  IPomodoroAccess,
  IPomodoroChannelReader,
  IPomodoroJobs,
  PomodoroCall,
  PomodoroCallPort,
  PomodoroChannelInfo,
  PomodoroParticipant,
} from "../../services/pomodoro.ports";

export interface Clock {
  offsetMs: number;
  now(): Date;
  advanceMs(ms: number): void;
  advanceMinutes(minutes: number): void;
}

export function makeClock(start = new Date("2026-09-25T08:00:00.000Z")): Clock {
  const clock: Clock = {
    offsetMs: 0,
    now: () => new Date(start.getTime() + clock.offsetMs),
    advanceMs: (ms) => {
      clock.offsetMs += ms;
    },
    advanceMinutes: (m) => {
      clock.offsetMs += m * 60_000;
    },
  };
  return clock;
}

export class RecordingOutbox implements IOutboxPort {
  readonly events: OutboxEventInput[] = [];

  add(_tx: TxHandle, event: OutboxEventInput): Promise<void> {
    if (this.events.some((e) => e.dedupeKey === event.dedupeKey)) return Promise.reject(new Error(`Duplicate outbox dedupeKey ${event.dedupeKey}`));
    this.events.push(event);
    return Promise.resolve();
  }

  named(jobName: string): OutboxEventInput[] {
    return this.events.filter((e) => e.jobName === jobName);
  }
}

export class InlineTx implements ITxRunner {
  run<T>(fn: (tx: TxHandle) => Promise<T>): Promise<T> {
    return fn({} as TxHandle);
  }
}

export class FakeChannels implements IPomodoroChannelReader {
  readonly map = new Map<string, PomodoroChannelInfo>();
  readonly userNamesMap = new Map<string, string>();

  add(over: Partial<PomodoroChannelInfo> = {}): PomodoroChannelInfo {
    const channel: PomodoroChannelInfo = {
      id: newObjectId(),
      workspaceId: newObjectId(),
      name: "Phòng tập trung",
      type: "POMODORO",
      status: "ACTIVE",
      workspaceActive: true,
      defaultConfig: defaultPomodoroConfig(),
      ...over,
    };
    this.map.set(channel.id, channel);
    return channel;
  }

  get(channelId: string): Promise<PomodoroChannelInfo | null> {
    const c = this.map.get(channelId);
    return Promise.resolve(c ? { ...c } : null);
  }

  names(channelIds: string[]): Promise<Map<string, string>> {
    return Promise.resolve(new Map(channelIds.flatMap((id) => (this.map.has(id) ? [[id, this.map.get(id)!.name] as [string, string]] : []))));
  }

  userNames(userIds: string[]): Promise<Map<string, string>> {
    return Promise.resolve(new Map(userIds.map((id) => [id, this.userNamesMap.get(id) ?? `Người ${id.slice(-4)}`] as [string, string])));
  }

  saveDefaultConfig(channelId: string, config: PomodoroConfig): Promise<void> {
    const c = this.map.get(channelId);
    if (c) this.map.set(channelId, { ...c, defaultConfig: config });
    return Promise.resolve();
  }
}

export class FakeAccess implements IPomodoroAccess {
  readonly managers = new Set<string>();

  canManage(user: AuthUser): Promise<boolean> {
    return Promise.resolve(this.managers.has(user.id));
  }

  canRead(): Promise<boolean> {
    return Promise.resolve(true);
  }
}

export class FakeJobs implements IPomodoroJobs {
  readonly hostSyncs: Array<{ sessionId: string; delayMs: number }> = [];

  scheduleHostSync(sessionId: string, delayMs: number): Promise<void> {
    this.hostSyncs.push({ sessionId, delayMs });
    return Promise.resolve();
  }
}

/** Cổng `calls` giả: phòng/participant nằm trong bộ nhớ, đủ cho snapshot/runner/media-sync; `enter` đơn giản (không đá thiết bị). */
export class FakeCallPort implements PomodoroCallPort {
  readonly calls = new Map<string, PomodoroCall>();
  readonly members = new Map<string, PomodoroParticipant[]>();
  readonly ended: Array<{ callId: string; reason: string }> = [];
  private lock: string | null = null;

  addCall(over: Partial<PomodoroCall> = {}): PomodoroCall {
    const id = over.id ?? newObjectId();
    const call: PomodoroCall = { id, livekitRoom: `call_${id}`, status: "ACTIVE", endReason: null, hostId: null, version: 1, startedAt: new Date(), ...over };
    this.calls.set(id, call);
    this.members.set(id, []);
    return call;
  }

  addMember(callId: string, userId: string, over: Partial<PomodoroParticipant> = {}): PomodoroParticipant {
    const p: PomodoroParticipant = {
      userId,
      role: "MEMBER",
      state: "CONNECTED",
      publishPermissions: { audio: true, video: true, screen: true },
      mutedByHost: false,
      respondedDeviceId: "dev-fake-0001",
      firstJoinedAt: new Date(),
      version: 1,
      ...over,
    };
    this.members.set(callId, [...(this.members.get(callId) ?? []).filter((m) => m.userId !== userId), p]);
    return p;
  }

  acquireActive(_channelId: string, callId: string): Promise<{ acquired: true } | { acquired: false; existing: string }> {
    if (this.lock) return Promise.resolve({ acquired: false, existing: this.lock });
    this.lock = callId;
    return Promise.resolve({ acquired: true });
  }

  promoteActive(): Promise<boolean> {
    return Promise.resolve(true);
  }

  releaseActive(): Promise<boolean> {
    this.lock = null;
    return Promise.resolve(true);
  }

  createRoomCall(_tx: TxHandle, i: { callId: string; hostId: string; livekitRoom: string }): Promise<PomodoroCall> {
    return Promise.resolve(this.addCall({ id: i.callId, hostId: i.hostId, livekitRoom: i.livekitRoom }));
  }

  findCall(callId: string): Promise<PomodoroCall | null> {
    const c = this.calls.get(callId);
    return Promise.resolve(c ? { ...c } : null);
  }

  awaitCall(callId: string): Promise<PomodoroCall | null> {
    return this.findCall(callId);
  }

  findOpenCall(): Promise<PomodoroCall | null> {
    return Promise.resolve([...this.calls.values()].find((c) => c.status !== "ENDED") ?? null);
  }

  listParticipants(callId: string): Promise<PomodoroParticipant[]> {
    return Promise.resolve((this.members.get(callId) ?? []).map((p) => ({ ...p })));
  }

  findParticipant(callId: string, userId: string): Promise<PomodoroParticipant | null> {
    const p = (this.members.get(callId) ?? []).find((m) => m.userId === userId);
    return Promise.resolve(p ? { ...p } : null);
  }

  enter(r: EnterRequest): Promise<EnterResult> {
    const p = this.addMember(r.callId, r.userId, { state: "JOINING", role: r.role, publishPermissions: r.publish, respondedDeviceId: r.deviceId });
    return Promise.resolve({ kind: "OK", participant: p, rejoined: false });
  }

  claimBusy(): Promise<void> {
    return Promise.resolve();
  }

  releaseBusy(): Promise<void> {
    return Promise.resolve();
  }

  issueToken(): Promise<{ token: string; livekitUrl: string; expiresAt: string }> {
    return Promise.resolve({ token: "tok", livekitUrl: "ws://localhost:7880", expiresAt: new Date().toISOString() });
  }

  buildCallDto(_user: AuthUser, callId: string): Promise<unknown> {
    return Promise.resolve({ id: callId });
  }

  endCall(callId: string, reason: string): Promise<void> {
    this.ended.push({ callId, reason });
    const c = this.calls.get(callId);
    if (c) this.calls.set(callId, { ...c, status: "ENDED", endReason: reason });
    return Promise.resolve();
  }

  setPublish(callId: string, userId: string, publish: PomodoroParticipant["publishPermissions"]): Promise<PomodoroParticipant | null> {
    const p = (this.members.get(callId) ?? []).find((m) => m.userId === userId);
    if (!p) return Promise.resolve(null);
    p.publishPermissions = { ...publish };
    return Promise.resolve({ ...p });
  }

  baseSources(p: PomodoroParticipant): MediaTrackSource[] {
    const s: MediaTrackSource[] = [];
    if (p.publishPermissions.audio && !p.mutedByHost) s.push("MICROPHONE");
    if (p.publishPermissions.video) s.push("CAMERA");
    if (p.publishPermissions.screen) s.push("SCREEN_SHARE", "SCREEN_SHARE_AUDIO");
    return s;
  }
}

export interface Harness {
  c: PomodoroContainer;
  clock: Clock;
  repo: InMemoryPomodoroRepository;
  outbox: RecordingOutbox;
  channels: FakeChannels;
  access: FakeAccess;
  jobs: FakeJobs;
  calls: FakeCallPort;
  media: InMemoryMediaServer;
  redis: InMemoryPomodoroRedisPort;
  /** Số lần phát `pomodoro:updated` (mỗi phần tử = một lượt phát cho phòng `ch:{channelId}`). */
  emitted: Array<{ room: string; event: string; payload: Record<string, unknown> }>;
  user(name?: string): AuthUser;
}

export function makeHarness(): Harness {
  const clock = makeClock();
  const repo = new InMemoryPomodoroRepository(() => clock.now());
  const outbox = new RecordingOutbox();
  const channels = new FakeChannels();
  const access = new FakeAccess();
  const jobs = new FakeJobs();
  const calls = new FakeCallPort();
  const media = new InMemoryMediaServer();
  const redis = new InMemoryPomodoroRedisPort(() => clock.now().getTime());
  const emitted: Harness["emitted"] = [];
  const c = createPomodoroContainer({
    repo,
    tx: new InlineTx(),
    outbox,
    calls,
    channels,
    access,
    jobs,
    redisPort: redis,
    now: () => clock.now(),
    socket: { emit: (room, event, payload) => emitted.push({ room, event, payload: payload as Record<string, unknown> }) },
  });
  // `deps.media` mặc định gọi `getLiveKit()` — thay bằng máy chủ giả của bộ dựng (không mạng).
  c.deps.media = () => media;
  return {
    c,
    clock,
    repo,
    outbox,
    channels,
    access,
    jobs,
    calls,
    media,
    redis,
    emitted,
    user: (name = "u") => ({ id: newObjectId(), email: `${name}@e.com`, name }) as AuthUser,
  };
}
