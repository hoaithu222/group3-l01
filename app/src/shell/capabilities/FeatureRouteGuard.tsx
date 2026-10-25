import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Screen } from '@/shared/ui/screen';
import { Skeleton } from '@/shared/ui/skeleton';

import { FeatureOffScreen } from './FeatureOffScreen';
import { useCapabilities } from './use-capabilities';

export interface FeatureRouteGuardProps {
  children: ReactNode;
  /** Tên cờ phân hệ ở backend (`capabilities.features.<flag>`), vd `communication`. */
  flag: string;
}

/**
 * Bọc `_layout` của một phân hệ: cờ TẮT (đã biết chắc) → `FeatureOffScreen`; đang tải lần đầu và CHƯA có cache → khung
 * chờ; còn lại vẽ nguyên nội dung (p0-07 `app.md` §3).
 *
 * Ba điều dễ sai:
 *  · ⛔ "Chưa biết" KHÔNG phải "tắt": chưa có dữ liệu thì không kết luận tắt (nháy `FeatureOffScreen` lúc mở app);
 *  · lỗi tải mà không có cache → cho vào (fail-open như thanh tab): BE vẫn chặn bằng 404 `CFG_005`;
 *  · cờ chuyển tắt khi người dùng đang ở giữa màn → thay nội dung NGAY (children bị gỡ) chứ không điều hướng đi — không
 *    "văng" khỏi màn đột ngột, và khi bật lại cờ thì children dựng lại. Trạng thái nhập dở của phân hệ chỉ mất theo
 *    children (nháp chat có store riêng nên vẫn còn).
 */
export function FeatureRouteGuard({ children, flag }: FeatureRouteGuardProps) {
  const { data, isLoading } = useCapabilities();

  if (data && !data.features[flag]?.enabled) return <FeatureOffScreen />;

  if (!data && isLoading) {
    return (
      <Screen scrollable={false}>
        <View className="gap-sm py-md">
          <Skeleton className="h-12 rounded-md" />
          <Skeleton className="h-24 rounded-md" />
          <Skeleton className="h-24 rounded-md" />
        </View>
      </Screen>
    );
  }

  return <>{children}</>;
}
