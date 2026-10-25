import { formatPoints, formatScore } from '@/shared/career';
import type { BadgeVariant } from '@/shared/ui/badge';
import { formatDateTime } from '@/shared/utils/format/date.utils';

import type { Portfolio, PortfolioProject, PortfolioSnapshot } from '../api/portfolio.types';
import { ACCENT_LABELS, TEMPLATE_LABELS } from '../constants/portfolio.constants';

/** "40 task · 62 điểm" — dòng số liệu gọn của một dự án (luôn kèm ĐƠN VỊ bằng chữ, không chỉ con số: app.md §7). */
export function projectSummaryLine(snapshot: PortfolioSnapshot): string {
  return `${snapshot.tasksDone} task · ${formatPoints(snapshot.storyPoints)} điểm`;
}

export interface StatLine {
  key: string;
  label: string;
  value: string;
}

/**
 * Số liệu HỆ THỐNG ghi nhận của một dự án (app.md §3 "Sửa dự án"). Chỉ dòng CÓ dữ liệu: `null` = chưa có (p4-06 chưa tính) hoặc chủ hồ sơ đang TẮT
 * `showContribution` — BE cũng ẩn chúng khỏi trang công khai, nên app không bày ra "—" trông như lỗi.
 */
export function snapshotStats(snapshot: PortfolioSnapshot): StatLine[] {
  const lines: StatLine[] = [
    { key: 'tasks', label: 'Task hoàn thành', value: `${snapshot.tasksDone} task` },
    { key: 'points', label: 'Story points', value: `${formatPoints(snapshot.storyPoints)} điểm` },
  ];
  if (snapshot.onTimeRatePct !== null) {
    lines.push({
      key: 'ontime',
      label: 'Tỉ lệ đúng hạn',
      value: `${formatPoints(snapshot.onTimeRatePct)}% đúng hạn`,
    });
  }
  if (snapshot.contributionPct !== null) {
    lines.push({
      key: 'contrib',
      label: 'Điểm đóng góp',
      value: `${formatPoints(snapshot.contributionPct)}/100 điểm`,
    });
  }
  if (snapshot.contributionSharePct !== null) {
    lines.push({
      key: 'share',
      label: 'Khối lượng trong nhóm',
      value: `${formatPoints(snapshot.contributionSharePct)}% khối lượng của nhóm`,
    });
  }
  if (snapshot.peerReviewAvg !== null) {
    lines.push({
      key: 'review',
      label: 'Điểm review trung bình',
      value: `${formatScore(snapshot.peerReviewAvg)}/10 điểm review`,
    });
  }
  lines.push({ key: 'files', label: 'Tệp tải lên', value: `${snapshot.filesUploaded} tệp` });
  lines.push({ key: 'team', label: 'Đồng đội', value: `${snapshot.teammatesCount} người` });
  return lines;
}

/** "Cập nhật lúc 15/09/2026 10:32" — thời điểm chụp số liệu; trang công khai cũng ghi câu này. */
export const snapshotAtText = (project: Pick<PortfolioProject, 'snapshotAt'>): string =>
  `Cập nhật lúc ${formatDateTime(project.snapshotAt, '—')}`;

export interface PortfolioStatusView {
  label: string;
  tone: BadgeVariant;
}

/** Nhãn + tông của trạng thái hồ sơ. Bị gỡ thắng mọi trạng thái khác (BE giữ `status UNPUBLISHED` khi gỡ, nhưng người dùng cần biết LÝ DO). */
export function portfolioStatusView(portfolio: Portfolio | null): PortfolioStatusView {
  if (!portfolio || portfolio.status === 'DRAFT') return { label: 'Bản nháp', tone: 'neutral' };
  if (portfolio.takenDown) return { label: 'Đã bị gỡ', tone: 'error' };
  if (portfolio.status === 'PUBLISHED') return { label: 'Đã công khai', tone: 'success' };
  return { label: 'Đã ngừng công khai', tone: 'neutral' };
}

/** "Lập trình viên · Xanh lá" — nhãn dự phòng cho dòng tóm tắt giao diện ở màn Tổng quan (không cần tải danh mục mẫu). */
export const themeSummary = (theme: Portfolio['theme']): string =>
  `${TEMPLATE_LABELS[theme.template]} · ${ACCENT_LABELS[theme.accent]}`;
