import type { BlockedCode, MeetingEndReason } from '../api/meeting-room.types';

/** Cảm xúc gửi/nhận trong phòng (data topic `meeting.reaction`) — danh sách CHO PHÉP: nhận chuỗi ngoài danh sách bị bỏ (chống chuỗi lạ). */
export const REACTION_EMOJIS = ['👍', '👏', '❤️', '😂', '😮', '🎉'] as const;
export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];

/** Throttle gửi cảm xúc: 1 lần/giây/người (app.md §2); hiện tối đa 20 cái bay cùng lúc. */
export const REACTION_THROTTLE_MS = 1000;
export const MAX_FLOATING_REACTIONS = 20;
export const REACTION_LIFETIME_MS = 3000;

/**
 * Lưới phân trang (README §7: `gridPageSizePhone 4`, `gridPageSizeTablet 9`, `maxSubscribedVideos 9`). Đây là hằng BỐ CỤC của app, KHÔNG phải giới
 * hạn quản trị: registry `limits.meeting` của BE chỉ có 8 khoá của p2-04 nên `GET /capabilities` không trả ba số này.
 */
export const GRID_PAGE_SIZE = { phone: 4, tablet: 9 } as const;
export const MAX_SUBSCRIBED_VIDEOS = 9;

/** Mất kết nối quá ngần này thì thôi tự nối lại, quay về pre-join có nút "Thử lại" (app.md §3.1). */
export const RECONNECT_GRACE_MS = 30_000;
/** Làm mới token trước hạn ngần này (`POST /calls/:id/token`). */
export const TOKEN_RENEW_MARGIN_MS = 60_000;
/** `meeting:started`/`ADMITTED` → gọi lại `join`: gộp nhịp 300 ms, tối đa 3 lần (app.md §4.1 bước 4). */
export const JOIN_RETRY_DEBOUNCE_MS = 300;
export const JOIN_RETRY_MAX = 3;
/** Kết nối media thử lại tối đa (mỗi lần xin token mới). */
export const CONNECT_MAX_ATTEMPTS = 3;

export const ROLE_LABEL = { CO_HOST: 'Đồng chủ trì', HOST: 'Chủ trì', MEMBER: '' } as const;

/** Màn "không vào được" theo mã (`JoinBlockedView`, app.md §3.2) — thông điệp trung tính, không đổ lỗi. */
export const BLOCKED_COPY: Record<BlockedCode, { description: string; title: string }> = {
  DENIED: { description: 'Chủ trì chưa cho bạn vào cuộc họp lúc này. Bạn có thể thử lại sau.', title: 'Chưa được vào cuộc họp' },
  GONE: { description: 'Cuộc họp đã bị xoá hoặc bạn không còn quyền truy cập.', title: 'Cuộc họp không còn khả dụng' },
  MEET_006: { description: 'Cuộc họp chưa bắt đầu và đã quá giờ chờ.', title: 'Cuộc họp chưa bắt đầu' },
  MEET_007: { description: 'Chủ trì đã khoá cuộc họp, không nhận thêm người tham gia.', title: 'Cuộc họp đã khoá' },
  MEET_009: { description: 'Cuộc họp đã kết thúc hoặc đã bị huỷ.', title: 'Cuộc họp không còn diễn ra' },
  MEET_010: { description: 'Cuộc họp dùng nền tảng bên ngoài — hãy mở liên kết cuộc họp.', title: 'Họp bằng nền tảng khác' },
  MEET_012: { description: 'Phòng họp sẽ mở trước giờ bắt đầu một lúc. Hãy quay lại sau.', title: 'Chưa tới giờ mở phòng' },
  MEET_013: { description: 'Chủ trì đã mời bạn ra khỏi phiên họp này nên bạn không vào lại được.', title: 'Bạn đã được mời ra khỏi cuộc họp' },
  MEET_017: { description: 'Chủ trì chưa cho bạn vào phòng họp, hãy thử lại sau ít phút.', title: 'Chưa được vào cuộc họp' },
  MEET_018: { description: 'Phòng họp đã đủ số người tham gia.', title: 'Phòng họp đã đủ người' },
};

/** Nhãn lý do kết thúc trên màn "Cuộc họp đã kết thúc". */
export const ENDED_REASON_LABEL: Record<MeetingEndReason, string> = {
  EMPTY: 'Phòng họp không còn ai nên đã tự đóng.',
  FORCE_ENDED: 'Cuộc họp đã được quản trị viên kết thúc.',
  HOST_ENDED: 'Chủ trì đã kết thúc cuộc họp.',
  HOST_REMOVED: 'Cuộc họp đã kết thúc vì chủ trì không còn trong nhóm.',
  MAX_DURATION: 'Cuộc họp đã đạt thời lượng tối đa nên tự kết thúc.',
  MOVED_DEVICE: 'Bạn đã tham gia cuộc họp này trên thiết bị khác nên phiên trên máy này đã dừng.',
  WORKSPACE_ARCHIVED: 'Cuộc họp đã kết thúc vì nhóm được lưu trữ.',
};
