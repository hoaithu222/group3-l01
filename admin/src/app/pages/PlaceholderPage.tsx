import { memo, useMemo } from 'react';
import { useMatches } from 'react-router-dom';

import type { RouteHandle } from '@/app/router/modules/types';
import { EmptyState, PageShell } from '@/shared/ui';

/**
 * Trang mặc định cho phân hệ chưa có UI thật.
 *
 * Khai `page: { lazy: placeholderPage }` trong registry để route tồn tại ngay
 * từ đầu — Dock, breadcrumb và phân quyền chạy được trong lúc màn hình thật
 * còn đang làm. Xong rồi chỉ đổi `page.lazy`, KHÔNG phải xoá entry.
 *
 * ⛔ Đọc tên phân hệ qua `useMatches()` (route `handle`), KHÔNG import
 * `module-registry.ts` trực tiếp — trang này được chính registry lazy-load
 * (qua `module-defaults.ts`), nên import ngược lại là khép vòng
 * (`npm run check:cycles` chặn cứng). Xem JSDoc `RouteHandle`.
 */
const PlaceholderPage = memo(function PlaceholderPage() {
  const matches = useMatches();

  const title = useMemo(() => {
    for (let i = matches.length - 1; i >= 0; i -= 1) {
      const handle = matches[i].handle as RouteHandle | undefined;
      if (handle?.title) return handle.title;
    }
    return 'Phân hệ';
  }, [matches]);

  return (
    <PageShell variant="center">
      <EmptyState
        description="Phân hệ đang trong giai đoạn phát triển. Vui lòng quay lại sau."
        icon="cube-bold"
        title={title}
      />
    </PageShell>
  );
});

export default PlaceholderPage;
