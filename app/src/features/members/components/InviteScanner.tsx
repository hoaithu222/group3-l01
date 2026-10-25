import { useEffect } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';

import { openAppSettings } from '@/core/media/permissions';
import { EmptyState } from '@/shared/ui/empty-state';
import { Skeleton } from '@/shared/ui/skeleton';

import { useInviteScan } from '../hooks/useInviteScan';
import { useCameraPermissions, type CameraModule } from '../utils/load-camera-module';

/** Chỉ đọc QR: nhận thêm loại mã khác là quét nhầm mã vạch trên bao bì rồi báo "không phải link mời". */
const QR_ONLY = { barcodeTypes: ['qr' as const] };

/**
 * Xem trước camera + đọc mã QR của link mời. Nhận `camera` (module `expo-camera` ĐÃ nạp xong — xem
 * `useCameraModule`) thay vì import tĩnh, để bản dev client chưa có `ExpoCamera` không đỏ màn lúc khởi động.
 *
 * Ba trạng thái quyền: đang hỏi (khung giữ chỗ) · chưa cấp/bị chặn (màn giải thích) · đã cấp (camera).
 *
 * ⚠️ `useCameraPermissions` lấy từ `load-camera-module` (hook tĩnh), KHÔNG phải từ `camera.useCameraPermissions`:
 * hook lấy từ prop làm React Compiler bỏ qua cả component — xem chú thích ở hook đó.
 */
export function InviteScanner({ camera }: { camera: CameraModule }) {
  const { CameraView } = camera;
  const [permission, requestPermission, refreshPermission] = useCameraPermissions();
  const scan = useInviteScan();

  // Người dùng sang Cài đặt hệ thống bật quyền rồi quay lại: hook chỉ đọc quyền LÚC MOUNT, không tự đọc lại —
  // thiếu đoạn này thì họ bật xong quay về vẫn thấy "quyền bị chặn" và tưởng nút Mở Cài đặt vô dụng.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refreshPermission();
    });
    return () => subscription.remove();
  }, [refreshPermission]);

  if (permission === null) return <Skeleton className="aspect-square w-full rounded-md" />;

  if (!permission.granted) {
    // `canAskAgain === false` = từ chối vĩnh viễn (iOS: sau lần từ chối đầu; Android: sau "không hỏi lại"):
    // gọi xin quyền lúc này im lặng không hiện hộp thoại nào — chỉ còn cách vào Cài đặt.
    const blocked = !permission.canAskAgain;
    return (
      <EmptyState
        actions={[
          blocked
            ? { label: 'Mở Cài đặt', onPress: openAppSettings }
            : { label: 'Cấp quyền camera', onPress: () => void requestPermission() },
        ]}
        description={
          blocked
            ? 'Quyền camera đang bị tắt. Hãy bật lại trong Cài đặt của thiết bị để quét mã QR.'
            : 'Ứng dụng cần dùng camera để quét mã QR của link mời.'
        }
        icon="lock"
        title="Cần quyền dùng camera"
        tone="warning"
      />
    );
  }

  return (
    <View className="gap-md">
      <View className="aspect-square w-full overflow-hidden rounded-md bg-ink-10">
        <CameraView
          barcodeScannerSettings={QR_ONLY}
          facing="back"
          style={StyleSheet.absoluteFill}
          onBarcodeScanned={(result) => scan.onScanned(result.data)}
        />
        {/* Khung ngắm chỉ để trang trí, ⛔ không được ăn cú chạm của camera bên dưới. */}
        <View className="absolute inset-0 items-center justify-center" pointerEvents="none">
          <View className="h-2/3 w-2/3 rounded-sm border-thick border-neutral-0" />
        </View>
      </View>

      {/* Nhãn lỗi thay CHÍNH dòng hướng dẫn (không thêm dòng mới) nên bố cục không nhảy; live region để trình
          đọc màn hình xướng ngay khi mã sai xuất hiện. */}
      <Text
        accessibilityLiveRegion="polite"
        accessibilityRole={scan.invalid ? 'alert' : undefined}
        className={
          scan.invalid
            ? 'text-center text-label-md text-error'
            : 'text-center text-body-md text-fg-2'
        }
      >
        {scan.invalid
          ? 'Mã QR này không phải link mời'
          : 'Đưa mã QR của link mời vào khung để quét.'}
      </Text>
    </View>
  );
}
