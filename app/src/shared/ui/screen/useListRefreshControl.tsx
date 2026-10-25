import { type ReactElement } from 'react';
import { type RefreshControlProps } from 'react-native';

import { useScreenRefreshControl } from './useScreenRefreshControl';

/**
 * Vòng quay KÉO-ĐỂ-LÀM-MỚI cho `FlashList` / `FlatList` / `SectionList` — nơi `Screen` không cuộn hộ (`scrollable={false}`).
 *
 * ── ⛔ Vì sao KHÔNG truyền `refreshing`/`onRefresh` thẳng cho danh sách ─────────
 * Danh sách có `onRefresh` mà không có `refreshControl` thì React Native tự dựng một `RefreshControl` MẶC ĐỊNH — màu xám
 * của iOS / xanh Material của Android, không đi qua token. Ở chế độ tối nó gần như biến mất (vòng xanh đậm trên nền
 * #070A0A), đúng lỗi mà `useScreenRefreshControl` đã chữa cho `Screen` — chữa một nửa app thì nửa còn lại vẫn hỏng.
 * `docs/rules/styling-nativewind.md` mục "Khi prop KHÔNG nhận className" nêu đích danh `<RefreshControl tintColor>`.
 *
 * Dùng chung MỘT hook với `Screen` (cùng màu, cùng nền ô tròn) thay vì mỗi danh sách tự khai `tintColor`.
 *
 * ```tsx
 * const refreshControl = useListRefreshControl({ refreshing: query.isRefetching, onRefresh: () => void query.refetch() });
 * <FlashList refreshControl={refreshControl} … />
 * ```
 *
 * ⚠️ Là HOOK trả về PHẦN TỬ chứ không phải component bọc — lý do nằm ở `useScreenRefreshControl` (Android nhân bản phần
 * tử `refreshControl` rồi rót prop vào bản sao; vỏ bọc không chuyển tiếp thì nội dung mất). Và ⛔ như mọi hook: gọi ở đầu
 * component, không nằm sau `return` sớm hay trong nhánh điều kiện.
 */
export function useListRefreshControl({
  onRefresh,
  refreshing = false,
}: {
  onRefresh: () => void;
  /** Đang làm mới hay không. Với phân trang: `isRefetching && !isFetchingNextPage` — tải THÊM trang không phải "kéo làm mới". */
  refreshing?: boolean;
}): ReactElement<RefreshControlProps> | undefined {
  return useScreenRefreshControl({ offset: 0, onRefresh, refreshing, scrollable: true });
}
