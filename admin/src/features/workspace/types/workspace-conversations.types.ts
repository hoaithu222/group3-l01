import type { PaginationMeta } from '@/shared/types/api.types';

/**
 * Kiểu dữ liệu tab `conversations` — khớp `AdminConversationRow` phía BE
 * (`be/src/modules/admin-conversations/admin-conversations.service.ts`, p1-05
 * admin.md §2.1/§3). BE CHỈ trả `kind: 'GROUP'` (hội thoại DIRECT không hiện ở
 * tab này) và CỐ Ý KHÔNG có `title`/tên thành viên — quyết định riêng tư D-06
 * (admin.md dòng 5). KHÔNG thêm field nào ngoài danh sách dưới đây dù BE có
 * lỡ trả thừa (component test CV-21 chặn rò rỉ phía UI, admin.md §4).
 */
export type ConversationStatusValue = 'ACTIVE' | 'ARCHIVED' | 'DISSOLVED';

export interface AdminConversationRow {
  id: string;
  kind: 'GROUP';
  memberCount: number;
  ownerName: string | null;
  status: ConversationStatusValue;
  createdAt: string;
  lastActivityAt: string;
  isMeetingGroup: boolean;
}

/** `GET /admin/workspaces/:workspaceId/conversations` — `page`/`limit`/`status?` (server hỗ trợ lọc trạng thái, khác tab `channels` p1-03 không có lọc server-side). */
export interface AdminConversationListParams {
  page: number;
  limit: number;
  status?: ConversationStatusValue;
}

/** admin.md §2.1 — số liệu KHỐI đầu tab, TÁCH BIỆT theo từng nhóm (không phải số liệu 1 dòng). */
export interface AdminConversationStats {
  groups: number;
  activeGroups7d: number;
  dmPairs: number;
  messages7d: number;
}

export interface AdminConversationListResult {
  data: AdminConversationRow[];
  meta: PaginationMeta;
  stats: AdminConversationStats;
}
