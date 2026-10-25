import { router } from 'expo-router';

import { useFeature } from '@/shell/capabilities';
import { useRefetchOnFocus } from '@/shared/hooks/useRefetchOnFocus';
import { Card } from '@/shared/ui/card';
import { Icon } from '@/shared/ui/icon';
import { IconTile } from '@/shared/ui/icon-tile';
import { ListItem } from '@/shared/ui/list';

import { useBoards } from '../queries/boards.queries';
import { useWorkspaceBoardAccess } from '../queries/workspace-access.queries';
import { boardListHref } from '../utils/board-routes';

/**
 * Mục "Việc" của hub nhóm (`app.md` §1 "Điểm vào") — TỰ CHỨA: chỉ nhận `wsId`,
 * tự lấy cờ phân hệ và số bảng. MỘT dòng bấm được (icon + tên + số bảng + mũi tên), không còn cặp nút [Tạo][Xem]:
 * màn danh sách bảng đã có nút "+" ở thanh tiêu đề và nút "Tạo bảng" ở trạng thái rỗng (quyền OWNER/ADMIN), nên cùng một việc
 * không cần thêm lối vào thứ ba ở hub. Điều phối viên gắn nó vào
 * `WorkspaceOverviewScreen`:
 *
 * ```tsx
 * import { BoardsHubCard } from '@/features/boards';
 * <BoardsHubCard wsId={wsId} />
 * ```
 *
 * Ẩn hẳn (trả `null`) khi cờ `project` tắt HOẶC chưa biết (`undefined` = đang tải
 * capabilities): thà hiện muộn còn hơn hiện rồi biến mất, và cờ tắt là "phân hệ
 * chưa bật cho cả hệ thống" nên không được bày lối vào (README phase 3 §5).
 */
export function BoardsHubCard({ wsId }: { wsId: string }) {
  const enabled = useFeature('project');
  const boards = useBoards(enabled ? wsId : undefined, false);
  // Thẻ nằm ở Tổng quan nhóm (gốc stack, vẫn mounted) — quay lại từ bảng thì số bảng/thẻ theo bản mới nếu đã cũ.
  useRefetchOnFocus(boards, enabled === true);
  const access = useWorkspaceBoardAccess(enabled ? wsId : '');

  // Khách không có quyền đọc bảng (BE trả 404) — không bày lối vào (p3-04, be.md §6).
  if (!enabled || access.data?.myRole === 'GUEST') return null;

  const summary =
    boards.data === undefined ? 'Theo dõi công việc của nhóm trên bảng Kanban' : `${boards.data.length} bảng đang dùng`;

  return (
    <Card>
      <ListItem
        className="items-center"
        description={summary}
        emphasis="title"
        label="Việc"
        leading={<IconTile name="checkmark-square" tone="success" />}
        trailing={<Icon color="fg-2" name="arrow-right-small" size="sm" />}
        onPress={() => router.push(boardListHref(wsId))}
      />
    </Card>
  );
}
