import { memo } from 'react';
import { Link } from 'react-router-dom';

import { useAuthStore } from '@/app/store';
import { Badge, BoxPanel } from '@/shared/ui';
import { formatDate } from '@/shared/utils/format';

import type { AdminMentorPost } from '../../types/mentor-post-moderation.types';
import { userDetailPath } from '../../utils/report-links';
import ReportInfoRow from '../ReportInfoRow';

const TIME_FORMAT = 'HH:mm DD/MM/YYYY';

const STATUS_META: Record<
  AdminMentorPost['status'],
  { label: string; color: 'success' | 'info' | 'neutral' }
> = {
  OPEN: { label: 'Đang mở', color: 'success' },
  FULFILLED: { label: 'Đã đủ cố vấn', color: 'info' },
  CLOSED: { label: 'Đã đóng', color: 'neutral' },
};

export interface MentorPostReportContextProps {
  post: AdminMentorPost;
}

/**
 * Khối "Bài tìm cố vấn bị báo cáo" (p6-03 admin.md §2.1 "Ngữ cảnh" + "Nội dung"): nhóm, người đăng (liên kết khi có
 * `user:view`), trạng thái, số đơn chờ, số cố vấn đang hoạt động, số báo cáo mở; tiêu đề/mô tả/kỹ năng/giờ/hạn. Bài công khai
 * với người đăng nhập nên hiển thị đầy đủ; KHÔNG có lời nhắn ứng tuyển.
 */
const MentorPostReportContext = memo(function MentorPostReportContext({
  post,
}: MentorPostReportContextProps) {
  const canViewUser = useAuthStore((s) => s.hasPermission('user', 'view'));
  const status = STATUS_META[post.status];

  return (
    <BoxPanel border="hairline" title="Bài tìm cố vấn bị báo cáo">
      <div className="grid grid-cols-1 gap-x-6 gap-y-3 p-3 sm:grid-cols-2 xl:grid-cols-3">
        <ReportInfoRow label="Tiêu đề">
          <span className="text-body-14-semibold">{post.title}</span>
        </ReportInfoRow>
        <ReportInfoRow label="Nhóm">
          <span>{post.workspace.name}</span>
        </ReportInfoRow>
        <ReportInfoRow label="Người đăng">
          {canViewUser ? (
            <Link className="text-link hover:underline" to={userDetailPath(post.createdBy.id)}>
              {post.createdBy.name}
            </Link>
          ) : (
            <span>{post.createdBy.name}</span>
          )}
        </ReportInfoRow>
        <ReportInfoRow label="Trạng thái">
          <Badge color={status.color} size="sm" variant="tinted">
            {status.label}
          </Badge>
          {post.hiddenAt && (
            <Badge color="warning" size="sm" variant="tinted">
              Đã ẩn {formatDate(post.hiddenAt, TIME_FORMAT)}
            </Badge>
          )}
        </ReportInfoRow>
        <ReportInfoRow label="Đơn">
          <span className="tabular-nums">
            {post.applicantsCount} đơn · {post.pendingCount} đang chờ
          </span>
        </ReportInfoRow>
        <ReportInfoRow label="Cố vấn đang hoạt động">
          <span className="tabular-nums">
            {post.activeEngagements}/{post.mentorsNeeded}
          </span>
        </ReportInfoRow>
        <ReportInfoRow label="Báo cáo đang mở">
          <span className="tabular-nums text-body-14-semibold">{post.reportedCount}</span>
        </ReportInfoRow>
        <ReportInfoRow label="Cam kết / hạn nhận đơn">
          <span className="tabular-nums">
            {post.commitmentHoursPerWeek} giờ/tuần · {formatDate(post.expiresAt, TIME_FORMAT)}
          </span>
        </ReportInfoRow>
        <ReportInfoRow label="Kỹ năng">
          {post.skillLabels.map((skill) => (
            <Badge key={skill} color="neutral" size="sm" variant="tinted">
              {skill}
            </Badge>
          ))}
        </ReportInfoRow>
        {post.hiddenReason && (
          <ReportInfoRow label="Lý do ẩn">
            <span className="whitespace-pre-wrap">{post.hiddenReason}</span>
          </ReportInfoRow>
        )}
      </div>
      <div className="border-t border-divider-1 p-3">
        <p className="whitespace-pre-wrap text-body-14 text-fg-2">{post.description}</p>
      </div>
    </BoxPanel>
  );
});

export default MentorPostReportContext;
