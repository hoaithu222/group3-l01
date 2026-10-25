import { router } from 'expo-router';

import { EmptyState } from '@/shared/ui/empty-state';
import { Screen } from '@/shared/ui/screen';
import { PATHS } from '@/shell/config';

/**
 * Màn cho đường dẫn không tồn tại (`app/+not-found.tsx`).
 *
 * Trên di động, đây KHÔNG phải trang 404 hiếm gặp như trên web — người dùng
 * không gõ URL. Nó xuất hiện khi:
 *   · một deep link cũ trong e-mail/thông báo trỏ tới màn hình đã bị xoá;
 *   · thông báo đẩy mang đường dẫn sai;
 *   · bản cập nhật đổi tên route mà máy chủ push chưa cập nhật theo.
 *
 * Vì vậy phải luôn có ĐƯỜNG RA rõ ràng — không có thì người dùng chỉ còn cách
 * tắt app đi.
 *
 * ── Vì sao dựng bằng `Screen` + `EmptyState`, không phải `<View>` + `<Text>` ──
 * Bản trước tự dựng khung: nền `bg-bg-base` không có dải gradient và không đệm
 * vùng an toàn, chữ phụ dùng `text-fg-3` (2.96:1 — không đọc được ở chế độ sáng),
 * và "Về trang chủ" là một `<Text>` cao ~24dp làm nút (dưới ngưỡng chạm 44dp, không
 * vai `button`). `EmptyState` + nút của bộ chung lo cả ba.
 *
 * `router.replace` chứ không `push`: màn này không được nằm lại trong ngăn xếp —
 * Back từ trang chủ mà quay về "Không tìm thấy" là thứ người dùng không hiểu.
 */
export function NotFoundScreen() {
  return (
    <Screen scrollable={false}>
      <EmptyState
        actions={[{ label: 'Về trang chủ', onPress: () => router.replace(PATHS.HOME) }]}
        description="Liên kết có thể đã cũ hoặc màn hình đã được đổi tên."
        fullscreen
        icon="alert-help"
        title="Không tìm thấy màn hình này"
        tone="neutral"
      />
    </Screen>
  );
}
