/**
 * Loại cột của bảng công việc (`ColumnKind` phía BE — `be/src/core/constants/project.ts`).
 *
 * Logic XP/review/đóng góp dựa trên `kind`, KHÔNG dựa tên cột (p3-02 README §2) — nên admin chọn LOẠI
 * cho từng cột mặc định và đọc thống kê theo loại. Đặt ở `shared/` vì hai feature cùng dùng (tab Dự án
 * của `workspace` và mẫu cột của `system-config`) mà feature không được import feature khác.
 */
export const COLUMN_KINDS = ['TODO', 'IN_PROGRESS', 'REVIEW', 'DONE'] as const;

export type ColumnKind = (typeof COLUMN_KINDS)[number];

export const COLUMN_KIND_LABELS: Readonly<Record<ColumnKind, string>> = {
  TODO: 'Cần làm',
  IN_PROGRESS: 'Đang làm',
  REVIEW: 'Chờ duyệt',
  DONE: 'Hoàn thành',
};
