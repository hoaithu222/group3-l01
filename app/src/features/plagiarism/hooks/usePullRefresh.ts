import { useState } from 'react';

/**
 * Cờ `refreshing` cho kéo-để-làm-mới — CHỈ bật khi NGƯỜI DÙNG kéo.
 *
 * ⚠️ Vì sao không `refreshing: query.isRefetching`: `useScanProgressSocket` `invalidate` danh sách/lượt quét ở MỖI nhịp
 * tiến độ ⇒ `isRefetching` bật tắt liên tục trong lúc quét, vòng quay kéo-để-làm-mới nhấp nháy ở đầu màn dù không ai kéo.
 * Cờ riêng này bật lúc kéo và tắt khi CHÍNH lần tải đó xong — làm mới ngầm vẫn chạy, chỉ là không vẽ vòng.
 *
 * ⚠️ Bản cục bộ: `features/roadmap` có hook cùng khuôn nhưng feature không import chéo nhau — ứng viên chuyển lên
 * `@/shared/hooks` (đã ghi vào báo cáo).
 */
export function usePullRefresh(refetch: () => Promise<unknown>) {
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = () => {
    setRefreshing(true);
    void refetch().finally(() => setRefreshing(false));
  };
  return { onRefresh, refreshing };
}
