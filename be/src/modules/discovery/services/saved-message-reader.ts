import type { SavedMessageReader } from "../../../shared/ports/saved-message-reader.port";
import type { ISavedMessageRepository } from "../repositories/saved-message.repository.interface";

/**
 * Bản cài đặt `SavedMessageReader` (`shared/ports`) — `messages` ghép `MessageView.isSaved` qua cổng, không import `discovery`.
 * Chỉ ĐỌC tập id người xem tự lưu (1 truy vấn/trang); không kiểm quyền đọc tin — trang tin đã lọc theo quyền của người xem.
 */
export class SavedMessageReaderImpl implements SavedMessageReader {
  constructor(private readonly savedRepo: ISavedMessageRepository) {}

  savedIdsOf(userId: string, messageIds: readonly string[]): Promise<Set<string>> {
    return this.savedRepo.findSavedIds(userId, messageIds);
  }
}
