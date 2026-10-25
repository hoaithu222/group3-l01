/**
 * Kiểu DTO của module BE `read-state` (p1-07 `be.md` §15) — đối chiếu TRỰC TIẾP
 * `be/src/modules/read-state/{dtos,entities,read-state.routes.ts}`. BE là nguồn hợp đồng.
 */

/** Loại luồng có mốc đọc. `THREAD`: `streamId` là `Thread.id` HOẶC id tin gốc (server chuẩn hoá về `Thread.id`). */
export type ReadStreamType = 'CHANNEL' | 'CONVERSATION' | 'THREAD';

/** Body `POST /read-markers`. `lastReadSeq` vượt `lastSeq` của luồng bị KẸP ở server, không lỗi. */
export interface ReadMarkerPayload {
  deviceId?: string;
  lastReadSeq: number;
  streamId: string;
  streamType: ReadStreamType;
}

/** `lastReadSeq` là mốc SAU khi kẹp/không lùi (NT-03); `streamId` của THREAD đã chuẩn hoá về `Thread.id`. */
export interface ReadMarkerResult {
  changed: boolean;
  lastReadSeq: number;
  streamId: string;
  streamType: ReadStreamType;
}

/** `GET /me/unread/summary` — nguồn duy nhất cho huy hiệu tab và icon app. */
export interface UnreadSummary {
  activity: { mentions: number; unread: number };
  /** Số hiển thị trên icon app (hội thoại chưa đọc không tắt tiếng + mục Hoạt động chưa đọc). */
  badgeTotal: number;
  computedAt: string;
  conversations: { mentions: number; unreadConversations: number; unreadMessages: number };
  workspaces: { mentions: number; unreadChannels: number; workspaceId: string }[];
}

/** Một kênh trong `GET /me/unread?workspaceId=`. `capped` → hiện "100+". */
export interface ChannelUnread {
  capped: boolean;
  lastSeq: number;
  /**
   * Mốc đã đọc THẬT của tôi ở kênh này (0 = chưa đọc gì) — BE trả từ 2026-09-26.
   *
   * ⛔ ĐỪNG suy ngược mốc này từ `unread`/`lastSeq`: `unread` KHÔNG đếm tin của chính mình và tin đã xoá, nên
   * `unread === 0` hoàn toàn có thể đi cùng `lastReadSeq < lastSeq` (vd tin mới nhất trong kênh là tin MÌNH vừa gửi).
   * Đoán `lastReadSeq = lastSeq` trong ca đó làm `useReadMarker` tưởng đã gửi mốc rồi ⇒ không gửi `POST /read-markers`
   * nữa ⇒ `GET /me/unread/summary` (so `Channel.lastSeq > ReadState.lastReadSeq`) vẫn đếm kênh này là chưa đọc, nên
   * huy hiệu thẻ nhóm / tab "Nhóm" KẸT mãi dù hàng kênh bên trong đã sạch.
   */
  lastReadSeq: number;
  mentions: number;
  unread: number;
}

/** Một luồng trả lời tôi theo dõi trong `GET /me/unread?workspaceId=` — BE chỉ liệt kê luồng CÒN chưa đọc. */
export interface ThreadUnread {
  channelId: string;
  /** Mốc đã đọc của tôi trong luồng (`ReadState THREAD`). */
  lastReadSeq: number;
  /** `Thread.lastReplySeq` — seq reply mới nhất. */
  lastSeq: number;
  unread: number;
}

/** `GET /me/unread?workspaceId=` — khoá `threads` là `Thread.id` (không phải id tin gốc). */
export interface WorkspaceUnread {
  channels: Record<string, ChannelUnread>;
  threads: Record<string, ThreadUnread>;
}

/** Sự kiện `read:updated` (room `user:{me}`, be.md §15.5) — đọc ở một thiết bị, các thiết bị khác hạ huy hiệu. */
export interface ReadUpdatedEvent {
  lastReadSeq: number;
  mentionCount?: number;
  /** Có khi thiết bị nguồn gửi `deviceId` lúc đặt mốc; máy nguồn bỏ qua (đã vá cục bộ). */
  originDeviceId?: string;
  streamId: string;
  streamType: ReadStreamType;
  unreadCount?: number;
  v?: number;
}

/** Sự kiện `unread:summary-changed` — client không tự suy được (tắt tiếng, đọc tất cả, dựng lại số đếm). */
export interface UnreadSummaryChangedEvent {
  reason: 'MUTE' | 'READ_ALL' | 'REBUILD';
  v?: number;
}
