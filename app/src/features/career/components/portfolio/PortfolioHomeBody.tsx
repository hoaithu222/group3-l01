import { router } from 'expo-router';
import { View } from 'react-native';

import type { PortfolioOverview } from '../../api/portfolio.types';
import { movedIds } from '../../utils/portfolio-cache';
import { PORTFOLIO_ADD_PROJECT_HREF, portfolioProjectHref } from '../../utils/portfolio-routes';
import { PortfolioProjectsSection } from './PortfolioProjectsSection';
import { PortfolioQuickLinks } from './PortfolioQuickLinks';
import { PortfolioStatusCard } from './PortfolioStatusCard';

export interface PortfolioHomeBodyProps {
  overview: PortfolioOverview;
  /** `limits.projectsMax`. */
  max: number;
  offline: boolean;
  /** Đang lưu ẩn/hiện hoặc đổi thứ tự — khoá điều khiển từng dự án. */
  busy: boolean;
  onRetryPublish: () => void;
  onToggleVisible: (project: PortfolioOverview['projects'][number], visible: boolean) => void;
  onReorder: (projectIds: string[]) => void;
  /** Không truyền ⇒ ẩn hàng "Xem trước" (khung xem trước đã nằm cạnh ở máy tính bảng rộng). */
  onPreview?: () => void;
}

/**
 * Ba khối của màn Tổng quan (thẻ trạng thái · dự án · lối vào Thông tin/Giao diện/Xem trước) — dùng cho CẢ hai bố cục: một cột cuộn (điện thoại) và cột TRÁI (máy tính bảng rộng, khung xem trước bên
 * phải). Tách ra để bố cục nào cũng dựng đúng cùng một nội dung, không hai bản chép lệch nhau.
 */
export function PortfolioHomeBody({
  busy,
  max,
  offline,
  onPreview,
  onReorder,
  onRetryPublish,
  onToggleVisible,
  overview,
}: PortfolioHomeBodyProps) {
  const { latestBuild, portfolio, projects, publicUrl } = overview;

  return (
    // Khe 24 giữa các khối (screen-layout `gap-xl`).
    <View className="gap-xl py-xs">
      <PortfolioStatusCard
        latestBuild={latestBuild}
        offline={offline}
        portfolio={portfolio}
        publicUrl={publicUrl}
        onRetry={onRetryPublish}
      />
      <PortfolioProjectsSection
        busy={busy}
        max={max}
        offline={offline}
        projects={projects}
        onAdd={() => router.push(PORTFOLIO_ADD_PROJECT_HREF)}
        onMove={(projectId, direction) => onReorder(movedIds(projects, projectId, direction))}
        onOpen={(projectId) => router.push(portfolioProjectHref(projectId))}
        onToggleVisible={onToggleVisible}
      />
      <PortfolioQuickLinks portfolio={portfolio} onPreview={onPreview} />
    </View>
  );
}
