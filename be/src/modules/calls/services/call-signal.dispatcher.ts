import type { Prisma } from "@prisma/client";
import { withTransaction } from "../../../infrastructure/database";
import { logger } from "../../../infrastructure/logger";
import { emitToRoom, emitToUsers } from "../../../infrastructure/socket/socket.emit";
import { ROOM } from "../../../infrastructure/socket/socket.rooms";
import { SocketEvent } from "../../../infrastructure/socket/socket.events";
import { getMessageScope } from "../../messages/public";
import { notify, type NotifyInput } from "../../notifications/public";
import type { CallSignalPayload } from "../events/call-outbox.events";
import type { CallEndReasonValue, CallEntity, CallParticipantEntity } from "../entities/call.interface";
import type { CallDeps } from "./call.deps";

export interface CallEmitter {
  toUsers(userIds: string[], event: string, payload: object): void;
  toRoom(room: string, event: string, payload: object): void;
}

export type NotifyFn = (input: NotifyInput) => Promise<void>;

/** Người đọc được kênh riêng tư (nhận `channel:voice-activity`); mặc định lấy từ adapter `MessageScope` CHANNEL (chưa đăng ký → rỗng). */
export type ChannelAudienceFn = (channelId: string) => Promise<string[]>;

export const defaultChannelAudience: ChannelAudienceFn = async (channelId) => (await getMessageScope("CHANNEL")?.readerIds(channelId)) ?? [];

/** Người hiển thị trong phòng (khớp preview): `CONNECTED`/`RECONNECTING` — `JOINING` chưa tính để số không nhảy lên xuống. */
const isShown = (p: Pick<CallParticipantEntity, "state">): boolean => p.state === "CONNECTED" || p.state === "RECONNECTING";

interface RoomExtras {
  count: number;
  name: string;
  avatarUrl: string | null;
  isHost: boolean;
  sharingScreen: boolean;
}

/**
 * Socket qua `socket.emit.ts`: job này chạy ở worker (không có `getIO()`) nên gói đi qua cầu nối Redis (`socket.bridge.ts`, p0-03) tới mọi instance
 * API. Vẫn best-effort ("tối đa một lần", Redis lỗi thì bỏ) — client đồng bộ lại qua REST (`/me/active-call`), push lo phần chuông.
 */
export const defaultEmitter: CallEmitter = {
  toUsers(userIds, event, payload) {
    try {
      emitToUsers(userIds, event, payload);
    } catch (err) {
      logger.warn("[calls.dispatch] Không phát được socket (user)", { event, error: err instanceof Error ? err.message : String(err) });
    }
  },
  toRoom(room, event, payload) {
    try {
      emitToRoom(room, event, payload);
    } catch (err) {
      logger.warn("[calls.dispatch] Không phát được socket (room)", { event, error: err instanceof Error ? err.message : String(err) });
    }
  },
};

/** `notify()` cần transaction do caller mở (ghi Notification + Outbox `deliver.recipient` nguyên tử). */
export const defaultNotify: NotifyFn = async (input) => {
  await withTransaction(async (tx: Prisma.TransactionClient) => {
    await notify(tx, input);
  });
};

/**
 * Sink của module KHÁC nhận mọi tín hiệu `call.signal-dispatch` (p2-07 admin media: invalidate bảng theo `call.ended`) — cùng mẫu
 * `registerMeetingEventSink`/`registerTaskEventSink`: mỗi cặp (queue, jobName) chỉ có 1 processor nên module ngoài đăng ký sink thay vì đòi
 * hàng outbox riêng. Đăng ký lúc import file job (worker); lỗi sink chỉ log — không làm job retry (các bước trước đã idempotent nhưng tốn).
 */
