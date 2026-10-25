import { memo } from 'react';
import type { ReactNode } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';

import { useAuthStore } from '@/app/store';
import {
  BoxPanel,
  Button,
  Callout,
  EmptyState,
  PageBody,
  PageShell,
  Skeleton,
} from '@/shared/ui';
import { AuditTrailPanel } from '@/shared/widgets/audit-trail';
import { PageHeader } from '@/shared/widgets/header';

import ReportContentPanel from '../components/ReportContentPanel';
import ReportContext from '../components/ReportContext';
import ReportDecisionBar from '../components/ReportDecisionBar';
import ReportEntriesTable from '../components/ReportEntriesTable';
import ReportHistory from '../components/ReportHistory';
import CompanyTargetPanel from '../components/targets/CompanyTargetPanel';
import JobOfferTargetPanel from '../components/targets/JobOfferTargetPanel';
import MentorPostTargetPanel from '../components/targets/MentorPostTargetPanel';
import PortfolioTargetPanel from '../components/targets/PortfolioTargetPanel';
import StudySetTargetPanel from '../components/targets/StudySetTargetPanel';
import { MODERATION_BASE_PATH, REPORT_TARGET_TYPE_LABEL } from '../constants/moderation.constants';
import { useModerationSocket } from '../hooks';
import { useAdminReport } from '../service/moderation.queries';
import { isReportUnavailable } from '../utils/report-errors';
import { returnPathFrom } from '../utils/report-links';

/** Loại đối tượng của bản ghi audit do BE ghi cho báo cáo (`targetType: "Report"`). */
const AUDIT_TARGET_TYPE = 'Report';

/**
 * Chi tiết một nhóm báo cáo (`/moderation/:id`, admin.md p1-08 §2.2): ngữ cảnh → từng báo cáo →
 * nội dung (public hiện ngay; riêng tư qua cổng D-06) → lịch sử → quyết định → nhật ký.
 *
 * `id` là báo cáo đại diện của nhóm. Các khối có trạng thái "đã xác nhận xem nội dung riêng tư"
 * hoặc hộp thoại đang mở được `key` theo `id` — đổi sang báo cáo khác (vd bấm dòng lịch sử) là
 * dựng lại, KHÔNG thừa hưởng xác nhận của báo cáo trước.
 *
 * Nút quay lại về đúng hàng đợi/tab workspace đã bấm vào (`location.state.from`, giữ bộ lọc); mở
 * bằng tab mới không có state → về `/moderation`.
 */
const ReportDetailPage = memo(function ReportDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  useModerationSocket();

  const canUpdate = useAuthStore((s) => s.hasPermission('moderation', 'update'));
  const canApprove = useAuthStore((s) => s.hasPermission('moderation', 'approve'));
  const canUpdateUser = useAuthStore((s) => s.hasPermission('user', 'update'));

  const { data, isLoading, isError, error, refetch } = useAdminReport(id);
  const detail = data?.data;
  const backTo = returnPathFrom(location.state, MODERATION_BASE_PATH);

  let body: ReactNode;
  if (isLoading) {
    body = <Skeleton className="h-40 w-full" />;
  } else if (isError && !detail && !isReportUnavailable(error)) {
    // Mất mạng / 5xx: lỗi TẠM THỜI — có "Thử lại" (khác 404/403: báo cáo không có hoặc không được xem).
    body = (
      <Callout
        action={
          <Button size="sm" variant="stroke" onClick={() => void refetch()}>
            Thử lại
          </Button>
        }
        description="Kiểm tra kết nối rồi thử lại."
        intent="error"
        title="Không tải được báo cáo"
      />
    );
  } else if (isError || !detail || !id) {
    body = (
      <EmptyState
        description="Báo cáo không tồn tại hoặc bạn không có quyền xem."
        icon="shield-check-bold"
        title="Không tải được báo cáo"
      />
    );
  } else {
    body = (
      <div className="flex flex-col gap-3">
        <ReportContext authorStats={detail.authorStats} group={detail.group} />
        <ReportEntriesTable reports={detail.reports} />
        {detail.group.targetType === 'STUDY_SET' ? (
          // p4-01: bộ học có ngữ cảnh + nội dung (CHỈ bộ PUBLIC) + ẩn/khôi phục riêng, không phải tin nhắn.
          <StudySetTargetPanel key={id} canUpdate={canUpdate} group={detail.group} />
        ) : detail.group.targetType === 'MENTOR_POST' ? (
          // p6-03: bài tìm cố vấn — ngữ cảnh + nội dung bài (công khai) + ẩn/khôi phục riêng.
          <MentorPostTargetPanel key={id} canUpdate={canUpdate} group={detail.group} />
        ) : detail.group.targetType === 'PORTFOLIO' ? (
          // p6-07: portfolio — ngữ cảnh hồ sơ (chỉ metadata) + gỡ/mở lại riêng, không phải tin nhắn.
          <PortfolioTargetPanel key={id} canUpdate={canUpdate} group={detail.group} />
        ) : detail.group.targetType === 'COMPANY' ? (
          // p6-08: doanh nghiệp tuyển dụng — ngữ cảnh hồ sơ + tạm ngưng/khôi phục riêng, không phải tin nhắn.
          <CompanyTargetPanel key={id} group={detail.group} />
        ) : detail.group.targetType === 'JOB_OFFER' ? (
          // p6-08: lời mời việc làm — cổng xác nhận (ghi nhật ký) → nội dung lời mời bị báo cáo + thu hồi riêng.
          <JobOfferTargetPanel key={id} group={detail.group} />
        ) : (
          <ReportContentPanel
            key={id}
            canApprove={canApprove}
            canUpdate={canUpdate}
            group={detail.group}
            publicContent={detail.publicContent}
            reportId={id}
          />
        )}
        <ReportHistory history={detail.history} />
        <ReportDecisionBar
          key={id}
          backTo={backTo}
          canLockUser={canUpdateUser}
          canUpdate={canUpdate}
          group={detail.group}
          reportId={id}
        />
        <BoxPanel border="hairline" title="Nhật ký quản trị">
          <AuditTrailPanel targetId={id} targetType={AUDIT_TARGET_TYPE} />
        </BoxPanel>
      </div>
    );
  }

  return (
    <PageShell>
      {/* Tiêu đề + nút quay lại lên THANH HEADER. `backTo` là một path thật (hàng đợi / tab
          workspace đã bấm vào) nên nút mang `href` — chuột phải mở được nơi đó ở thẻ mới. */}
      <PageHeader
        backHref={backTo}
        title={
          detail
            ? `Báo cáo — ${REPORT_TARGET_TYPE_LABEL[detail.group.targetType]}`
            : 'Chi tiết báo cáo'
        }
        tone="orange"
        onBack={() => navigate(backTo)}
      />
      <PageBody overflow="scroll">{body}</PageBody>
    </PageShell>
  );
});

export default ReportDetailPage;
