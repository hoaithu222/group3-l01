import { SEARCH_ISSUE_HINT, type SearchTextIssue } from '@/shared/search';

import type { WorkspaceSearchType } from '../api';

/** Nhịp chờ sau phím cuối (app.md p5-04 §2: 300 ms, IME-safe). Mỗi lượt tốn hạn mức 30 lần/phút của người dùng. */
export const WORKSPACE_SEARCH_DEBOUNCE_MS = 300;

/** Tìm gần đây (app.md p5-04 §5): 10 mục, cục bộ theo (userId, wsId), xoá khi đăng xuất. */
export const RECENT_SEARCH_MAX = 10;
export const RECENT_SEARCH_PREFIX = 'recent-search:';

export interface SearchTabDef {
  key: WorkspaceSearchType;
  label: string;
}

export const SEARCH_TABS: readonly SearchTabDef[] = [
  { key: 'messages', label: 'Tin nhắn' },
  { key: 'files', label: 'Tệp' },
  { key: 'channels', label: 'Kênh' },
  { key: 'people', label: 'Người' },
  { key: 'meetings', label: 'Cuộc họp' },
];

/** Tên gọi từng loại trong câu "Không tìm thấy …". */
export const SEARCH_TYPE_NOUN: Record<WorkspaceSearchType, string> = {
  messages: 'tin nhắn',
  files: 'tệp',
  channels: 'kênh',
  people: 'người',
  meetings: 'cuộc họp',
};

/**
 * Mã lỗi của "Tìm toàn workspace" → câu tiếng Việt (be.md p5-04 §8). Đặt TRONG feature: `shared/constants/error-codes.ts`
 * đã ở trần dòng của `file-size-manifest.json`. ⚠️ BE đánh số lại từ `SRCH_101` vì `SRCH_001..004` đã dùng ở p1-09 với
 * nghĩa khác (bảng `discovery-error-codes.constants.ts`).
 */
export const WORKSPACE_SEARCH_ERROR_MESSAGES: Record<string, string> = {
  /** 400 — `q` ngoài 2–100 grapheme (client đã chặn trước; mã này chỉ tới khi hai bên đếm lệch nhau). */
  SRCH_101: 'Từ khoá tìm kiếm phải từ 2 đến 100 ký tự',
  /** 404 — kênh/hội thoại đang lọc không còn đọc được. */
  SRCH_102: 'Không tìm thấy phạm vi tìm kiếm',
  /** 403 — khách không tìm được danh sách người. */
  SRCH_103: 'Bạn không thể tìm thành viên trong nhóm này',
  /** 422 — hết `maxTimeMs` mà chưa có kết quả nào. */
  SRCH_104: 'Tìm kiếm quá rộng — thêm bộ lọc',
  /** 404 — cờ phụ `workspaceSearch` đang tắt ở admin. */
  CFG_005: 'Tìm kiếm toàn nhóm hiện chưa được bật',
};

/** Gợi ý khi từ khoá chưa hợp lệ — client CHẶN TRƯỚC (không gọi API, không tốn hạn mức 30 lần/phút). */
export const WORKSPACE_SEARCH_HINT: Record<SearchTextIssue, string> = {
  ...SEARCH_ISSUE_HINT,
  empty: 'Nhập từ khoá để tìm tin nhắn, tệp, kênh, người hoặc cuộc họp trong nhóm.',
};
