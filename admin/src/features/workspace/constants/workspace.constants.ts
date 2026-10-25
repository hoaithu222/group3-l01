import type { WorkspaceImageKind, WorkspaceStatus } from '../types/workspace.types';

/** Nhãn trạng thái nhóm — dùng cho filter dropdown. */
export const WORKSPACE_STATUS_OPTIONS: ReadonlyArray<{ value: WorkspaceStatus; label: string }> = [
  { value: 'ACTIVE', label: 'Hoạt động' },
  { value: 'ARCHIVED', label: 'Lưu trữ' },
];

export const WORKSPACE_SORT_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'lastActivityAt', label: 'Hoạt động gần nhất' },
  { value: 'createdAt', label: 'Tạo lúc' },
  { value: 'memberCount', label: 'Thành viên' },
  { value: 'name', label: 'Tên' },
];

/** Chỗ của con số CHƯA CÓ (đang tải / tải lỗi). Không bao giờ thay bằng `0` — "0 thành viên" là nói dối khi BE đang lỗi. */
export const NO_DATA = '—';

/** Số gợi ý mỗi trang của ô chọn workspace — trong `PAGE_SIZE_OPTIONS`, ≤ trần `limit` của BE. */
export const WORKSPACE_OPTIONS_PAGE_SIZE = 20;

/** Tên loại ảnh gỡ được (`POST /admin/workspaces/:id/remove-image`) — dùng chung cho nút, hộp thoại và toast. */
export const WORKSPACE_IMAGE_LABEL: Readonly<Record<WorkspaceImageKind, string>> = {
  AVATAR: 'ảnh đại diện',
  COVER: 'ảnh bìa',
};
