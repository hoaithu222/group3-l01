import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { useConnectionState } from '@/core/socket';
import { Alert } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { EmptyState } from '@/shared/ui/empty-state';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { ScreenState } from '@/shared/ui/screen-state';
import { Skeleton } from '@/shared/ui/skeleton';
import { isNetworkError } from '@/shared/utils/errors';
import { hapticSuccess } from '@/shared/utils/haptics';
import { showToast } from '@/shared/utils/toast.utils';

import { EligibleWorkspaceRow } from '../../components/portfolio/EligibleWorkspaceRow';
import { CAREER_TONE } from '../../constants/career-visuals.constants';
import { usePortfolioLimits } from '../../hooks/usePortfolioLimits';
import { useAddProject } from '../../queries/portfolio-project.mutations';
import { useEligibleWorkspaces, usePortfolio } from '../../queries/portfolio.queries';
import { portfolioErrorMessage } from '../../utils/portfolio-errors';

/**
 * Thêm dự án (app.md p6-07 §3): danh sách nhóm mà bạn có ≥ 1 task hoàn thành được tính cho mình (kể cả nhóm đã lưu trữ/đã rời). Chạm một nhóm ⇒ thêm + chụp số liệu (`Idempotency-Key`),
 * rồi quay lại Tổng quan. Lỗi (`PORT_004/005/006`…) hiện TRONG màn — toast tự tắt sau 4 giây, người dùng cần đọc để biết vì sao không thêm được. Hết chỗ (12 dự án) ⇒ khoá các hàng.
 */
export function PortfolioAddProjectScreen() {
  const query = useEligibleWorkspaces();
  const overview = usePortfolio();
  const add = useAddProject();
  const limits = usePortfolioLimits();
  const offline = useConnectionState() === 'offline';
  const [addingId, setAddingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  const full = (overview.data?.projects.length ?? 0) >= limits.projectsMax;
  const header = <AppBar title="Thêm dự án" onBack={router.back} />;

  const addWorkspace = (workspaceId: string) => {
    setError(null);
    setAddingId(workspaceId);
    add.mutate(workspaceId, {
      onError: (failure) => setError(portfolioErrorMessage(failure)),
      onSettled: () => setAddingId(null),
      onSuccess: () => {
        hapticSuccess();
        showToast('success', 'Đã thêm dự án vào hồ sơ');
        router.back();
      },
    });
  };

  if (query.isLoading) {
    return (
      <Screen header={header}>
        <View className="gap-sm py-xs">
          <Skeleton className="h-16 rounded-md" />
          <Skeleton className="h-16 rounded-md" />
          <Skeleton className="h-16 rounded-md" />
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

  if (items.length === 0) {
    // `EmptyState` (không phải `ScreenState` rỗng) để mang được TÔNG của phân hệ — `ScreenState` chỉ nhận icon.
    return (
      <Screen header={header} scrollable={false}>
        <EmptyState
          description="Hoàn thành task được giao trong một nhóm, hệ thống ghi nhận rồi bạn quay lại đây để thêm."
          fullscreen
          icon="add-team"
          title="Bạn chưa có task hoàn thành nào được ghi nhận"
          tone={CAREER_TONE}
        />
      </Screen>
    );
  }

  return (
    <Screen header={header}>
      <View className="gap-md py-xs">
        <Alert
          description="Chọn nhóm bạn đã góp sức. Số liệu được chụp ngay khi thêm; tên nhóm dùng làm tiêu đề dự án và bạn đổi được."
          tone="info"
        />
        {full ? (
          <Alert
            description={`Hồ sơ đã đạt tối đa ${limits.projectsMax} dự án. Xoá bớt một dự án trước khi thêm.`}
            tone="warning"
          />
        ) : null}
        {error ? <Alert description={error} tone="error" /> : null}
        <Card>
          {items.map((workspace, index) => (
            <EligibleWorkspaceRow
              key={workspace.workspaceId}
              adding={addingId === workspace.workspaceId}
              disabled={full || offline || addingId !== null}
              divider={index < items.length - 1}
              workspace={workspace}
              onAdd={() => addWorkspace(workspace.workspaceId)}
            />
          ))}
        </Card>
        {query.hasNextPage ? (
          <Button
            label="Xem thêm nhóm"
            loading={query.isFetchingNextPage}
            variant="tertiary"
            onPress={() => void query.fetchNextPage()}
          />
        ) : null}
      </View>
    </Screen>
  );
}