export type CallSignalSink = (payload: CallSignalPayload) => Promise<void>;
const sinks = new Map<string, CallSignalSink>();
export function registerCallSignalSink(name: string, sink: CallSignalSink): void {
  sinks.set(name, sink);
}
export function clearCallSignalSinks(): void {
  sinks.clear();
}
async function runCallSignalSinks(p: CallSignalPayload): Promise<void> {
  for (const [name, sink] of sinks) {
    try {
      await sink(p);
    } catch (err) {
      logger.warn("[calls.dispatch] Sink lỗi (bỏ qua)", { sink: name, event: p.event, error: err instanceof Error ? err.message : String(err) });
    }
  }
}

function cancelReason(reason: CallEndReasonValue): "CANCELLED" | "NO_ANSWER" {
  return reason === "NO_ANSWER" ? "NO_ANSWER" : "CANCELLED";
}

/**
 * Job `call.signal-dispatch` (be.md §6, §7): outbox → socket + push. Idempotent: emit trùng vô hại (client so `version`),
 * `notify()` idempotent theo `dedupeKey`. Dữ liệu người dùng/phạm vi luôn đọc LẠI lúc dispatch (không tin payload cũ).
 */
export class CallSignalDispatcher {
  constructor(
    private readonly d: CallDeps,
    private readonly emitter: CallEmitter = defaultEmitter,
    private readonly notifyFn: NotifyFn = defaultNotify,
    private readonly channelAudience: ChannelAudienceFn = defaultChannelAudience
  ) {}

  async dispatch(p: CallSignalPayload): Promise<void> {
    const call = await this.d.repo.findById(p.callId);
    if (!call) return;
    await this.route(call, p);
    await runCallSignalSinks(p);
  }

  private async route(call: CallEntity, p: CallSignalPayload): Promise<void> {
    switch (p.event) {
      case "ringing":
        return this.onRinging(call, p);
      case "answered":
        return this.onAnswered(call, p);
      case "declined":
        return this.onDeclined(call, p);
      case "participant-changed":
        return this.onParticipantChanged(call, p);
      case "host-action":
        return this.onHostAction(call, p);
      case "ended":
        return this.onEnded(call, p);
    }
  }

  private base(call: CallEntity, version: number) {
    return { callId: call.id, version };
  }

  private async onRinging(call: CallEntity, p: Extract<CallSignalPayload, { event: "ringing" }>): Promise<void> {
    if (call.status === "ENDED") return; // hết giờ/huỷ nhanh hơn dispatch — call.ended lo phần còn lại
    const participants = await this.d.repo.findParticipants(call.id);
    for (const userId of p.ringIds) {
      // INVITED → RINGING (đã phát tín hiệu); CAS nên dispatch lặp không đổi gì.
      await this.d.repo.updateParticipant(undefined, call.id, userId, { stateIn: ["INVITED"] }, { state: "RINGING" });
    }
    for (const [ids, ring] of [[p.ringIds, true], [p.silentIds, false]] as const) {
      for (const userId of ids) {
        const view = await this.d.mapper.toIncomingView(call, participants, userId);
        this.emitter.toUsers([userId], SocketEvent.CALL_INCOMING, { ...this.base(call, p.version), call: view, ring, expiresAt: p.expiresAt });
      }
    }
    if (p.ringIds.length === 0) return;
    const [initiator] = [...(await this.d.reader.getUserProfiles([call.initiatorId])).values()];
    const scope = await this.d.scopes.scopeInfo(call.initiatorId, call, []);
    const suffix = p.batch ? `:${p.batch}` : "";
    await this.notifyFn({
      type: "call.incoming",
      scope: { type: "CALL", id: call.id },
      workspaceId: call.workspaceId ?? undefined,
      actorId: call.initiatorId,
      source: { type: "Call", id: `call:${call.id}:ring${suffix}` },
      refs: {
        callId: call.id,
        mediaKind: call.mediaKind,
        callerId: call.initiatorId,
        callerName: initiator?.name ?? "",
        scopeTitle: scope.title,
        // p2-02 §5.4: khoá phẳng cho payload push (`push-payload.builder.ts` chỉ lấy khoá có trong danh sách) — CallKit cần loại phạm vi + hạn đổ chuông + version.
        scopeKind: scope.kind,
        callVersion: p.version,
        expiresAt: p.expiresAt,
      },
      recipients: p.ringIds.map((userId) => ({ userId })),
      dedupeKey: `call.incoming:call:${call.id}${suffix}`,
    });
  }

