/**
 * Đọc phụ trợ cho danh sách tin ghim (p1-09 `PinsQueryService`): tên người ghim và
 * tập tin bị "xoá phía tôi" THEO `messageId` (không theo `seq` như
 * `IMessageHideRepository.findHiddenSeqs` — `seq` của reply thread trùng dãy với tin gốc).
 */
export interface IPinSupportRepository {
  findUserNames(userIds: string[]): Promise<Map<string, string>>;
  findHiddenMessageIds(userId: string, messageIds: string[]): Promise<Set<string>>;
}
