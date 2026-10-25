import { Link } from 'react-router-dom';

import { Badge } from '@/shared/ui';
import type { TableColumn } from '@/shared/ui';
import { isModifiedClick } from '@/shared/utils/browser/link.utils';
import { formatDate, formatNumber } from '@/shared/utils/format';

import { STUDY_STATUS_META } from '../constants/study-set-moderation.constants';
import type { AdminStudySet } from '../types/study-set-moderation.types';
import { userDetailPath } from '../utils/report-links';

const TIME_FORMAT = 'HH:mm DD/MM/YYYY';

export interface ReportedStudySetColumnOptions {
  /** `user:view` — tên tác giả chỉ là liên kết khi người xem được mở hồ sơ người dùng. */
  canViewUser: boolean;
  /** URL THẬT mở ngăn kéo của bộ học (giữ `?tab`/bộ lọc/trang) — chuột phải/Ctrl+click mở tab mới được. */
  hrefFor: (set: AdminStudySet) => string;
  /** Click TRÁI thường → mở ngăn kéo tại chỗ (không điều hướng cả trang). */
  onOpen: (set: AdminStudySet) => void;
}

/**
 * Cột bảng tab `content` (admin.md p4-01 §1): bộ PUBLIC bị báo cáo nhiều — CHỈ metadata (tiêu đề, tác giả, số liệu), nội dung mục xem trong
 * ngăn kéo. Tiêu đề là `<Link>` thật (`docs/rules/navigable-controls.md`). Thứ tự do BE quyết (báo cáo mở giảm dần) nên không có sort theo cột.
 */
export function buildReportedStudySetColumns({
  canViewUser,
  hrefFor,
  onOpen,
}: ReportedStudySetColumnOptions): TableColumn<AdminStudySet>[] {
  return [
    {
      key: 'title',
      header: 'Bộ học',
      width: 280,
      cell: (s) => (
        <Link
          className="block truncate text-body-14 text-link hover:underline"
          to={hrefFor(s)}
          onClick={(e) => {
            if (isModifiedClick(e)) return;
            e.preventDefault();
            onOpen(s);
          }}
        >
          {s.title}
        </Link>
      ),
    },
    {
      key: 'owner',
      header: 'Tác giả',
      width: 180,
      cell: (s) =>
        s.owner && canViewUser ? (
          <Link className="block truncate text-link hover:underline" to={userDetailPath(s.owner.id)}>
            {s.owner.name}
          </Link>
        ) : (
          <span className={s.owner ? undefined : 'text-fg-5'}>{s.owner?.name ?? '—'}</span>
        ),
    },
    {
      key: 'reported',
      header: 'Báo cáo mở',
      width: 110,
      align: 'right',
      cell: (s) => <span className="tabular-nums text-body-14-semibold">{formatNumber(s.reportedCount)}</span>,
    },
    {
      key: 'status',
      header: 'Trạng thái',
      width: 130,
      cell: (s) => (
        <Badge color={STUDY_STATUS_META[s.status].color} size="sm" variant="tinted">
          {STUDY_STATUS_META[s.status].label}
        </Badge>
      ),
    },
    {
      key: 'items',
      header: 'Số mục',
      width: 90,
      align: 'right',
      cell: (s) => <span className="tabular-nums">{formatNumber(s.itemCount)}</span>,
    },
    {
      key: 'copies',
      header: 'Sao chép',
      width: 100,
      align: 'right',
      cell: (s) => <span className="tabular-nums">{formatNumber(s.copyCount)}</span>,
    },
    {
      key: 'updated',
      header: 'Cập nhật',
      width: 150,
      cell: (s) => <span className="tabular-nums text-caption-12 text-fg-3">{formatDate(s.updatedAt, TIME_FORMAT)}</span>,
    },
  ];
}