  private async onAnswered(call: CallEntity, p: Extract<CallSignalPayload, { event: "answered" }>): Promise<void> {
    const payload = { ...this.base(call, p.version), userId: p.userId, originDeviceId: p.deviceId };
    this.emitter.toUsers([call.initiatorId], SocketEvent.CALL_ACCEPTED, payload);
    this.emitter.toRoom(ROOM.call(call.id), SocketEvent.CALL_ACCEPTED, payload);
    // Các thiết bị KHÁC của người trả lời ngừng đổ chuông (máy nguồn bỏ qua theo `originDeviceId`).
    this.emitter.toUsers([p.userId], SocketEvent.CALL_ANSWERED_ELSEWHERE, { ...this.base(call, p.version), originDeviceId: p.deviceId });
    await this.notifyFn({
      type: "call.answered-elsewhere",
      scope: { type: "CALL", id: call.id },
      workspaceId: call.workspaceId ?? undefined,
      source: { type: "Call", id: `call:${call.id}:answered:${p.userId}` },
      refs: { callId: call.id, deviceId: p.deviceId, originDeviceId: p.deviceId, callVersion: p.version },
      recipients: [{ userId: p.userId }],
      dedupeKey: `call.answered-elsewhere:call:${call.id}:u:${p.userId}`,
    });
  }

  private async onDeclined(call: CallEntity, p: Extract<CallSignalPayload, { event: "declined" }>): Promise<void> {
    const payload = { ...this.base(call, p.version), userId: p.userId, originDeviceId: p.deviceId };
    this.emitter.toUsers([call.initiatorId, p.userId], SocketEvent.CALL_DECLINED, payload);
    this.emitter.toRoom(ROOM.call(call.id), SocketEvent.CALL_DECLINED, payload);
    // Máy khác của người từ chối ngừng đổ chuông.
    await this.notifyFn({
      type: "call.cancelled",
      scope: { type: "CALL", id: call.id },
      workspaceId: call.workspaceId ?? undefined,
      source: { type: "Call", id: `call:${call.id}:declined:${p.userId}` },
      refs: { callId: call.id, reason: "DECLINED_ELSEWHERE", originDeviceId: p.deviceId, callVersion: p.version },
      recipients: [{ userId: p.userId }],
      dedupeKey: `call.cancelled:call:${call.id}:declined:${p.userId}`,
    });
  }

  private async onParticipantChanged(call: CallEntity, p: Extract<CallSignalPayload, { event: "participant-changed" }>): Promise<void> {
    const participant = await this.d.repo.findParticipant(call.id, p.userId);
    if (!participant) return;
    // Phòng ROOM: kèm tên/avatar/số người để client vá danh sách ngay, không phải gọi lại `GET /calls/:id` mỗi lần có người vào.
    const room = call.mode === "ROOM" ? await this.roomExtras(call, participant) : null;
    const payload = {
      ...this.base(call, p.version),
      ...(room ? { count: room.count } : {}),
      participant: {
        userId: participant.userId,
        state: participant.state,
        role: participant.role,
        handRaisedAt: participant.handRaisedAt ? participant.handRaisedAt.toISOString() : null,
        mutedByHost: participant.mutedByHost,
        // p2-02: thiết bị của người được gọi đã xác nhận đang đổ chuông (`POST /calls/:id/ack`) — người gọi đổi "Đang gọi…" → "Đang đổ chuông".
        ringAckedAt: participant.lastRingAckAt ? participant.lastRingAckAt.toISOString() : null,
        ...(room ? { name: room.name, avatarUrl: room.avatarUrl, isHost: room.isHost, sharingScreen: room.sharingScreen } : {}),
      },
    };
    this.emitter.toRoom(ROOM.call(call.id), SocketEvent.CALL_PARTICIPANT_UPDATED, payload);
    this.emitter.toUsers([call.initiatorId], SocketEvent.CALL_PARTICIPANT_UPDATED, payload);
    if (p.state === "REMOVED") this.emitter.toUsers([p.userId], SocketEvent.CALL_PARTICIPANT_UPDATED, payload);
    if (call.scopeType === "CHANNEL" && room) {
      this.emitChannelParticipant(call, participant, p.version, room);
      // Số người đổi khi ai đó vào/rời/bị mời ra (giơ tay/chia sẻ màn hình cũng mang state CONNECTED — phát lại cùng số là vô hại).
      if (p.state === "CONNECTED" || p.state === "LEFT" || p.state === "REMOVED") await this.emitChannelVoiceActivity(call, room.count);
    }

    if (p.state === "MISSED" && participant.userId !== call.initiatorId) {
      // Hết giờ đổ chuông của RIÊNG người này trong cuộc gọi nhóm đang diễn ra (be.md §6 `call:cancelled`).
      this.emitter.toUsers([p.userId], SocketEvent.CALL_CANCELLED, { ...this.base(call, p.version), reason: "NO_ANSWER" });
      await this.notifyPair(call, [p.userId], [p.userId], "NO_ANSWER", `timeout:${p.userId}`, p.version);
    }
  }

