import { router } from 'expo-router';

import { Button } from '@/shared/ui/button';
import { useFeature } from '@/shell/capabilities';

import { contributionHref } from '../utils/contribution-routes';

export interface ContributionHeaderButtonProps {
  boardId: string;
  wsId: string;
}

/**
 * Lối vào "Báo cáo đóng góp" ở thanh tiêu đề màn Kanban (app.md §1) — MỌI thành viên thấy (báo cáo chỉ đọc), không cần quyền sửa bảng. Hiện qua khe
 * `@/shared/board-extensions` (`register.tsx`), nên `boards` không import feature này. Cờ phân hệ `project` tắt thì ẩn (đã biết chắc là tắt).
 */
export function ContributionHeaderButton({ boardId, wsId }: ContributionHeaderButtonProps) {
  const enabled = useFeature('project');
  if (enabled === false) return null;

  return (
    <Button
      accessibilityLabel="Báo cáo đóng góp"
      iconLeft="chart-1"
      iconOnly
      size="sm"
      variant="tertiary"
      onPress={() => router.push(contributionHref(wsId, boardId))}
    />
  );
}
