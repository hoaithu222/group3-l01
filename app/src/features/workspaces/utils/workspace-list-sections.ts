import type { WorkspaceListItem } from '../api';

export type WorkspaceListSectionKey = 'all' | 'favorites' | 'pending';

export interface WorkspaceListSection {
  key: WorkspaceListSectionKey;
  title: string;
  items: WorkspaceListItem[];
}

export interface WorkspaceListSummary {
  /** Nhóm đã VÀO (đang hoạt động + đã lưu trữ) — yêu cầu chờ duyệt chưa tính. */
  joined: number;
  /** Nhóm có tin mới hoặc lượt nhắc tên. */
  unread: number;
  /** Yêu cầu tham gia CỦA MÌNH đang chờ quản trị nhóm duyệt (p3-04). */
  pending: number;
}

/**
 * Chia danh sách nhóm thành khối có tiêu đề (app.md p1-01 §3 "nhóm Yêu thích … Tất cả"), kiểu Teams/Slack:
 *  · "Đang chờ duyệt" ĐỨNG ĐẦU — người vừa xin vào muốn thấy ngay yêu cầu đã đi chưa; thường chỉ 0–1 thẻ.
 *  · "Yêu thích" — nhóm đã ghim sao (không gồm mục đang chờ: chưa phải thành viên thì chưa có gì để ghim).
 *  · phần còn lại: "Tất cả nhóm", hoặc "Nhóm khác" khi đã có khối "Yêu thích" phía trên (khỏi nói dối là "tất cả").
 *
 * Khối rỗng bị bỏ. Thứ tự TRONG mỗi khối giữ nguyên thứ tự BE trả (yêu thích trước, rồi `position`) — client không tự xếp lại.
 */
export function groupWorkspaces(items: readonly WorkspaceListItem[]): WorkspaceListSection[] {
  const pending: WorkspaceListItem[] = [];
  const favorites: WorkspaceListItem[] = [];
  const rest: WorkspaceListItem[] = [];
  for (const item of items) {
    if (item.status === 'PENDING') pending.push(item);
    else if (item.isFavorite) favorites.push(item);
    else rest.push(item);
  }
  const sections: WorkspaceListSection[] = [
    { items: pending, key: 'pending', title: 'Đang chờ duyệt' },
    { items: favorites, key: 'favorites', title: 'Yêu thích' },
    { items: rest, key: 'all', title: favorites.length > 0 ? 'Nhóm khác' : 'Tất cả nhóm' },
  ];
  return sections.filter((section) => section.items.length > 0);
}

/** Số liệu cho dòng tóm tắt đầu danh sách — thứ AppBar không nói. */
export function summarizeWorkspaces(items: readonly WorkspaceListItem[]): WorkspaceListSummary {
  let joined = 0;
  let unread = 0;
  let pending = 0;
  for (const item of items) {
    if (item.status === 'PENDING') pending += 1;
    else joined += 1;
    if (item.unreadCount > 0 || item.mentionCount > 0) unread += 1;
  }
  return { joined, pending, unread };
}

/** "Đang tham gia 4 nhóm · 2 nhóm có tin mới" — `null` khi chưa vào nhóm nào (chỉ có yêu cầu chờ duyệt). */
export function workspaceSummaryText(summary: WorkspaceListSummary): string | null {
  if (summary.joined === 0) return null;
  const parts = [`Đang tham gia ${summary.joined} nhóm`];
  if (summary.unread > 0) parts.push(`${summary.unread} nhóm có tin mới`);
  return parts.join(' · ');
}
