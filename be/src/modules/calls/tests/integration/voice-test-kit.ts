/**
 * Bộ dựng dùng chung cho test tích hợp PHÒNG THOẠI KÊNH (p2-03): mở rộng `calls-test-kit` (world, harness, api) bằng kênh VOICE,
 * người tham gia thêm (đủ để thử trần 8 chỗ), mô phỏng LiveKit (join + webhook) và "relay" outbox. KHÔNG phải test.
 * ⚠ Phải import SAU `calls-test-mocks` (mock Redis/cờ `voice`) như mọi test tích hợp của `calls`.
 */
import express from "express";
import { errorHandler, notFoundHandler } from "../../../../core/middlewares";
import { clearRevokeListeners, registerRevokeListener, resetPermissionPorts, setPermissionPorts } from "../../../../core/permission";
import { normalizeSearch } from "../../../../core/utils/normalize";
import { newObjectId } from "../../../../core/utils/object-id";
import { prisma } from "../../../../infrastructure/database";
import { dispatchLiveKitEvent, type MediaTrackInfo, type NormalizedLiveKitEvent } from "../../../../infrastructure/media";
import "../../../workspaces/workspaces.routes"; // side-effect: đăng ký resolver scope WORKSPACE
import "../../../channels/channels.routes"; // side-effect: đăng ký resolver scope CHANNEL
import { registerChannelModule } from "../../../channels";
import { registerConversationModule } from "../../../conversations";
import callsRoutes from "../../calls.routes";
import { registerCallsModule } from "../../index";
import type { CallRevocationInput } from "../../services/call-revocation.service";
import "../../jobs/call.jobs"; // side-effect: đăng ký handler webhook LiveKit tiền tố `call_`
import { cleanupWorld, seedWorld, type CallsHarness, type World } from "./calls-test-kit";

export interface VoiceWorld extends World {
  channelIds: string[];
}

let appInstance: express.Express | null = null;

export function buildVoiceApp(): express.Express {
  if (appInstance) return appInstance;
  registerConversationModule();
  registerChannelModule(); // sau khi `workspaces.routes` đã đăng ký resolver WORKSPACE; đăng ký luôn MessageScope CHANNEL (tin tóm tắt)
  registerCallsModule();
  const app = express();
  app.use(express.json());
  app.use("/api/v1", callsRoutes);
  app.use(notFoundHandler);
  app.use(errorHandler);
  appInstance = app;
  return app;
}

/** World chuẩn (A..F) + `extra` người dùng thêm (G, H, I…) — mọi người đều là MEMBER ACTIVE của workspace. */
export async function seedVoiceWorld(extra: string[] = []): Promise<VoiceWorld> {
  const base = await seedWorld();
  for (const name of extra) {
    const id = newObjectId();
    base.u[name] = id;
    await prisma.user.create({ data: { id, email: `${id}@e.com`, name: `Người ${name}`, normalizedName: normalizeSearch(`Người ${name}`) } });
    await prisma.workspaceMembership.create({ data: { workspaceId: base.workspaceId, userId: id, role: "MEMBER", status: "ACTIVE" } });
  }
  return { ...base, channelIds: [] };
}

export interface SeedChannelOptions {
  name?: string;
  type?: "TEXT" | "VOICE";
  visibility?: "PUBLIC" | "PRIVATE";
  status?: "ACTIVE" | "ARCHIVED";
  /** Kênh riêng tư: những người có grant DIRECT (MEMBER). */
  grantTo?: string[];
  voiceSettings?: { allowVideo: boolean; maxParticipants: number };
}

export async function seedChannel(w: VoiceWorld, opts: SeedChannelOptions = {}): Promise<string> {
  const id = newObjectId();
  const name = opts.name ?? `phong-${id.slice(-5)}`;
  const visibility = opts.visibility ?? "PUBLIC";
  await prisma.channel.create({
    data: {
      id,
      workspaceId: w.workspaceId,
      name,
      normalizedName: normalizeSearch(name),
      type: opts.type ?? "VOICE",
      visibility,
      postingPolicy: "MEMBERS",
      status: opts.status ?? "ACTIVE",
      isDefault: false,
      position: 0,
      lastSeq: 0,
      memberCount: opts.grantTo?.length ?? 0,
      createdBy: w.u.A!,
      version: 1,
      ...(opts.voiceSettings ? { voiceSettings: opts.voiceSettings } : {}),
    },
  });
  for (const userId of opts.grantTo ?? []) {
    await prisma.channelGrant.create({
      data: { channelId: id, workspaceId: w.workspaceId, userId, level: "MEMBER", source: "DIRECT", roleRef: null, subjectKey: userId, grantedBy: w.u.A! },
    });
  }
  w.channelIds.push(id);
  return id;
}

