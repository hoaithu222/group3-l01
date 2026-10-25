import { useState } from 'react';

/**
 * Cờ `refreshing` cho kéo-để-làm-mới — CHỈ bật khi NGƯỜI DÙNG kéo.
 *
 * ⚠️ Vì sao không `refreshing: query.isRefetching` như nhiều màn khác: `isRefetching` bật cả cho mọi lần làm mới NGẦM
 * (quay lại tab khi dữ liệu đã quá `staleTime`, `invalidateQueries` sau khi hoàn thành buổi/đăng ký…). Khi đó
 * `RefreshControl` hiện vòng quay ở đầu danh sách, ĐÈ lên tên thẻ môn đầu tiên dù không ai kéo (ảnh chụp thật ở tab
 * "Lộ trình"). Cờ riêng này bật lúc kéo và tắt khi CHÍNH lần tải đó xong — làm mới ngầm vẫn chạy, chỉ là không vẽ vòng.
 *
 * Trả `{ onRefresh, refreshing }` đúng khuôn tham số của `useListRefreshControl`.
 */
export function usePullRefresh(refetch: () => Promise<unknown>) {
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = () => {
    setRefreshing(true);
    void refetch().finally(() => setRefreshing(false));
  };

  return { onRefresh, refreshing };
}
