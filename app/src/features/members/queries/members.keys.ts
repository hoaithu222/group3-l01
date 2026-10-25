import type { ListMembersFilter } from '../api';

/** Khoá query của cả feature `members` — gồm thành viên VÀ lời mời (app.md p1-02 §4). */
export const memberKeys = {
  all: ['members'] as const,
  list: (wsId: string, filter: ListMembersFilter) => ['members', wsId, 'list', filter] as const,
  /** Tiền tố dùng để patch/invalidate MỌI trang danh sách của một workspace, bất kể filter. */
  listAll: (wsId: string) => ['members', wsId, 'list'] as const,
  card: (wsId: string, userId: string) => ['members', wsId, 'card', userId] as const,
  /** Kết quả tra người theo email/SĐT (`q` đã chuẩn hoá: email chữ thường / SĐT E.164). */
  lookup: (wsId: string, q: string) => ['members', wsId, 'lookup', q] as const,
  lookupAll: (wsId: string) => ['members', wsId, 'lookup'] as const,
  invites: (wsId: string) => ['members', wsId, 'invites'] as const,
  invitePreview: (code: string) => ['invite-preview', code] as const,
};
