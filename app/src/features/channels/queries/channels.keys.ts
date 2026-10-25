/** Khoá query của feature `channels` (app.md p1-03 §4). */
export const channelKeys = {
  all: ['channels'] as const,
  list: (wsId: string) => ['channels', wsId, 'list'] as const,
  detail: (chId: string) => ['channels', 'detail', chId] as const,
  members: (chId: string, q?: string) => ['channels', chId, 'members', q ?? ''] as const,
  /**
   * TOÀN BỘ người trong kênh để tra tên tác giả tin nhắn (`useChannelAuthors`) — khác
   * `members` (danh sách có tìm kiếm, phân trang 20, của màn Thành viên). Phần tử thứ
   * tư là OBJECT, không phải chuỗi: một chuỗi cố định sẽ trùng khoá với người gõ đúng từ
   * đó vào ô tìm; và vẫn thuộc tiền tố `['channels', chId, 'members']` nên các handler
   * `channel:revoked` xoá theo tiền tố đó dọn luôn khoá này.
   */
  memberDirectory: (chId: string) => ['channels', chId, 'members', { directory: true }] as const,
  grants: (chId: string) => ['channels', chId, 'grants'] as const,
  search: (wsId: string, q: string) => ['channels', wsId, 'search', q] as const,
  /** Thành viên nhóm cho bộ chọn (`AudienceStep`, `AddGrantSheet`) — KHÔNG phải danh sách kênh. */
  memberOptions: (wsId: string, q: string) => ['channels', wsId, 'member-options', q] as const,
};
