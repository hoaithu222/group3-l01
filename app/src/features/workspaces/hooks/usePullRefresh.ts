import { useState } from 'react';

/**
 * Cờ `refreshing` cho kéo-để-làm-mới của danh sách nhóm — CHỈ bật khi NGƯỜI DÙNG kéo.
 *
 * ⚠️ Vì sao không `refreshing={isRefetching}` như bản trước: `isRefetching` bật cả cho mọi lần tải lại NGẦM — quay lại tab
 * "Nhóm" khi dữ liệu đã cũ (`useRefetchOnFocus`), `invalidateQueries` từ socket `workspace:*` (`useWorkspaceSocket`), tạo
 * nhóm xong… Khi đó vòng quay tự hiện ở đầu danh sách, đè lên thẻ đầu dù không ai kéo. Cờ riêng bật lúc kéo, tắt khi CHÍNH
 * lần tải đó xong — tải ngầm vẫn chạy, chỉ là không vẽ vòng.
 *
 * ⚠️ Bản thứ BA của cùng hook (`roadmap`, `plagiarism` có bản riêng) — nên đưa lên `@/shared/hooks` (đã ghi vào báo cáo);
 * ⛔ không import chéo feature để dùng chung.
 */
export function usePullRefresh(refetch: () => Promise<unknown>) {
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = () => {
    setRefreshing(true);
    void refetch().finally(() => setRefreshing(false));
  };

  return { onRefresh, refreshing };
}
