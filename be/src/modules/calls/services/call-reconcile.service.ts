import { LIMITS } from "../../../core/constants/limits";
import { logger } from "../../../infrastructure/logger";
import type { LiveKitHandlerResult, NormalizedLiveKitEvent } from "../../../infrastructure/media";
import { roomNames } from "../../../infrastructure/media";
import { callReconcileCorrectionsTotal } from "../../../infrastructure/metrics/call.metrics";
import { callEvents } from "../events/call-outbox.events";
import type { CallDeps } from "./call.deps";
import type { CallEndService } from "./call-end.service";
import { connectedSecondsSince, evaluateRoomClosure, isConnectedLike } from "./call-state.machine";

const LOCK = { retries: 40, delayMs: 50 } as const;

/**
 * Đối soát với LiveKit (be.md §5.9). Webhook chỉ làm việc NHẸ rồi xếp `call.reconcile` — nguồn sự thật người tham gia
 * là `IMediaServer.listParticipants`, GHI ĐÈ trạng thái participant, nên sự kiện đến sai thứ tự/trùng vẫn cho kết quả đúng.
 */
export class CallReconcileService {
  constructor(
    private readonly d: CallDeps,
    private readonly ends: CallEndService
  ) {}

  /** Handler webhook cho phòng `call_<id>` (đăng ký ở `webhooks/livekit-call.handler.ts`). */
  async handleWebhook(event: NormalizedLiveKitEvent): Promise<LiveKitHandlerResult> {
    const { kind, ref: callId } = roomNames.parse(event.roomName ?? "");
    if (kind !== "call") return "IGNORED";
    const call = await this.d.repo.findById(callId);
    if (!call) return "IGNORED";
    const identity = event.participant?.identity;

    if (event.type === "room_finished") {
      // ROOM (kênh/họp): phòng trống quá `emptyTimeout` → EMPTY; RING: ACTIVE → COMPLETED, chưa ai nhận → NO_ANSWER.
      if (call.status !== "ENDED") await this.ends.endCall(callId, call.mode === "ROOM" ? "EMPTY" : call.status === "ACTIVE" ? "COMPLETED" : "NO_ANSWER", null);
      return "PROCESSED";
    }
    // Chia sẻ màn hình dừng phía client → nhả slot `call:screen` (p2-03 be.md §5.6).
    if (event.type === "track_unpublished" && identity && call.mode === "ROOM" && event.track?.source === "SCREEN_SHARE") {
      await this.releaseScreenShare(callId, identity);
      return "PROCESSED";
    }
    if ((event.type !== "participant_joined" && event.type !== "participant_left") || !identity) return "IGNORED";

    const known = await this.d.repo.findParticipant(callId, identity);
    if (!known) {
      logger.warn("[calls] Webhook có identity không thuộc cuộc gọi — đá khỏi phòng", { callId });
      await this.d.media().removeParticipant(call.livekitRoom, identity).catch(() => undefined);
      return "PROCESSED";
    }
    if (event.type === "participant_joined") await this.markJoined(callId, identity);
    else {
      await this.markLeft(callId, identity);
      // Chủ phòng rời (mất mạng) → failover sau grace; quay lại kịp thì job no-op (p2-03 be.md §5.7).
      if (call.mode === "ROOM" && call.hostId === identity) {
        await this.d.jobs.scheduleHostFailover?.(callId, call.version, LIMITS.voice.hostReconnectGraceSeconds * 1000);
      }
    }
    await this.d.jobs.scheduleReconcile(callId, 1000);
    return "PROCESSED";
  }

