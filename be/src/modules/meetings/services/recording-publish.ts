import { logger } from "../../../infrastructure/logger";
import { publishSourcesOf } from "../../../infrastructure/media";
import type { PublishPermissionsDto, RoomRole } from "../entities/meeting-room.interface";
import type { RecordingEntity } from "../entities/meeting-recap.interface";
import { isInRoom } from "./meeting-room.access";
import type { MeetingRoomDeps } from "./meeting-room.deps";
import { MeetingTokenPolicy } from "./meeting-token.policy";

const toRole = (role: string): RoomRole => (role === "HOST" ? "HOST" : role === "CO_HOST" ? "CO_HOST" : "MEMBER");
const noPublish = (p: PublishPermissionsDto): boolean => !p.audio && !p.video && !p.screen;

/**
 * Đổi quyền phát của MỘT người trên LiveKit. ⚠️ `updateParticipant.permission` THAY THẾ nguyên khối (p0-08 be.md §13 #9) — luôn gửi ĐỦ
 * `canPublish/canSubscribe/canPublishData/canPublishSources/canUpdateMetadata`, thiếu một trường là trường đó về `false` (mất giơ tay/cảm xúc).
 * Mic bị chủ trì tắt (`mutedByHost`) thì không mở lại nguồn MICROPHONE.
 */
export async function grantPublishOnMediaServer(d: MeetingRoomDeps, callId: string, userId: string, publish: PublishPermissionsDto, micAllowed: boolean): Promise<void> {
  const call = await d.calls.findCall(callId);
  if (!call) return;
  const sources = publishSourcesOf({ ...publish, audio: publish.audio && micAllowed });
  await d.media().updateParticipant(call.livekitRoom, userId, {
    permission: { canPublish: sources.length > 0, canSubscribe: true, canPublishData: true, canPublishSources: sources, canUpdateMetadata: true },
  });
}

/**
 * Bản ghi RỜI trạng thái đang chạy (→ PROCESSING/FAILED): người vào sau đã từ chối/chưa trả lời đồng ý (quyền phát rỗng vì ghi hình) được mở lại
 * quyền phát — không còn gì ghi họ nữa (README §2: chỉ khoá phát KHI đang ghi). Người đã đồng ý/chủ trì giữ nguyên. Best-effort: lỗi chỉ log (người đó
 * vào lại phòng sẽ nhận token mới đúng chính sách). Trả số người được mở lại.
 */
export async function restorePublishAfterRecording(d: MeetingRoomDeps, rec: Pick<RecordingEntity, "id" | "callId" | "consentSnapshot">): Promise<number> {
  try {
    const consented = new Set(rec.consentSnapshot.map((c) => c.userId));
    const blocked = (await d.calls.listParticipants(rec.callId)).filter((p) => isInRoom(p) && !consented.has(p.userId) && noPublish(p.publishPermissions));
    for (const p of blocked) {
      const publish = MeetingTokenPolicy.publishFor({ role: toRole(p.role), recording: null });
      await d.calls.setPublishPermissions(rec.callId, p.userId, publish);
      await grantPublishOnMediaServer(d, rec.callId, p.userId, publish, !p.mutedByHost).catch((err: unknown) =>
        logger.warn("[recording] Không mở lại quyền phát trên LiveKit sau khi dừng ghi (token làm mới sẽ mang quyền mới)", { recordingId: rec.id, error: err instanceof Error ? err.message : String(err) })
      );
    }
    return blocked.length;
  } catch (err) {
    logger.warn("[recording] Không mở lại quyền phát sau khi dừng ghi", { recordingId: rec.id, error: err instanceof Error ? err.message : String(err) });
    return 0;
  }
}
