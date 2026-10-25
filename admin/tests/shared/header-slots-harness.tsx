/**
 * HeaderSlotsHarness — dựng ĐÍCH PORTAL của thanh header cho test render page RIÊNG LẺ.
 *
 * Page đưa tiêu đề · tab · nút quay lại · action lên thanh header bằng `<PageHeader>`
 * (portal vào ba slot của `<Header>`, xem `page-header/page-header-slots.tsx`). Test
 * render page KHÔNG qua `BackgroundLayout` thì không có provider/slot nào ⇒
 * `<PageHeader>` im lặng không vẽ gì, và mọi truy vấn tìm tiêu đề / chip tab / nút
 * quay lại / action trên header đều trượt.
 *
 * Harness dựng ĐÚNG cấu trúc thật (provider bọc CẢ thanh header lẫn nội dung page)
 * nhưng thanh chỉ có BA SLOT RỖNG — không logo, không khối user, không nút icon toàn
 * cục. Nhờ vậy bọc harness vào helper render dùng chung của cả một feature cũng không
 * làm lệch những truy vấn `getAllByRole('button' | 'link')` sẵn có.
 *
 *   renderAt(<HeaderSlotsHarness><RecruiterOpsPage /></HeaderSlotsHarness>, '/recruiter')
 *
 * ⛔ Test đi qua cây `routes` THẬT (`createMemoryRouter(routes, …)`) đã có sẵn shell
 *    (`AppShellLayout` → `BackgroundLayout`) — KHÔNG bọc thêm, nếu không sẽ có HAI
 *    thanh header lồng nhau.
 */
import type { ReactNode } from 'react';

import { HeaderSlotsProvider } from '@/shared/widgets/header';
import { useHeaderSlotRef } from '@/shared/widgets/header/page-header/page-header-context';

/** Thanh header tối giản — ba đích portal, đúng thứ tự `start` · `title` · `end`. */
function HeaderSlotTargets() {
  const startRef = useHeaderSlotRef('start');
  const titleRef = useHeaderSlotRef('title');
  const endRef = useHeaderSlotRef('end');

  return (
    <header>
      <div ref={startRef} />
      <div ref={titleRef} />
      <div ref={endRef} />
    </header>
  );
}

export function HeaderSlotsHarness({ children }: { children: ReactNode }) {
  return (
    <HeaderSlotsProvider>
      <HeaderSlotTargets />
      {children}
    </HeaderSlotsProvider>
  );
}
