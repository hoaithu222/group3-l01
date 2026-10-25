import { Link } from 'react-router-dom';

import { Badge } from '@/shared/ui';
import type { TableColumn } from '@/shared/ui';
import { formatDate } from '@/shared/utils/format';

import type { AdminSubjectRow, RoadmapSubjectStatus } from '../types/roadmap.types';

const STATUS_META: Record<RoadmapSubjectStatus, { label: string; color: 'neutral' | 'success' | 'warning' }> = {
  DRAFT: { label: 'Nháp', color: 'neutral' },
  PUBLISHED: { label: 'Đã xuất bản', color: 'success' },
  ARCHIVED: { label: 'Lưu trữ', color: 'warning' },
};

/**
 * Cột bảng `SubjectsPage` (admin.md §2). Tên lộ trình là `<Link>` tới cây tháng/buổi
 * (`docs/rules/navigable-controls.md`) — "Sửa thông tin" nằm ở `SubjectDetailPage` (mở
 * `SubjectFormModal`), KHÔNG lặp ở đây: bảng chỉ có `AdminSubjectRow` (tóm tắt), thiếu
 * `description`/`coverAssetId`/`defaultStudyDays`/`unlockMode` mà form cần.
 */
export function buildSubjectColumns(): TableColumn<AdminSubjectRow>[] {
  return [
    {
      key: 'icon',
      header: '',
      width: 52,
      cell: (s) => (
        <span
          className="flex size-8 items-center justify-center rounded-md bg-bg-3 text-body-16"
          style={s.color ? { backgroundColor: `${s.color}26` } : undefined}
        >
          {s.icon || '📘'}
        </span>
      ),
    },
    {
      key: 'title',
      header: 'Lộ trình',
      width: 260,
      cell: (s) => (
        <div className="min-w-0">
          <Link
            className="block truncate text-body-14 text-link hover:underline"
            to={`/roadmap/subjects/${s.id}`}
          >
            {s.title}
          </Link>
          <div className="truncate text-caption-12 text-fg-4">{s.slug}</div>
        </div>
      ),
    },
    { key: 'category', header: 'Danh mục', width: 140, cell: (s) => s.category },
    {
      key: 'status',
      header: 'Trạng thái',
      width: 120,
      cell: (s) => (
        <Badge color={STATUS_META[s.status].color} variant="tinted">
          {STATUS_META[s.status].label}
        </Badge>
      ),
    },
    {
      key: 'counts',
      header: 'Tháng · Buổi (bắt buộc/tổng)',
      width: 200,
      cell: (s) => (
        <span className="tabular-nums text-body-14 text-fg-2">
          {s.phaseCount} tháng · {s.requiredLessonCount}/{s.lessonCount} buổi
        </span>
      ),
    },
    {
      key: 'updatedAt',
      header: 'Cập nhật',
      width: 130,
      cell: (s) => (
        <span className="text-caption-12 text-fg-4">{formatDate(s.updatedAt, 'DD/MM/YYYY HH:mm')}</span>
      ),
    },
  ];
}
