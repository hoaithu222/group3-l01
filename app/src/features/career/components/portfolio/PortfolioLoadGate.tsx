import { router } from 'expo-router';
import { type ReactNode } from 'react';
import { View } from 'react-native';

import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { ScreenState } from '@/shared/ui/screen-state';
import { Skeleton } from '@/shared/ui/skeleton';
import { isNetworkError } from '@/shared/utils/errors';
import { FeatureOffScreen, useFeature } from '@/shell/capabilities';

import type { PortfolioOverview } from '../../api/portfolio.types';
import { usePortfolio } from '../../queries/portfolio.queries';
import { isFeatureOff } from '../../utils/portfolio-errors';

export interface PortfolioLoadGateProps {
  /** Tiêu đề thanh trên các trạng thái tải/lỗi (màn con tự dựng thanh của mình sau khi dữ liệu về). */
  title: string;
  /** `reload` = tải lại hồ sơ, trả bản mới (hoặc `undefined` khi lỗi) — dùng cho banner `RES_003`. */
  children: (
    overview: PortfolioOverview,
    reload: () => Promise<PortfolioOverview | undefined>,
  ) => ReactNode;
}

/**
 * Cửa tải dữ liệu chung của các màn con portfolio (Thông tin, Giao diện, Sửa dự án): khung xương khi tải · lỗi/offline + Thử lại · cờ tắt ⇒ "Tính năng chưa bật" — MỘT chỗ thay vì
 * bốn bản chép. Form của các màn đó chỉ dựng SAU khi có dữ liệu (giá trị ban đầu của RHF chỉ đọc lúc mount, dựng sớm thì form trống rồi không tự điền lại).
 */
export function PortfolioLoadGate({ children, title }: PortfolioLoadGateProps) {
  const query = usePortfolio();
  const careerEnabled = useFeature('career');
  const header = <AppBar title={title} onBack={router.back} />;

  if (careerEnabled === false || (query.isError && isFeatureOff(query.error)))
    return <FeatureOffScreen />;

  if (query.isLoading) {
    return (
      <Screen header={header}>
        <View className="gap-md py-xs">
          <Skeleton className="h-16 rounded-md" />
          <Skeleton className="h-16 rounded-md" />
          <Skeleton className="h-40 rounded-md" />
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

  return <>{children(query.data, async () => (await query.refetch()).data)}</>;
}
