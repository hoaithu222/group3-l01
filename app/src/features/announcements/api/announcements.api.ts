/**
 * Đường dẫn endpoint của `announcements` (p5-04 be.md §5) — nối sau `appConfig.apiBaseUrl`. Mọi route nằm sau cờ
 * `communication` + cờ phụ `readConfirm` (tắt ⇒ 404 `CFG_005`).
 */
export const announcementPaths = {
  /** `GET` — yêu cầu chưa huỷ của một kênh (≤ 50, kèm `confirmedByMe`). */
  channel: (channelId: string) => `/channels/${channelId}/announcements`,
  /** `POST` yêu cầu · `DELETE` huỷ (204, idempotent). */
  message: (messageId: string) => `/messages/${messageId}/announcement`,
  /** `POST` — "Tôi đã đọc", idempotent. */
  confirm: (messageId: string) => `/messages/${messageId}/announcement/confirm`,
  /** `GET ?status=confirmed|pending&cursor=&limit=` — chỉ người yêu cầu + quản trị kênh. */
  receipts: (messageId: string) => `/messages/${messageId}/announcement/receipts`,
} as const;
