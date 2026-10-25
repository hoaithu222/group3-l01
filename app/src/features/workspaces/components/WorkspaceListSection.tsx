import { Reveal } from '@/shared/ui/motion';
import { Section } from '@/shared/ui/section';
import type { IconName } from '@/shared/ui/icon';

import type { WorkspaceListItem } from '../api';
import { WorkspaceCard } from './WorkspaceCard';
import { WorkspaceGrid } from './WorkspaceGrid';

export interface WorkspaceListSectionProps {
  icon?: IconName;
  items: readonly WorkspaceListItem[];
  /** Thẻ đã hiện ở các khối PHÍA TRÊN — nhịp "hiện dần" của khối này nối tiếp thay vì bắt đầu lại từ 0. */
  revealOffset?: number;
  title: string;
  onOpen: (workspace: WorkspaceListItem) => void;
}

/**
 * Một khối của danh sách nhóm ("Đang chờ duyệt" · "Yêu thích" · "Tất cả nhóm" — `groupWorkspaces`): tiêu đề kèm SỐ thẻ
 * (mốc `header` cho trình đọc màn hình nhảy giữa các khối) rồi lưới thẻ co giãn theo bậc màn (`WorkspaceGrid`).
 *
 * Thẻ được `Reveal` (danh sách tự `.map()`, không ảo hoá — ⛔ đừng mang sang hàng `FlashList`); nhịp trễ dừng ở bước 6 nên
 * danh sách 50 nhóm không thành màn trình diễn. `grow` trên lớp bọc: thẻ cùng hàng (2–3 cột) cao bằng nhau.
 */
export function WorkspaceListSection({
  icon,
  items,
  revealOffset = 0,
  title,
  onOpen,
}: WorkspaceListSectionProps) {
  return (
    <Section icon={icon} title={`${title} (${items.length})`}>
      <WorkspaceGrid
        items={items}
        keyOf={(workspace) => workspace.id}
        renderItem={(workspace, index) => (
          <Reveal className="grow" index={Math.min(revealOffset + index, 6)}>
            <WorkspaceCard workspace={workspace} onPress={onOpen} />
          </Reveal>
        )}
      />
    </Section>
  );
}
