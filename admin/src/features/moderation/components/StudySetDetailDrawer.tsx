import { memo } from 'react';

import { Drawer } from '@/shared/ui';

import StudySetPanel from './targets/StudySetPanel';

export interface StudySetDetailDrawerProps {
  /** `null` = đóng (đồng bộ với URL `?setId=`). */
  setId: string | null;
  /** `moderation:update` — ẩn/khôi phục. */
  canUpdate: boolean;
  onClose: () => void;
}

/**
 * Ngăn kéo chi tiết bộ học của tab `content` (admin.md p4-01 §1): cùng khối với trang chi tiết báo cáo (`StudySetPanel`) — ngữ cảnh, nội dung
 * (CHỈ bộ PUBLIC), ẩn/khôi phục — để xử lý được ngay từ danh sách mà không cần có báo cáo mở nào.
 */
const StudySetDetailDrawer = memo(function StudySetDetailDrawer({
  setId,
  canUpdate,
  onClose,
}: StudySetDetailDrawerProps) {
  return (
    <Drawer
      open={setId !== null}
      side="right"
      size="xl"
      title="Bộ học bị báo cáo"
      onOpenChange={(next) => !next && onClose()}
    >
      {setId !== null ? <StudySetPanel key={setId} canUpdate={canUpdate} setId={setId} /> : null}
    </Drawer>
  );
});

export default StudySetDetailDrawer;
