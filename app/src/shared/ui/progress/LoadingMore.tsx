import { ActivityIndicator, View } from 'react-native';

import { useThemeColor } from '@/shared/theme';
import { cn } from '@/shared/utils/style/cn';

export interface LoadingMoreProps {
  className?: string;
  /** Câu trình đọc màn hình xướng. Mặc định "Đang tải thêm". */
  label?: string;
}

/**
 * Vòng quay "đang tải THÊM" ở chân danh sách hoặc cuối một khối nội dung: trang kế của phân trang cursor, "xem thêm
 * người đã phản ứng"…
 *
 * ── Khi nào KHÔNG dùng ──────────────────────────────────────────────────────
 * Tải LẦN ĐẦU là việc của `Skeleton*` (giữ chỗ bố cục, không nhảy khi dữ liệu về) — ⛔ đừng đặt vòng quay giữa màn thay
 * Skeleton. Vòng quay TRONG nút là `Button loading`.
 *
 * ── Vì sao không viết `<ActivityIndicator />` trần ──────────────────────────
 * 1. MÀU: `ActivityIndicator` nhận mã màu THÔ, không nhận `className` (`docs/rules/styling-nativewind.md`, mục "Khi prop
 *    KHÔNG nhận className"). Không truyền `color` thì iOS vẽ xám cố định còn Android lấy màu nhấn của hệ điều hành — xanh
 *    đậm, gần như biến mất trên nền tối (cùng lỗi mà `useScreenRefreshControl` đã chữa cho vòng kéo-để-làm-mới). Ở đây
 *    lấy `fg-2` từ token nên đổi theo sáng/tối.
 * 2. TRỢ NĂNG: vòng quay không có nhãn thì trình đọc màn hình im lặng — người dùng khiếm thị lướt tới cuối danh sách, không
 *    biết là đang tải hay đã hết. `progressbar` + `busy` + nhãn nói đúng việc đang xảy ra.
 */
export function LoadingMore({ className, label = 'Đang tải thêm' }: LoadingMoreProps) {
  const color = useThemeColor('fg-2');

  return (
    <View
      accessibilityLabel={label}
      accessibilityRole="progressbar"
      accessibilityState={{ busy: true }}
      accessible
      className={cn('items-center py-sm', className)}
    >
      <ActivityIndicator color={color} />
    </View>
  );
}
