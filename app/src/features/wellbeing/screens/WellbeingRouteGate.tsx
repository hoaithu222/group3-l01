import { router } from 'expo-router';
import type { ReactNode } from 'react';

import { AppBar } from '@/shared/ui/navigation';
import { useCapabilities } from '@/shell/capabilities';

import { WellbeingUnavailableScreen } from './WellbeingUnavailableScreen';
import { WellbeingLoadState } from '../components/WellbeingLoadState';

/**
 * Hàng rào cờ `burnout` cho CẢ nhánh `me/wellbeing` (đặt ở `_layout.tsx`). Cùng luật `FeatureRouteGuard` của shell — cờ TẮT (đã biết chắc) ⇒ thay nội dung; CHƯA biết (đang tải lần đầu, chưa cache) ⇒
 * khung chờ; lỗi tải mà không có cache ⇒ cho vào (fail-open như thanh tab, BE vẫn chặn bằng 404 `CFG_005`) — nhưng thay màn "chưa được bật" chung bằng `WellbeingUnavailableScreen`,
 * vì màn này còn hai nút RÚT LẠI/XOÁ mà `FeatureOffScreen` không có (quyền của người dùng không phụ thuộc cờ). Cờ chuyển tắt giữa chừng ⇒ thay nội dung ngay, không văng khỏi màn.
 */
export function WellbeingRouteGate({ children }: { children: ReactNode }) {
  const { data, isLoading } = useCapabilities();

  if (data && !data.features.burnout?.enabled) return <WellbeingUnavailableScreen />;
  if (!data && isLoading) {
    return (
      <WellbeingLoadState
        error={null}
        header={<AppBar title="Sức khoẻ học tập" onBack={router.back} />}
        isLoading
        onRetry={() => undefined}
      />
    );
  }
  return <>{children}</>;
}
