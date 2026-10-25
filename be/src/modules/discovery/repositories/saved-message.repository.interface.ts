import type { SavedListParams, SavedMessageCreateInput, SavedMessageRecord } from "../entities/discovery.interface";

export interface ISavedMessageRepository {
  findByUserAndMessage(userId: string, messageId: string): Promise<SavedMessageRecord | null>;
  /**
   * Idempotent theo `(userId, messageId)`: đã có → trả bản ghi cũ với `created=false`
   * (đua 2 request cùng lúc bắt `P2002` ở đây, NGOÀI mọi transaction).
   */
  create(input: SavedMessageCreateInput): Promise<{ record: SavedMessageRecord; created: boolean }>;
  /** `true` nếu có bản ghi bị xoá. */
  delete(userId: string, messageId: string): Promise<boolean>;
  countByUser(userId: string): Promise<number>;
  list(params: SavedListParams): Promise<SavedMessageRecord[]>;
  /** MỘT truy vấn cho cả trang tin (`MessageView.isSaved`): tập con của `messageIds` mà `userId` đã lưu. */
  findSavedIds(userId: string, messageIds: readonly string[]): Promise<Set<string>>;
  /** Xoá MỌI tin đã lưu của `userId` (ẩn danh hoá tài khoản); trả số bản ghi đã xoá. Idempotent. */
  deleteAllByUser(userId: string): Promise<number>;
}