  /** Dữ kiện hiển thị của 1 participant phòng ROOM + số người hiện có — đọc LẠI lúc dispatch (không tin payload cũ). */
  private async roomExtras(call: CallEntity, participant: CallParticipantEntity): Promise<RoomExtras> {
    const [all, profiles, holder] = await Promise.all([
      this.d.repo.findParticipants(call.id),
      this.d.reader.getUserProfiles([participant.userId]),
      this.d.store.peekScreen(call.id).catch(() => null),
    ]);
    const profile = profiles.get(participant.userId);
    return {
      count: all.filter(isShown).length,
      name: profile?.name ?? "",
      avatarUrl: profile?.avatarUrl ?? null,
      isHost: call.hostId === participant.userId,
      sharingScreen: holder === participant.userId,
    };
  }

  /** Bản CÔNG KHAI cho người đang xem preview kênh (room `ch:{id}`, p2-03 be.md §6) — không lộ trạng thái nội bộ của phiên. */
  private emitChannelParticipant(call: CallEntity, participant: CallParticipantEntity, version: number, room: RoomExtras): void {
    this.emitter.toRoom(ROOM.channel(call.scopeId), SocketEvent.CALL_PARTICIPANT_UPDATED, {
      ...this.base(call, version),
      count: room.count,
      participant: {
        userId: participant.userId,
        name: room.name,
        avatarUrl: room.avatarUrl,
        isHost: room.isHost,
        // Chưa có snapshot track thật (webhook track_*): hai cờ này là QUYỀN phát, không phải trạng thái bật/tắt hiện tại.
        micEnabled: participant.publishPermissions.audio && !participant.mutedByHost,
        cameraEnabled: participant.publishPermissions.video,
        handRaisedAt: participant.handRaisedAt ? participant.handRaisedAt.toISOString() : null,
        sharingScreen: room.sharingScreen,
        state: participant.state,
      },
    });
  }

  /**
   * `channel:voice-activity` (README §2/§5): số người trong phòng để danh sách kênh vẽ "3 người đang trong phòng" mà không phải mở
   * kênh. Kênh công khai → room `ws:{id}` (không liệt kê từng thành viên, như `channel:activity` của tin nhắn); kênh riêng tư → từng
   * người đọc được (`readerIds` của adapter `MessageScope`). Best-effort: lỗi chỉ log, client vẫn đồng bộ lại qua REST.
   */
  private async emitChannelVoiceActivity(call: CallEntity, count: number, ended = false): Promise<void> {
    try {
      const channel = await this.d.reader.getChannel(call.scopeId);
      if (!channel) return;
      const payload = { channelId: channel.id, workspaceId: channel.workspaceId, voice: { callId: ended ? null : call.id, count: ended ? 0 : count } };
      if (channel.visibility === "PUBLIC") {
        this.emitter.toRoom(ROOM.workspace(channel.workspaceId), SocketEvent.CHANNEL_VOICE_ACTIVITY, payload);
        return;
      }
      const audience = await this.channelAudience(channel.id);
      if (audience.length > 0) this.emitter.toUsers(audience, SocketEvent.CHANNEL_VOICE_ACTIVITY, payload);
    } catch (err) {
      logger.warn("[calls.dispatch] Không phát được channel:voice-activity", { callId: call.id, error: err instanceof Error ? err.message : String(err) });
    }
  }

