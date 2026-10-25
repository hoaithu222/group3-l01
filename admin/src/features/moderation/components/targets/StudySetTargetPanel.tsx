import { memo } from 'react';

import type { AdminReportGroup } from '../../types/moderation.types';
import StudySetPanel from './StudySetPanel';

export interface StudySetTargetPanelProps {
  /** Nhóm báo cáo có `targetType = STUDY_SET` — `targetId` là id bộ học. */
  group: AdminReportGroup;
  /** `moderation:update` — ẩn/khôi phục. */
  canUpdate: boolean;
}

/**
 * Phần riêng của báo cáo `STUDY_SET` trên trang chi tiết (admin.md p4-01 §2.1) — nội dung thật ở
 * `StudySetPanel` (dùng chung với ngăn kéo của tab `content`).
 */
const StudySetTargetPanel = memo(function StudySetTargetPanel({
  group,
  canUpdate,
}: StudySetTargetPanelProps) {
  return <StudySetPanel canUpdate={canUpdate} setId={group.targetId} />;
});

export default StudySetTargetPanel;