  private async markJoined(callId: string, userId: string): Promise<void> {
    const out = { kick: false };
    await this.d.store.withLock(callId, () =>
      this.d.tx.run(async (tx) => {
        out.kick = false;
        const call = await this.d.repo.findById(callId, tx);
        const p = await this.d.repo.findParticipant(callId, userId, tx);
        if (!call || call.status === "ENDED" || !p) return;
        if (p.state === "REMOVED") {
          out.kick = true;
          return;
        }
        if (p.state === "CONNECTED") return;
        const now = this.d.now();
        const updated = await this.d.repo.updateParticipant(tx, callId, userId, { version: p.version }, {
          state: "CONNECTED",
          firstJoinedAt: p.firstJoinedAt ?? now,
          lastJoinedAt: now,
        });
        if (!updated) return;
        let version = call.version;
        if (call.status === "RINGING" && userId !== call.initiatorId) {
          const active = await this.d.repo.updateCall(tx, callId, { status: ["RINGING"] }, { status: "ACTIVE", answeredAt: now });
          if (active) version = active.version;
        }
        await this.d.outbox.add(tx, callEvents.participantChanged(callId, version, userId, "CONNECTED", updated.version));
      }),
      LOCK
    );
    if (out.kick) {
      const call = await this.d.repo.findById(callId);
      if (call) await this.d.media().removeParticipant(call.livekitRoom, userId).catch(() => undefined);
    }
  }

  private async markLeft(callId: string, userId: string): Promise<void> {
    await this.d.store.withLock(callId, () =>
      this.d.tx.run(async (tx) => {
        const call = await this.d.repo.findById(callId, tx);
        const p = await this.d.repo.findParticipant(callId, userId, tx);
        if (!call || call.status === "ENDED" || !p || !isConnectedLike(p.state)) return;
        const now = this.d.now();
        const updated = await this.d.repo.updateParticipant(tx, callId, userId, { version: p.version }, {
          state: "LEFT",
          lastLeftAt: now,
          connectedSeconds: p.connectedSeconds + connectedSecondsSince(p.lastJoinedAt, now),
        });
        if (updated) await this.d.outbox.add(tx, callEvents.participantChanged(callId, call.version, userId, "LEFT", updated.version));
      }),
      LOCK
    );
    await this.d.store.releaseBusy(userId, callId).catch(() => false);
    await this.d.store.releaseScreen(callId, userId).catch(() => false); // rời phòng thì nhả slot chia sẻ (no-op nếu không giữ)
  }

  /** Người giữ slot dừng chia sẻ: nhả slot + `publishPermissions.screen = false` + báo participant thay đổi. */
  private async releaseScreenShare(callId: string, userId: string): Promise<void> {
    if (!(await this.d.store.releaseScreen(callId, userId))) return;
    await this.d.tx.run(async (tx) => {
      const call = await this.d.repo.findById(callId, tx);
      const p = await this.d.repo.findParticipant(callId, userId, tx);
      if (!call || !p) return;
      const updated = await this.d.repo.updateParticipant(tx, callId, userId, {}, { publishPermissions: { ...p.publishPermissions, screen: false } });
      if (updated) await this.d.outbox.add(tx, callEvents.participantChanged(callId, call.version, userId, p.state, updated.version));
    });
  }

