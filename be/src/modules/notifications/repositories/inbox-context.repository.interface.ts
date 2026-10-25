import type { MessageScopeType } from "../entities/message-notification.types";
import type { PreviewMessage } from "../services/message-preview";

export interface InboxContextMessage extends PreviewMessage {
  id: string;
  seq: number;
  scopeType: MessageScopeType;
  scopeId: string;
  threadId: string | null;
  deletedAt: Date | null;
}

export interface InboxScopeInfo {
  /** Tên kênh / tiêu đề nhóm / tên người kia (DIRECT); `undefined` khi không xác định. */
  name?: string;
  /** "Xoá phía tôi" (`ConversationMember.hiddenBeforeSeq`) — tin có `seq ≤` ngưỡng này không được trả excerpt. */
  hiddenBeforeSeq: number;
}

/** Người thực hiện: tên + ảnh (asset id thô — service đổi thành URL ký sẵn bằng `avatarUrlOf`). */
export interface InboxActorRef {
  name: string;
  avatarAssetId: string | null;
}

/** Đọc dữ liệu để dựng `InboxItem.context` TẠI LÚC ĐỌC (be.md §5.8). */
export interface IInboxContextRepository {
  findMessages(ids: string[]): Promise<Map<string, InboxContextMessage>>;
  /** Khoá kết quả: `CHANNEL:<id>` / `CONVERSATION:<id>`. */
  loadScopeInfo(
    viewerId: string,
    channelIds: string[],
    conversationIds: string[]
  ): Promise<Map<string, InboxScopeInfo>>;
  /** Tên + `avatarAssetId` của người thực hiện theo lô (MỘT truy vấn user). */
  loadActors(userIds: string[]): Promise<Map<string, InboxActorRef>>;
}
