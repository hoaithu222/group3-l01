import { memo } from 'react';
import { Link } from 'react-router-dom';

import { useAuthStore } from '@/app/store';
import { Badge, BoxPanel } from '@/shared/ui';
import { formatDate } from '@/shared/utils/format';

import {
  STUDY_STATUS_META,
  STUDY_VISIBILITY_LABEL,
} from '../../constants/study-set-moderation.constants';
import type { AdminStudySet } from '../../types/study-set-moderation.types';
import { userDetailPath } from '../../utils/report-links';
import ReportInfoRow from '../ReportInfoRow';

const TIME_FORMAT = 'HH:mm DD/MM/YYYY';

export interface StudySetReportContextProps {
  set: AdminStudySet;
}

/**
 * Khối "Bộ học bị báo cáo" (admin.md p4-01 §2.1 "Ngữ cảnh"): tiêu đề, tác giả (liên kết khi có
 * `user:view`), phạm vi, trạng thái (kèm lý do/thời điểm ẩn), số mục, số lần sao chép, số báo cáo mở,
 * thẻ. Lý do + mô tả của TỪNG báo cáo nằm ở `ReportEntriesTable`, báo cáo khác của cùng tác giả ở
 * `ReportHistory` — không lặp lại ở đây.
 *
 * Tiêu đề/mô tả/thẻ của bộ WORKSPACE là dữ liệu của nhóm nhưng là metadata tổ chức mà BE vẫn trả cho
 * quản trị (admin-plan §3.4: bộ WORKSPACE "chỉ thông tin chung") — nội dung MỤC học thì không.
 */
const StudySetReportContext = memo(function StudySetReportContext({
  set,
}: StudySetReportContextProps) {
  const canViewUser = useAuthStore((s) => s.hasPermission('user', 'view'));
  const status = STUDY_STATUS_META[set.status];

  return (
    <BoxPanel border="hairline" title="Bộ học bị báo cáo">
      <div className="grid grid-cols-1 gap-x-6 gap-y-3 p-3 sm:grid-cols-2 xl:grid-cols-3">
        <ReportInfoRow label="Tiêu đề">
          <span className="text-body-14-semibold">{set.title}</span>
        </ReportInfoRow>
        <ReportInfoRow label="Tác giả">
          {set.owner && canViewUser ? (
            <Link className="text-link hover:underline" to={userDetailPath(set.owner.id)}>
              {set.owner.name}
            </Link>
          ) : (
            <span className={set.owner ? undefined : 'text-fg-5'}>{set.owner?.name ?? '—'}</span>
          )}
        </ReportInfoRow>
        <ReportInfoRow label="Phạm vi">
          <span>{STUDY_VISIBILITY_LABEL[set.visibility]}</span>
        </ReportInfoRow>
        <ReportInfoRow label="Trạng thái">
          <Badge color={status.color} size="sm" variant="tinted">
            {status.label}
          </Badge>
          {set.status === 'HIDDEN' && set.hiddenAt && (
            <span className="tabular-nums text-caption-12 text-fg-4">
              {formatDate(set.hiddenAt, TIME_FORMAT)}
            </span>
          )}
        </ReportInfoRow>
        <ReportInfoRow label="Số mục">
          <span className="tabular-nums">{set.itemCount}</span>
        </ReportInfoRow>
        <ReportInfoRow label="Đã được sao chép">
          <span className="tabular-nums">{set.copyCount} lần</span>
        </ReportInfoRow>
        <ReportInfoRow label="Báo cáo đang mở">
          <span className="tabular-nums text-body-14-semibold">{set.reportedCount}</span>
        </ReportInfoRow>
        <ReportInfoRow label="Thẻ">
          {set.tags.length > 0 ? (
            set.tags.map((tag) => (
              <Badge key={tag} color="neutral" size="sm" variant="tinted">
                {tag}
              </Badge>
            ))
          ) : (
            <span className="text-fg-5">—</span>
          )}
        </ReportInfoRow>
        <ReportInfoRow label="Tạo / cập nhật">
          <span className="tabular-nums text-caption-12 text-fg-3">
            {formatDate(set.createdAt, TIME_FORMAT)} → {formatDate(set.updatedAt, TIME_FORMAT)}
          </span>
        </ReportInfoRow>
        {set.status === 'HIDDEN' && set.hiddenReason && (
          <ReportInfoRow label="Lý do ẩn">
            <span className="whitespace-pre-wrap">{set.hiddenReason}</span>
          </ReportInfoRow>
        )}
      </div>
    </BoxPanel>
  );
});

export default StudySetReportContext;