  /** `reconcile(callId)` (be.md §5.9): ghi đè participant theo `listParticipants`, rồi `evaluateEnd`. */
  async reconcile(callId: string): Promise<void> {
    const call = await this.d.repo.findById(callId);
    if (!call) return;
    if (call.status === "ENDED") {
      await this.d.media().deleteRoom(call.livekitRoom).catch(() => undefined);
      return;
    }
    const live = await this.d.media().listParticipants(call.livekitRoom); // phòng không tồn tại → []
    const liveIds = new Set(live.map((p) => p.identity));
    const { joiningStaleSeconds } = await this.d.limits();
    const out = { corrections: 0, left: [] as string[], hostMissing: false };

    await this.d.store.withLock(callId, () =>
      this.d.tx.run(async (tx) => {
        out.corrections = 0;
        out.left = [];
        out.hostMissing = false;
        const cur = await this.d.repo.findById(callId, tx);
        if (!cur || cur.status === "ENDED") return;
        const participants = await this.d.repo.findParticipants(callId, tx);
        const now = this.d.now();
        let becameActive = false;

        for (const p of participants) {
          if (p.state === "REMOVED") continue;
          const inLive = liveIds.has(p.userId);
          if (inLive && p.state !== "CONNECTED") {
            const updated = await this.d.repo.updateParticipant(tx, callId, p.userId, { version: p.version }, {
              state: "CONNECTED",
              firstJoinedAt: p.firstJoinedAt ?? now,
              lastJoinedAt: now,
            });
            if (updated) {
              out.corrections += 1;
              if (cur.status === "RINGING" && p.userId !== cur.initiatorId) becameActive = true;
              await this.d.outbox.add(tx, callEvents.participantChanged(callId, cur.version, p.userId, "CONNECTED", updated.version));
            }
          } else if (!inLive && (p.state === "CONNECTED" || p.state === "RECONNECTING" || this.staleJoining(p, now, joiningStaleSeconds))) {
            const updated = await this.d.repo.updateParticipant(tx, callId, p.userId, { version: p.version }, {
              state: "LEFT",
              lastLeftAt: now,
              connectedSeconds: p.connectedSeconds + connectedSecondsSince(p.lastJoinedAt, now),
            });
            if (updated) {
              out.corrections += 1;
              out.left.push(p.userId);
              await this.d.outbox.add(tx, callEvents.participantChanged(callId, cur.version, p.userId, "LEFT", updated.version));
            }
          }
        }
        const peakParticipants = Math.max(cur.peakParticipants, live.length);
        if (becameActive) {
          await this.d.repo.updateCall(tx, callId, { statusNot: "ENDED" }, { peakParticipants, lastReconciledAt: now, status: "ACTIVE", answeredAt: now });
        } else {
          // Không tăng `version` (đối soát chạy dồn dập; `version` là mốc `expectedVersion` của host action, p2-03).
          await this.d.repo.touchCall(callId, { peakParticipants, lastReconciledAt: now });
        }
        out.hostMissing = cur.mode === "ROOM" && !!cur.hostId && !liveIds.has(cur.hostId);
      }),
      LOCK
    );

    if (out.corrections > 0) callReconcileCorrectionsTotal.inc(out.corrections);
    await Promise.all(out.left.map((id) => this.d.store.releaseBusy(id, callId).catch(() => false)));
    // Phòng ROOM (p2-03): người rời nhả slot chia sẻ màn hình; chủ phòng không còn trong LiveKit → failover sau grace.
    if (call.mode === "ROOM") {
      await Promise.all(out.left.map((id) => this.d.store.releaseScreen(callId, id).catch(() => false)));
      if (out.hostMissing) await this.d.jobs.scheduleHostFailover?.(callId, call.version, LIMITS.voice.hostReconnectGraceSeconds * 1000);
    }
    await this.ends.evaluateEnd(callId);
    if (call.scopeType === "CHANNEL" && call.mode === "ROOM") await this.closeRoomIfDone(callId);
  }

  /**
   * Phòng thoại kênh (p2-03 be.md §5.9): đóng khi kênh/nhóm đã lưu trữ (`ARCHIVED` — luồng chính là listener thu hồi quyền, đây là
   * lưới an toàn cho đường không đi qua `revokeScope`, vd nhóm bị lưu trữ) hoặc trống quá `emptyRoomEndSeconds` mà webhook
   * `room_finished` không tới (`EMPTY`). `evaluateEnd` của phòng ROOM luôn "NONE" nên KHÔNG có đường nào khác kết thúc phòng bị bỏ lại.
   */
  private async closeRoomIfDone(callId: string): Promise<void> {
    const call = await this.d.repo.findById(callId);
    if (!call || call.status === "ENDED") return;
    const [participants, scopeOpen] = await Promise.all([this.d.repo.findParticipants(callId), this.d.scopes.isChannelOpen(call.scopeId)]);
    const closure = evaluateRoomClosure(call, participants, this.d.now(), { scopeOpen, emptyRoomEndMs: LIMITS.voice.emptyRoomEndSeconds * 1000 });
    if (closure.action === "END") await this.ends.endCall(callId, closure.reason, null);
  }

  private staleJoining(p: { state: string; joiningAt: Date | null }, now: Date, staleSeconds: number): boolean {
    return p.state === "JOINING" && !!p.joiningAt && now.getTime() - p.joiningAt.getTime() > staleSeconds * 1000;
  }
}