/** Xoá dữ liệu kênh của test rồi dọn phần còn lại như `cleanupWorld`. */
export async function cleanupVoiceWorld(worlds: VoiceWorld[]): Promise<void> {
  const channelIds = worlds.flatMap((w) => w.channelIds);
  if (channelIds.length > 0) {
    const messageIds = (await prisma.message.findMany({ where: { scopeType: "CHANNEL", scopeId: { in: channelIds } }, select: { id: true } })).map((m) => m.id);
    await prisma.outboxEvent.deleteMany({ where: { aggregateType: "Message", aggregateId: { in: messageIds } } });
    await prisma.message.deleteMany({ where: { scopeType: "CHANNEL", scopeId: { in: channelIds } } });
    await prisma.channelGrant.deleteMany({ where: { channelId: { in: channelIds } } });
    await prisma.channelMembership.deleteMany({ where: { channelId: { in: channelIds } } });
    await prisma.channel.deleteMany({ where: { id: { in: channelIds } } });
  }
  await cleanupWorld(worlds);
}

// ── mô phỏng LiveKit ───────────────────────────────────────────────────────────

export const roomOf = (callId: string): string => `call_${callId}`;

export function lkEvent(type: string, room: string, opts: { identity?: string; track?: MediaTrackInfo } = {}): NormalizedLiveKitEvent {
  return {
    id: `evt-${Math.random().toString(36).slice(2)}`,
    type,
    roomName: room,
    createdAt: new Date().toISOString(),
    room: null,
    participant: opts.identity ? { identity: opts.identity, sid: `PA_${opts.identity.slice(-4)}`, state: "ACTIVE", joinedAt: null } : null,
    track: opts.track ?? null,
    egress: null,
  };
}

export const MIC: MediaTrackInfo = { sid: "TR_mic", source: "MICROPHONE", kind: "AUDIO", muted: false };
export const CAM: MediaTrackInfo = { sid: "TR_cam", source: "CAMERA", kind: "VIDEO", muted: false };
export const SCREEN: MediaTrackInfo = { sid: "TR_scr", source: "SCREEN_SHARE", kind: "VIDEO", muted: false };

/** Máy khách kết nối LiveKit thành công: có trong `listParticipants` + webhook `participant_joined` → participant `CONNECTED`. */
export async function connect(h: CallsHarness, callId: string, userId: string, tracks: MediaTrackInfo[] = []): Promise<void> {
  h.media.join(roomOf(callId), { identity: userId, tracks: tracks.map((t) => ({ ...t })) });
  await dispatchLiveKitEvent(lkEvent("participant_joined", roomOf(callId), { identity: userId }));
}

/** Máy khách mất kết nối: rời `listParticipants` + webhook `participant_left`. */
export async function disconnect(h: CallsHarness, callId: string, userId: string): Promise<void> {
  h.media.leave(roomOf(callId), userId);
  await dispatchLiveKitEvent(lkEvent("participant_left", roomOf(callId), { identity: userId }));
}

/** Giải mã phần `video` (grant LiveKit) của JWT token — kiểm nguồn được phát ở phía SERVER cấp. */
export function grantOf(token: string): { canPublish?: boolean; canPublishSources?: string[]; roomAdmin?: boolean; room?: string } {
  const payload = JSON.parse(Buffer.from(token.split(".")[1]!, "base64url").toString("utf8")) as { video?: Record<string, unknown> };
  return (payload.video ?? {}) as { canPublish?: boolean; canPublishSources?: string[]; roomAdmin?: boolean; room?: string };
}

// ── cổng quyền + listener thu hồi ─────────────────────────────────────────────

export interface PermissionSpy {
  leftRooms: Array<{ userIds: string[]; rooms: string[] }>;
}

/** Cổng permission giả (không Socket.IO/BullMQ thật) để `revokeScope`/host action `remove` chạy trong test; ghi lại room bị đá. */
export function installPermissionPorts(): PermissionSpy {
  const spy: PermissionSpy = { leftRooms: [] };
  setPermissionPorts({
    realtime: {
      leaveRooms: (userIds, rooms) => {
        spy.leftRooms.push({ userIds, rooms });
        return Promise.resolve();
      },
      emitToUsers: () => Promise.resolve(),
    },
    outbox: { enqueueNow: () => Promise.resolve() },
  });
  return spy;
}

export function resetPermissionSpy(): void {
  clearRevokeListeners();
  resetPermissionPorts();
}

/** Mô phỏng job `call.revocation`: listener gọi thẳng service (trong sản xuất là job queue `calls`), như `registerCallRevokeListener`. */
export function wireRevocation(h: CallsHarness): void {
  clearRevokeListeners();
  registerRevokeListener("calls.revocation", async (input) => {
    if (!["CONVERSATION", "CHANNEL", "WORKSPACE", "MEETING"].includes(input.scope.type)) return;
    await h.container.revocation.handle({
      scopeType: input.scope.type as CallRevocationInput["scopeType"],
      scopeId: input.scope.id,
      userIds: input.userIds,
      reason: input.reason,
    });
  });
}
