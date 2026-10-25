import { logger } from "../../../infrastructure/logger";
import type { CallParticipantEntity } from "../entities/call.interface";
import { callEvents } from "../events/call-outbox.events";
import type { CallDeps } from "./call.deps";
import { CallRoomPermissions } from "./call-room-permissions";
import { isConnectedLike } from "./call-state.machine";

const LOCK = { retries: 40, delayMs: 50 } as const;

export interface VideoDisabledResult {
  callId: string;
  /** Số participant bị thu quyền camera trong DB lần chạy này (0 = đã thu từ lần trước — job retry). */
  changed: number;
}

/**
 * `CallChannelVideoService` (p2-03 be.md §5.9) — kênh VOICE đặt `voiceSettings.allowVideo = false` khi phòng đang chạy: mọi participant
 * đang trong phòng bị bỏ quyền camera (`publishPermissions.video = false`, DB là nguồn sự thật cho token về sau), rồi đồng bộ LiveKit
 * (`updateParticipant` + tắt track camera đang phát) và phát `call:host-action { type: VIDEO_DISABLED, targetUserId: null }` tới cả phòng.
 *
 * Idempotent để job `call.channel-video-disabled` (BullMQ retry) chạy lại an toàn: bước DB chỉ ghi khi CÒN người đang có `video`
 * (không tăng `Call.version` thừa); bước LiveKit là best-effort và LUÔN chạy lại (mất kết nối LiveKit lần trước được vá lần sau).
 * Không có phòng đang chạy ⇒ `null` (người vào sau nhận sẵn quyền theo `allowVideo` của kênh lúc `join`).
 */
export class CallChannelVideoService {
  constructor(private readonly d: CallDeps) {}

  async disableVideo(channelId: string): Promise<VideoDisabledResult | null> {
    const room = (await this.d.repo.findOpenByScope("CHANNEL", [channelId])).find((c) => c.mode === "ROOM" && c.status === "ACTIVE");
    if (!room) return null;

    let changed = 0;
    await this.d.store.withLock(
      room.id,
      () =>
        this.d.tx.run(async (tx) => {
          changed = 0;
          const inRoom = (await this.d.repo.findParticipants(room.id, tx)).filter((p) => isConnectedLike(p.state) && p.publishPermissions.video);
          if (inRoom.length === 0) return;
          // CAS theo trạng thái (phòng đã kết thúc giữa chừng ⇒ không ghi gì); `version + 1` để `call:host-action` có khoá dedupe riêng.
          const updated = await this.d.repo.updateCall(tx, room.id, { status: ["ACTIVE"] }, {});
          if (!updated) return;
          for (const p of inRoom) {
            const next = await this.d.repo.updateParticipant(tx, room.id, p.userId, { version: p.version }, { publishPermissions: { ...p.publishPermissions, video: false } });
            // Participant vừa đổi (rời/vào lại): ném để cuộn cả transaction — job retry đọc lại trạng thái mới.
            if (!next) throw new Error(`Participant ${p.userId} đổi trạng thái giữa chừng`);
            await this.d.outbox.add(tx, callEvents.participantChanged(room.id, updated.version, p.userId, next.state, next.version));
            changed += 1;
          }
          await this.d.outbox.add(tx, callEvents.hostAction(room.id, updated.version, { type: "VIDEO_DISABLED", targetUserId: null, byUserId: null }));
        }),
      LOCK
    );

    await this.syncMedia(room.id, room.livekitRoom);
    logger.info("[calls] Kênh tắt video: đã thu quyền camera của phòng đang chạy", { callId: room.id, channelId, changed });
    return { callId: room.id, changed };
  }

  /** Đồng bộ LiveKit từ trạng thái DB hiện tại (best-effort, log): quyền thay thế nguyên khối + tắt track camera đang phát. */
  private async syncMedia(callId: string, livekitRoom: string): Promise<void> {
    try {
      const media = this.d.media();
      const participants = await this.d.repo.findParticipants(callId);
      const live = await media.listParticipants(livekitRoom);
      for (const p of participants.filter((x: CallParticipantEntity) => isConnectedLike(x.state))) {
        await media.updateParticipant(livekitRoom, p.userId, { permission: CallRoomPermissions.permission(p) });
        const cameras = live.find((l) => l.identity === p.userId)?.tracks.filter((t) => t.source === "CAMERA" && !t.muted) ?? [];
        for (const t of cameras) await media.mutePublishedTrack(livekitRoom, p.userId, t.sid, true);
      }
    } catch (err) {
      logger.warn("[calls] Đồng bộ LiveKit sau khi kênh tắt video lỗi (non-fatal)", { callId, error: err instanceof Error ? err.message : String(err) });
    }
  }
}
