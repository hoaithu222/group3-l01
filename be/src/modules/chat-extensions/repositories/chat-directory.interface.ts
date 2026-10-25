import type { ChatScopeType } from "../entities/chat-extensions.types";

/** Tệp đính kèm (chỉ thông tin hiển thị) của tin hẹn giờ — đọc từ collection `Asset`; không mở quyền tải (quyền tải luôn qua `assets`). */
export interface ChatAssetRef {
  assetId: string;
  name: string;
  mime: string;
  size: number;
}

export interface ChatUserRef {
  id: string;
  name: string;
  status: "ACTIVE" | "LOCKED" | "PENDING_DELETION" | "ANONYMIZED";
  /** URL ảnh TUYỆT ĐỐI đã ký sẵn (`avatarUrlOf(User.avatarAssetId)`, bản THUMB — client dùng thẳng, không cần Bearer) hoặc `null` khi chưa có ảnh. */
  avatar: string | null;
}

/**
 * Tra cứu chỉ-đọc mà `chat-extensions` cần từ collection của module khác (`User`, `Channel`, `Conversation*`): tên người bầu/avatar, trạng thái người dùng (tác giả tin hẹn giờ còn `ACTIVE`?),
 * nhãn phạm vi cho danh sách "Tin đã hẹn"/"Nhắc lại của tôi". Đọc thẳng trong repository (như `workspace-search`/`resources`), không có ghi.
 */
export interface IChatDirectory {
  /** MỘT truy vấn cho cả lô; id không tồn tại không có mặt trong Map. */
  users(ids: string[]): Promise<Map<string, ChatUserRef>>;
  /** Thông tin hiển thị của tệp theo lô (1 truy vấn); id lạ không có mặt. */
  assets(ids: string[]): Promise<Map<string, ChatAssetRef>>;
  /** Chế độ hiển thị của kênh (`PUBLIC`|`PRIVATE`); `null` khi kênh không tồn tại. Dùng để biết việc lưu tệp vào kho nhóm có MỞ RỘNG người xem hay không. */
  channelVisibility(channelId: string): Promise<"PUBLIC" | "PRIVATE" | null>;
  /**
   * Tên hiển thị của phạm vi cho người xem: kênh → tên kênh; nhóm chat → tiêu đề; 1-1 → tên người còn lại. Khoá kết quả `"<scopeType>:<scopeId>"`. Người gọi CHỈ hỏi các phạm vi
   * người xem đọc được (đã kiểm quyền) — hàm này không tự kiểm quyền.
   */
  scopeLabels(viewerId: string, scopes: Array<{ scopeType: ChatScopeType; scopeId: string }>): Promise<Map<string, string>>;
}

export const scopeLabelKey = (scopeType: ChatScopeType, scopeId: string): string => `${scopeType}:${scopeId}`;
