import type { PublishPermissionsDto, RoomRole } from "../entities/meeting-room.interface";

export interface TokenPolicyInput {
  role: RoomRole;
  /** p2-06 (ghi hình): đang ghi và người này CHƯA đồng ý ⇒ không được phát (chỉ nghe/xem). Chưa có p2-06 ⇒ bỏ trống. */
  recording?: { active: boolean; consented: boolean } | null;
  /** P1 "chế độ khán giả" do chủ trì bật: thành viên thường không phát cho tới khi được mời phát biểu. */
  audienceMode?: boolean;
}

const ALL: PublishPermissionsDto = { audio: true, video: true, screen: true };
const NONE: PublishPermissionsDto = { audio: false, video: false, screen: false };

/**
 * Quyền phát của một người trong phòng họp (be.md §5.6) — hàm THUẦN, test theo bảng. Kết quả lưu vào `CallParticipant.publishPermissions`
 * rồi `CallTokenService` đổi thành `canPublishSources` của token (`publishSourcesOf`) — token KHÔNG bao giờ có `roomAdmin`: mọi thao tác
 * của chủ trì đi qua REST của BE. `canPublishData`/`canUpdateOwnMetadata` luôn `true` (giơ tay, cảm xúc) nên không nằm trong bảng.
 */
export const MeetingTokenPolicy = {
  publishFor(input: TokenPolicyInput): PublishPermissionsDto {
    if (input.recording?.active && !input.recording.consented) return { ...NONE };
    if (input.audienceMode && input.role === "MEMBER") return { ...NONE };
    return { ...ALL };
  },
};
