/**
 * ĐIỂM NỐI với `modules/calls` (xem `calls-room.adapter.ts`) — vào phòng họp NGUYÊN TỬ: cùng khuôn `CallRoomService.enter` (p2-03) nhưng
 * luật của cuộc họp (khoá phòng + vào lại trong `rejoinAfterLockSeconds`, chủ trì vào được kể cả khi đầy, vai trò phiên giữ `CO_HOST`).
 * Đọc-quyết-định-ghi nằm TRONG `call:lock` + transaction: hai người tranh chỗ cuối chỉ MỘT thắng (MR-10).
 */
import { AppError } from "../../../core/exceptions";
import { ErrorCode, ErrorMessages } from "../../../core/utils/error.codes";
import { logger } from "../../../infrastructure/logger";
import type { CallsContainer } from "../../calls";
import { callEvents } from "../../calls/events/call-outbox.events";
import { isConnectedLike } from "../../calls/services/call-state.machine";
import type { EnterRequest, EnterResult, RoomParticipant } from "../services/meeting-call.port";

const LOCK = { retries: 60, delayMs: 40 } as const;

export async function enterRoom(k: CallsContainer, r: EnterRequest): Promise<EnterResult> {
  const d = k.deps;
  const out: { result: EnterResult | null; kickRoom: string | null } = { result: null, kickRoom: null };

  await d.store.withLock(
    r.callId,
    () =>
      d.tx.run(async (tx) => {
        out.result = null;
        out.kickRoom = null;
        const call = await d.repo.findById(r.callId, tx);
        if (!call || call.status === "ENDED") {
          out.result = { kind: "ENDED" };
          return;
        }
        const all = await d.repo.findParticipants(r.callId, tx);
        const mine = all.find((p) => p.userId === r.userId);
        if (mine?.state === "REMOVED") {
          out.result = { kind: "BLOCKED" };
          return;
        }
        const now = d.now();
        const connectedNow = !!mine && isConnectedLike(mine.state);

        if (r.locked && !r.bypassLock) {
          const left = mine?.firstJoinedAt && mine.lastLeftAt && now.getTime() - mine.lastLeftAt.getTime() <= r.rejoinAfterLockSeconds * 1000;
          if (!connectedNow && !left) {
            out.result = { kind: "LOCKED" };
            return;
          }
        }
        let kicked = false;
        if (mine && connectedNow && mine.respondedDeviceId && mine.respondedDeviceId !== r.deviceId) {
          if (!r.force) {
            out.result = { kind: "OTHER_DEVICE" };
            return;
          }
          kicked = true;
        }
        const occupied = all.filter((p) => p.userId !== r.userId && isConnectedLike(p.state)).length;
        if (!connectedNow && !r.bypassCapacity && occupied + 1 > r.maxParticipants) {
          out.result = { kind: "FULL" };
          return;
        }

        let participantVersion = 1;
        if (!mine) {
          await d.repo.createParticipants(tx, [
            {
              callId: r.callId,
              userId: r.userId,
              role: r.role,
              state: "JOINING",
              respondedAt: now,
              respondedDeviceId: r.deviceId,
              joiningAt: now,
              publishPermissions: r.publish,
              callStartedAt: call.startedAt,
              scopeType: call.scopeType,
              scopeId: call.scopeId,
              mediaKind: call.mediaKind,
              mode: call.mode,
            },
          ]);
        } else {
          // Chủ trì/đồng chủ trì THEO LỊCH luôn đúng vai; còn lại giữ `CO_HOST` đã được cấp trong phiên (không tự rớt vai khi vào lại).
          const role = r.role === "MEMBER" && mine.role === "CO_HOST" ? "CO_HOST" : r.role;
          const updated = await d.repo.updateParticipant(tx, r.callId, r.userId, { version: mine.version }, {
            role,
            state: "JOINING",
            respondedAt: now,
            respondedDeviceId: r.deviceId,
            joiningAt: now,
            handRaisedAt: null,
            mutedByHost: false,
            publishPermissions: r.publish,
          });
          if (!updated) throw new AppError(ErrorMessages[ErrorCode.CALL_011], 409, ErrorCode.CALL_011);
          participantVersion = updated.version;
        }
        await d.outbox.add(tx, callEvents.participantChanged(r.callId, call.version, r.userId, "JOINING", participantVersion));
        const participant = (await d.repo.findParticipant(r.callId, r.userId, tx)) as RoomParticipant | null;
        if (!participant) throw new AppError(ErrorMessages[ErrorCode.CALL_011], 409, ErrorCode.CALL_011);
        out.result = { kind: "OK", participant, rejoined: !!mine?.firstJoinedAt, kickedOtherDevice: kicked };
        out.kickRoom = kicked ? call.livekitRoom : null;
      }),
    LOCK
  );

  if (out.kickRoom) {
    await d.media()
      .removeParticipant(out.kickRoom, r.userId)
      .catch((err: unknown) => logger.warn("[meetings] Không đá được thiết bị cũ (non-fatal)", { callId: r.callId, error: err instanceof Error ? err.message : String(err) }));
  }
  return out.result ?? { kind: "ENDED" };
}