  private onHostAction(call: CallEntity, p: Extract<CallSignalPayload, { event: "host-action" }>): void {
    const payload = {
      ...this.base(call, p.version),
      type: p.type,
      targetUserId: p.targetUserId,
      byUserId: p.byUserId,
      ...(p.reason ? { reason: p.reason } : {}),
    };
    this.emitter.toRoom(ROOM.call(call.id), SocketEvent.CALL_HOST_ACTION, payload);
    // Người bị tác động nhận thêm qua `user:` (be.md §6): người bị mời ra đã rời room `call:` (revokeScope) nhưng vẫn phải biết lý do;
    // người khác có thể chưa kịp vào lại room `call:` sau khi nối lại mạng. Client dedupe theo `(callId, version, type)`.
    if (p.targetUserId) this.emitter.toUsers([p.targetUserId], SocketEvent.CALL_HOST_ACTION, payload);
  }

  private async onEnded(call: CallEntity, p: Extract<CallSignalPayload, { event: "ended" }>): Promise<void> {
    const ended = { ...this.base(call, p.version), endReason: p.reason, durationSec: p.durationSec };
    this.emitter.toUsers(p.participantIds, SocketEvent.CALL_ENDED, ended);
    this.emitter.toRoom(ROOM.call(call.id), SocketEvent.CALL_ENDED, ended);
    if (call.scopeType === "CHANNEL") {
      this.emitter.toRoom(ROOM.channel(call.scopeId), SocketEvent.CALL_ENDED, ended);
      await this.emitChannelVoiceActivity(call, 0, true);
    }
    if (p.ringingUserIds.length > 0) {
      this.emitter.toUsers(p.ringingUserIds, SocketEvent.CALL_CANCELLED, { ...this.base(call, p.version), reason: cancelReason(p.reason) });
    }
    await this.notifyPair(call, p.ringingUserIds, p.missedUserIds, cancelReason(p.reason), "ended", p.version);
  }

  /** Push `call.cancelled` (dừng chuông, data-only) cho `cancelIds` + `call.missed` (hộp thư + alert) cho `missedIds`. */
  private async notifyPair(call: CallEntity, cancelIds: string[], missedIds: string[], reason: string, tag: string, version: number): Promise<void> {
    const scope = { type: "CALL" as const, id: call.id };
    const workspaceId = call.workspaceId ?? undefined;
    if (cancelIds.length > 0) {
      await this.notifyFn({
        type: "call.cancelled",
        scope,
        workspaceId,
        source: { type: "Call", id: `call:${call.id}:cancelled:${tag}` },
        refs: { callId: call.id, reason, callVersion: version },
        recipients: cancelIds.map((userId) => ({ userId })),
        dedupeKey: `call.cancelled:call:${call.id}:${tag}`,
      });
    }
    if (missedIds.length > 0) {
      await this.notifyFn({
        type: "call.missed",
        scope,
        workspaceId,
        actorId: call.initiatorId,
        source: { type: "Call", id: `call:${call.id}:missed:${tag}` },
        refs: { callId: call.id, callerId: call.initiatorId, callVersion: version },
        recipients: missedIds.map((userId) => ({ userId })),
        dedupeKey: `call.missed:call:${call.id}:${tag}`,
      });
    }
  }
}

