import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';

import { PortfolioPreviewPane } from '../../components/portfolio/PortfolioPreviewPane';
import { trialFromParams } from '../../utils/portfolio-url';

/**
 * Xem trước toàn màn (app.md p6-07 §3): WebView nạp `GET /me/portfolio/preview` (có đăng nhập; `?template=&accent=` khi thử mẫu CHƯA lưu từ màn Giao diện). Toàn bộ nội dung — công tắc thiết bị,
 * WebView, các trạng thái lỗi/offline — nằm ở `PortfolioPreviewPane`, dùng chung với cột phải của Tổng quan trên máy tính bảng.
 */
export function PortfolioPreviewScreen() {
  const params = useLocalSearchParams<{ template?: string; accent?: string }>();
  const trial = trialFromParams(params);

  return (
    <Screen
      header={
        <AppBar
          subtitle={trial ? 'Đang thử mẫu chưa lưu' : undefined}
          title="Xem trước"
          onBack={router.back}
        />
      }
      scrollable={false}
    >
      <View className="flex-1 pb-md">
        <PortfolioPreviewPane trial={trial} />
      </View>
    </Screen>
  );
}
