import { publishSourcesOf, type MediaPermission, type MediaTrackSource } from "../../../infrastructure/media";
import type { CallParticipantEntity } from "../entities/call.interface";
import { CallTokenService } from "./call-token.service";

type PublishState = Pick<CallParticipantEntity, "publishPermissions" | "mutedByHost">;

/**
 * Nguồn được phát của participant trong phòng ROOM (p2-03 be.md §5.2/§5.4): MICROPHONE trừ khi bị host chặn, CAMERA khi phòng cho phép
 * video, SCREEN_SHARE chỉ khi đang giữ slot. MỘT nơi tính — token (lúc vào) và `updateParticipant` (lúc host đổi quyền) dùng chung,
 * p2-05 (phòng họp) dùng lại cho host controls.
 */
export const CallRoomPermissions = {
  sources(p: PublishState): MediaTrackSource[] {
    return publishSourcesOf(CallTokenService.publishOf(p));
  },

  /**
   * `updateParticipant` THAY THẾ nguyên khối quyền (LiveKit không merge) — luôn truyền đủ các trường.
   * ⛔ `canPublish` PHẢI theo danh sách nguồn: LiveKit coi `canPublishSources` RỖNG là "mọi nguồn" khi `canPublish = true`, nên
   * người bị chặn mic trong phòng không cho camera/màn hình (`sources = []`) mà vẫn `canPublish: true` sẽ phát được cả mic (VR-08).
   */
  permission(p: PublishState): MediaPermission {
    const sources = CallRoomPermissions.sources(p);
    return { canPublish: sources.length > 0, canSubscribe: true, canPublishData: true, canPublishSources: sources, canUpdateMetadata: true };
  },
};
