/**
 * Ý ĐỊNH điều hướng suy ra từ một liên kết của app (p0-12 README §3–§5).
 *
 * Bảng liên kết (README §5), miền `https://<APP_LINK_DOMAIN>` hoặc scheme `superapp://` cùng đường dẫn:
 *
 * | Liên kết                              | Ý định          | Đích (route đã có)                        |
 * | ------------------------------------- | --------------- | ----------------------------------------- |
 * | `/invite/:code`                       | `INVITE` LINK   | `invite/[code]`                           |
 * | `/invite/e/:token`                    | `INVITE` EMAIL  | `invite/e/[token]`                        |
 * | `/m/abc-defg-hij`                     | `MEETING_CODE`  | `m/[id]` → `MeetingCodeLinkScreen`        |
 * | `/c/:conversationId?m=:messageId`     | `CONVERSATION`  | `(app)/messages/[conversationId]`         |
 * | `/m/<24 hex>` (link cũ p1-05, D-29)   | `CONVERSATION`  | cùng trên                                 |
 * | `/w/:wsId/c/:chId?m=:messageId`       | `MESSAGE_LINK`  | `(app)/workspaces/[wsId]/channels/[chId]` |
 * | `/call/:callId`                       | `CALL`          | `call/[callId]` (nội bộ: push/CallKit)    |
 *
 * ⚠️ Chỉ những đích CẦN phân loại ý định (nhớ qua đăng nhập, kiểm quyền bằng API, thông báo trung tính khi 404) mới có
 * mặt ở đây. Link ngắn khác (`/live/:pin`, `/s/:setId`, `/w/:wsId`, `/w/:wsId/t/:taskId`…) do các file route tương ứng
 * tự chuyển tiếp — Expo Router mở link, không cần bộ phân tích riêng.
 *
 * Push (`type` + id + `targetUserId`) KHÔNG đi qua đây: `core/notifications/push-router.ts` đã kiểm `targetUserId` và
 * đổi payload thành `Href` (SHL-04).
 */
export type DeepLinkIntent =
  | { readonly type: 'INVITE'; readonly code: string; readonly kind: 'EMAIL' | 'LINK' }
  | { readonly type: 'MEETING_CODE'; readonly code: string }
  | { readonly type: 'CONVERSATION'; readonly conversationId: string; readonly messageId?: string }
  | {
      readonly type: 'MESSAGE_LINK';
      readonly wsId: string;
      readonly chId: string;
      readonly messageId?: string;
    }
  | { readonly type: 'CALL'; readonly callId: string };

export type DeepLinkIntentType = DeepLinkIntent['type'];

/** Ý định của MỘT loại — để bộ xử lý (`intent-handlers.ts`) khai kiểu tham số chính xác. */
export type IntentOf<T extends DeepLinkIntentType> = Extract<DeepLinkIntent, { type: T }>;
