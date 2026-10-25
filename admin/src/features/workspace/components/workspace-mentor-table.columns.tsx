import { Badge, Button, Text } from '@/shared/ui';
import type { TableColumn } from '@/shared/ui';
import { formatDate, formatNumber, statusBadge } from '@/shared/utils/format';

import { mentorEndReasonLabel } from '../constants/workspace-mentor.constants';
import type {
  WorkspaceMentorEngagement,
  WorkspaceMentorPost,
} from '../types/workspace-mentor.types';

const when = (iso: string | null) => (iso ? formatDate(iso, 'HH:mm DD/MM/YYYY') : '—');

/**
 * Cột bảng bài tìm cố vấn của nhóm (admin.md p6-03 §2.2): tiêu đề (kèm nhãn "Đã ẩn" khi bị kiểm duyệt ẩn) · trạng thái · cố vấn đang hoạt động /
 * cần · số đơn (kèm số đơn chờ) · báo cáo · tạo lúc. CHỈ số lượng — không lời nhắn ứng tuyển. Ẩn/khôi phục bài làm ở trang kiểm duyệt.
 */
export function buildMentorPostColumns(): TableColumn<WorkspaceMentorPost>[] {
  return [
    {
      key: 'title',
      header: 'Bài đăng',
      width: 280,
      cell: (p) => (
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-fg-1">{p.title}</span>
          {p.hiddenAt ? (
            <Badge color="warning" variant="tinted">
              Đã ẩn
            </Badge>
          ) : null}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Trạng thái',
      width: 150,
      cell: (p) => {
        const meta = statusBadge('mentorPost', p.status);
        return (
          <Badge color={meta.variant} variant="tinted">
            {meta.label}
          </Badge>
        );
      },
    },
    {
      key: 'mentors',
      header: 'Cố vấn',
      width: 100,
      align: 'right',
      cell: (p) => (
        <span className="tabular-nums">
          {formatNumber(p.activeEngagements)} / {formatNumber(p.mentorsNeeded)}
        </span>
      ),
    },
    {
      key: 'applicants',
      header: 'Số đơn',
      width: 130,
      align: 'right',
      cell: (p) => (
        <span className="tabular-nums">
          {formatNumber(p.applicantsCount)}
          {p.pendingCount > 0 ? (
            <Text size="small" skin="muted">{` · ${formatNumber(p.pendingCount)} chờ`}</Text>
          ) : null}
        </span>
      ),
    },
    {
      key: 'reported',
      header: 'Báo cáo',
      width: 90,
      align: 'right',
      cell: (p) => <span className="tabular-nums">{formatNumber(p.reportedCount)}</span>,
    },
    { key: 'createdAt', header: 'Tạo lúc', width: 150, cell: (p) => when(p.createdAt) },
  ];
}

export interface MentorEngagementColumnsOptions {
  /** `workspace:update` — thiếu quyền thì cột hành động không render nút nào. */
  canEnd: boolean;
  onEnd: (engagement: WorkspaceMentorEngagement) => void;
}

/**
 * Cột bảng đợt cố vấn (admin.md p6-03 §2.2): cố vấn · bài · bắt đầu · hết hạn · trạng thái (đợt đã kết thúc kèm lý do) · hành động "Kết thúc cấp
 * nền tảng" (chỉ đợt ACTIVE, cần `workspace:update`, lý do qua `ConfirmWithReasonModal`).
 */
export function buildMentorEngagementColumns({
  canEnd,
  onEnd,
}: MentorEngagementColumnsOptions): TableColumn<WorkspaceMentorEngagement>[] {
  return [
    {
      key: 'mentor',
      header: 'Cố vấn',
      width: 180,
      cell: (e) => <span className="block truncate text-fg-1">{e.mentor.name || '—'}</span>,
    },
    {
      key: 'post',
      header: 'Bài đăng',
      width: 240,
      cell: (e) => <span className="block truncate">{e.post.title || '—'}</span>,
    },
    { key: 'startedAt', header: 'Bắt đầu', width: 150, cell: (e) => when(e.startedAt) },
    { key: 'endsAt', header: 'Hết hạn', width: 150, cell: (e) => when(e.endsAt) },
    {
      key: 'status',
      header: 'Trạng thái',
      width: 220,
      cell: (e) => {
        const meta = statusBadge('mentorEngagement', e.status);
        return (
          <div className="flex min-w-0 flex-col items-start gap-1">
            <Badge color={meta.variant} variant="tinted">
              {meta.label}
            </Badge>
            {e.status === 'ENDED' ? (
              <Text size="small" skin="muted">
                {mentorEndReasonLabel(e.endedReason)}
                {e.endedAt ? ` · ${when(e.endedAt)}` : ''}
              </Text>
            ) : null}
          </div>
        );
      },
    },
    ...(canEnd
      ? [
          {
            key: 'actions',
            header: 'Hành động',
            width: 190,
            cell: (e: WorkspaceMentorEngagement) =>
              e.status === 'ACTIVE' ? (
                <Button size="sm" skin="danger" variant="stroke" onClick={() => onEnd(e)}>
                  Kết thúc cấp nền tảng
                </Button>
              ) : (
                <span className="text-fg-4">—</span>
              ),
          } satisfies TableColumn<WorkspaceMentorEngagement>,
        ]
      : []),
  ];
}
