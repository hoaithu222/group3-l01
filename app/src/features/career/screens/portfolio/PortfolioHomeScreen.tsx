import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { useConnectionState } from '@/core/socket';
import { useBreakpoint } from '@/shared/theme';
import { AppBar } from '@/shared/ui/navigation';
import { Screen, useListRefreshControl } from '@/shared/ui/screen';
import { ScreenState } from '@/shared/ui/screen-state';
import { Skeleton } from '@/shared/ui/skeleton';
import { isNetworkError } from '@/shared/utils/errors';
import { FeatureOffScreen, useFeature } from '@/shell/capabilities';

import { PortfolioHomeBody } from '../../components/portfolio/PortfolioHomeBody';
import { PortfolioPreviewPane } from '../../components/portfolio/PortfolioPreviewPane';
import { PortfolioPublishBar } from '../../components/portfolio/PortfolioPublishBar';
import { PublishSheet } from '../../components/portfolio/PublishSheet';
import { UnpublishDialog } from '../../components/portfolio/UnpublishDialog';
import { usePortfolioBuildEvents } from '../../hooks/usePortfolioBuildEvents';
import { usePortfolioLimits } from '../../hooks/usePortfolioLimits';
import {
  useReorderProjects,
  useToggleProjectVisible,
} from '../../queries/portfolio-project.mutations';
import { usePortfolio } from '../../queries/portfolio.queries';
import { previewRevision } from '../../utils/portfolio-cache';
import { isFeatureOff } from '../../utils/portfolio-errors';
import { hasPublishBar } from '../../utils/portfolio-publish-check';
import { portfolioPreviewHref } from '../../utils/portfolio-routes';

/**
 * Tổng quan portfolio (app.md p6-07 §3, §7): trạng thái + link + Chia sẻ, danh sách dự án (ẩn/hiện, lên/xuống), lối vào Thông tin/Giao diện/Xem trước, và thanh Công khai/Cập nhật/Ngừng.
 * Mount `usePortfolioBuildEvents` Ở ĐÂY: màn này ở gốc ngăn xếp portfolio nên còn sống khi người dùng đi xem trước/sửa thông tin — vẫn nhận `portfolio:build-updated` và báo "Đã công khai hồ sơ".
 * Trạng thái: khung xương khi tải · lỗi/offline + Thử lại · cờ tắt ⇒ "Tính năng chưa bật" · rỗng ⇒ lời mời thêm dự án đầu tiên. Offline: đọc cache, khoá mọi nút ghi.
 *
 * ── Máy tính bảng rộng (`tablet-lg`, ≥ 840dp) ⇒ HAI CỘT (§7): danh sách bên trái (cuộn riêng, kéo-để-làm-mới qua `useListRefreshControl`), khung xem trước bên phải, nạp lại mỗi khi hồ sơ/dự án đổi
 * (`previewRevision`). Điện thoại và máy tính bảng hẹp giữ MỘT cột như cũ. `useBreakpoint()` chứ không phải class `tablet-lg:` vì đây là rẽ nhánh NỘI DUNG (che bằng class vẫn mount WebView + xin token
 * trên mọi điện thoại). Cần có hồ sơ mới có gì để xem trước — chưa có thì vẫn một cột.
 */
export function PortfolioHomeScreen() {
  const query = usePortfolio();
  const limits = usePortfolioLimits();
  const careerEnabled = useFeature('career');
  const offline = useConnectionState() === 'offline';
  const { tier } = useBreakpoint();
  const toggleVisible = useToggleProjectVisible();
  const reorder = useReorderProjects();
  const refreshControl = useListRefreshControl({
    onRefresh: () => void query.refetch(),
    refreshing: query.isRefetching,
  });
  const [publishOpen, setPublishOpen] = useState(false);
  const [unpublishOpen, setUnpublishOpen] = useState(false);
  const [previewed, setPreviewed] = useState(false);
  usePortfolioBuildEvents();

  const header = <AppBar title="Portfolio" onBack={router.back} />;

  if (careerEnabled === false || (query.isError && isFeatureOff(query.error)))
    return <FeatureOffScreen />;

  if (query.isLoading) {
    return (
      <Screen header={header}>
        <View className="gap-md py-xs">
          <Skeleton className="h-36 rounded-md" />
          <Skeleton className="h-24 rounded-md" />
          <Skeleton className="h-24 rounded-md" />
        </View>
      </Screen>
    );
  }

  if (!query.data) {
    return (
      <Screen header={header} scrollable={false}>
        <ScreenState
          action={{ label: 'Thử lại', onPress: () => void query.refetch() }}
          state={isNetworkError(query.error) ? 'offline' : 'error'}
        />
      </Screen>
    );
  }

  const { latestBuild, portfolio, projects } = query.data;
  const split = tier === 'tablet-lg' && portfolio !== null;
  const footer = hasPublishBar(portfolio) ? (
    <PortfolioPublishBar
      latestBuild={latestBuild}
      offline={offline}
      portfolio={portfolio}
      onPublish={() => setPublishOpen(true)}
      onUnpublish={() => setUnpublishOpen(true)}
    />
  ) : undefined;
  const body = (
    <PortfolioHomeBody
      busy={toggleVisible.isPending || reorder.isPending}
      max={limits.projectsMax}
      offline={offline}
      overview={query.data}
      onPreview={
        split
          ? undefined
          : () => {
              setPreviewed(true);
              router.push(portfolioPreviewHref());
            }
      }
      onReorder={(projectIds) => reorder.mutate(projectIds)}
      onRetryPublish={() => setPublishOpen(true)}
      onToggleVisible={(project, visible) => toggleVisible.mutate({ project, visible })}
    />
  );
  const overlays = (
    <>
      {portfolio ? (
        <PublishSheet
          portfolio={portfolio}
          previewed={previewed || split}
          projects={projects}
          visible={publishOpen}
          onClose={() => setPublishOpen(false)}
        />
      ) : null}
      <UnpublishDialog visible={unpublishOpen} onClose={() => setUnpublishOpen(false)} />
    </>
  );

  if (split) {
    return (
      // `constrained={false}` + `scrollable={false}`: hai cột tự cuộn/tự co, trần 720dp (`max-w-content`) của `Screen` biến máy tính bảng thành điện thoại to.
      <Screen constrained={false} footer={footer} header={header} scrollable={false}>
        <View className="flex-1 flex-row gap-md pb-xs">
          <ScrollView
            className="flex-1"
            refreshControl={refreshControl}
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
          >
            {body}
          </ScrollView>
          <View className="flex-1 py-xs">
            <PortfolioPreviewPane revision={previewRevision(query.data)} />
          </View>
        </View>
        {overlays}
      </Screen>
    );
  }

  return (
    <Screen
      footer={footer}
      header={header}
      refreshing={query.isRefetching}
      onRefresh={() => void query.refetch()}
    >
      {body}
      {overlays}
    </Screen>
  );
}
