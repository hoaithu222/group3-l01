/**
 * Đường dẫn sang trang vận hành gọi & họp (`/meeting?tab=&workspaceId=`) đã lọc theo workspace.
 *
 * `/meeting` viết cứng CÓ CHỦ ĐÍCH — không import `MODULE_PATHS` (khép vòng `check:cycles`, xem `workspace-member-table.columns.tsx`).
 */
export const meetingOpsHref = (tab: string, workspaceId: string): string =>
  `/meeting?${new URLSearchParams({ tab, workspaceId }).toString()}`;
