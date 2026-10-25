import type { ChatScopeType } from './chat-extensions.types';

/**
 * Đường dẫn endpoint của `chat-extensions` (p7-04, đọc từ `be/src/modules/chat-extensions/chat-extensions.routes.ts`) — nối sau `appConfig.apiBaseUrl`.
 * Gọi đường TỔNG QUÁT `/scopes/:scopeType/:scopeId/…` (cùng `chat`), không qua alias `/channels/:id`/`/conversations/:id`. Mọi route nằm sau cờ `communication` + cờ
 * phụ (`polls`/`scheduledMessages`/`messageReminders`/`messageToTask`/`messageToResource`) — tắt ⇒ 404 `CFG_005`, nên app ẩn tính năng theo `capabilities` chứ không đợi lỗi.
 */
export const chatExtPaths = {
  scopePolls: (scopeType: ChatScopeType, scopeId: string) => `/scopes/${scopeType}/${scopeId}/polls`,
  poll: (pollId: string) => `/polls/${pollId}`,
  pollVote: (pollId: string) => `/polls/${pollId}/vote`,
  pollClose: (pollId: string) => `/polls/${pollId}/close`,
  pollVoters: (pollId: string) => `/polls/${pollId}/voters`,

  scopeScheduled: (scopeType: ChatScopeType, scopeId: string) =>
    `/scopes/${scopeType}/${scopeId}/scheduled-messages`,
  myScheduled: '/me/scheduled-messages',
  scheduled: (id: string) => `/scheduled-messages/${id}`,
  scheduledSendNow: (id: string) => `/scheduled-messages/${id}/send-now`,

  messageReminders: (messageId: string) => `/messages/${messageId}/reminders`,
  myReminders: '/me/reminders',
  reminder: (id: string) => `/reminders/${id}`,

  messageToTask: (messageId: string) => `/messages/${messageId}/to-task`,
  /** Lưu tệp đính kèm của tin vào kho tài liệu của nhóm (cùng `assetId`, không nhân file). */
  messageToResource: (messageId: string) => `/messages/${messageId}/to-resource`,
  /** Chi tiết một kênh — chỉ để lấy `workspaceId` khi mở tin từ "Nhắc lại của tôi". */
  channel: (channelId: string) => `/channels/${channelId}`,
  /** Chọn đích của "Tạo task": nhóm của tôi → bảng của nhóm (endpoint của `workspaces`/`projects`, khai ĐỘC LẬP — không import chéo feature). */
  workspaces: '/workspaces',
  workspaceBoards: (workspaceId: string) => `/workspaces/${workspaceId}/boards`,
} as const;

/** Tên sự kiện socket của p7-04 — khai Ở ĐÂY (không thêm vào `core/socket/socket.events.ts`, file đó đã sát trần dòng). Khớp `be/src/infrastructure/socket/socket.events.ts`. */
export const CHAT_EXT_EVENTS = {
  /** Room `ch:{id}`/`conv:{id}`: số phiếu/trạng thái khảo sát đổi (throttle 1 giây/khảo sát phía BE). Không có `userId`/`myOptionIds`. */
  POLL_UPDATED: 'poll:updated',
  /** Room `user:{id}`: tin hẹn giờ của MÌNH đổi trạng thái (tạo/sửa/huỷ/phát/lỗi — đa thiết bị). Không nội dung. */
  SCHEDULED_MESSAGE_UPDATED: 'scheduled-message:updated',
} as const;
