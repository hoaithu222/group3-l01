import { Text, View } from 'react-native';

import { Button } from '@/shared/ui/button';
import { Skeleton } from '@/shared/ui/skeleton';

export interface MediaViewerStateProps {
  kind: 'empty' | 'error' | 'loading';
  /** Có thì hiện nút "Đóng" — màn xem không có trang nào thì không còn thanh công cụ để thoát. */
  onClose?: () => void;
  /** Có thì hiện nút "Thử lại" (chỉ có nghĩa với `error`). */
  onRetry?: () => void;
}

const COPY = {
  empty: 'Tệp này không còn để xem.',
  error: 'Không tải được tệp. Kiểm tra kết nối rồi thử lại.',
} as const;

/**
 * Trạng thái của trình xem ảnh/video khi CHƯA có gì để vẽ: đang tải · lỗi (kèm "Thử lại") · tin không còn tệp.
 *
 * ⛔ Trước đây ba ca này đều là MỘT MÀN ĐEN TRỐNG không chữ, không nút: tải tin lỗi thì không có thanh công cụ (nó cần một
 * tệp đính kèm), người dùng không biết chuyện gì xảy ra và không có gì để bấm. Nền là `ink-10` (gần đen, ở cả hai chế độ)
 * nên chữ dùng `white-10` (trắng CỐ ĐỊNH) và nút dùng biến thể `white` — không dùng token theo chế độ sáng/tối của phần còn lại.
 * ⛔ Không `fg-inverse`: ở chế độ tối nó là màu mực (#08120F) — câu báo lỗi chìm hẳn vào nền đen.
 */
export function MediaViewerState({ kind, onClose, onRetry }: MediaViewerStateProps) {
  if (kind === 'loading') {
    return (
      <View className="flex-1 justify-center px-md">
        <Skeleton className="h-64 w-full rounded-md" />
        {onClose ? <CloseButton onClose={onClose} /> : null}
      </View>
    );
  }

  return (
    <View className="flex-1 items-center justify-center gap-md px-lg">
      <Text className="text-center text-body-md text-white-10">{COPY[kind]}</Text>
      {kind === 'error' && onRetry ? (
        <Button label="Thử lại" variant="white" onPress={onRetry} />
      ) : null}
      {onClose ? <CloseButton onClose={onClose} /> : null}
    </View>
  );
}

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <View className="items-center pt-md">
      <Button label="Đóng" variant="white-secondary" onPress={onClose} />
    </View>
  );
}
