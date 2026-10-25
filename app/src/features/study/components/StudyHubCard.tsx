import { router } from 'expo-router';

import { useFeature } from '@/shell/capabilities';
import { Card } from '@/shared/ui/card';
import { Icon } from '@/shared/ui/icon';
import { IconTile } from '@/shared/ui/icon-tile';
import { ListItem } from '@/shared/ui/list';

import { useWorkspaceStudyAccess } from '../queries/workspace-access.queries';
import { newSetHref, workspaceStudyHref } from '../utils/study-routes';

/**
 * Mục "Học" của hub nhóm (README p4-01 §2 "Nơi đặt Học", app.md §1) — TỰ CHỨA: chỉ nhận `wsId`, tự lấy cờ phân hệ và
 * vai trò. Route hub (`app/(app)/workspaces/[wsId]/index.tsx`) gắn nó qua slot `extraSections` (feature `workspaces`
 * không import chéo feature khác).
 *
 * Ẩn hẳn khi cờ `study` tắt/chưa biết (thà hiện muộn còn hơn hiện rồi biến mất) và với KHÁCH — BE trả 404 mọi bộ học
 * của nhóm cho khách (README §6), nên không bày lối vào. Nhóm ARCHIVED chỉ xem (không có nút Tạo).
 *
 * ⚠️ Bố cục: MỘT hàng bấm được có mũi tên ("Bộ học của nhóm" → danh sách) kèm tối đa MỘT hành động phụ ("Tạo bộ học cho
 * nhóm", cũng là một hàng) — trước đây là một câu mô tả kèm hai nút "Tạo" + "Xem" chen cạnh nhau trong thẻ.
 */
export function StudyHubCard({ wsId }: { wsId: string }) {
  const enabled = useFeature('study');
  const access = useWorkspaceStudyAccess(wsId, enabled === true);

  if (enabled !== true || access.data?.myRole === 'GUEST') return null;

  const canCreate = access.data?.status === 'ACTIVE' && access.data.myRole !== undefined;

  return (
    <Card title="Học">
      <ListItem
        className="items-center"
        description="Bộ thẻ ghi nhớ và câu hỏi để cả nhóm cùng ôn"
        divider={canCreate}
        emphasis="title"
        label="Bộ học của nhóm"
        // `book` + `success` = bản sắc phân hệ Học (cùng ô "Học" ở Trang chủ, banner của `WorkspaceStudyScreen`); hàng dưới đổi
        // sang `brand` cho hai ô cạnh nhau khác màu. Mũi tên `fg-2` (không `fg-3` 2.96:1): nó là dấu hiệu "bấm được".
        leading={<IconTile name="book" tone="success" />}
        trailing={<Icon color="fg-2" name="arrow-right-small" size="sm" />}
        onPress={() => router.push(workspaceStudyHref(wsId))}
      />
      {canCreate ? (
        <ListItem
          className="items-center"
          emphasis="title"
          label="Tạo bộ học cho nhóm"
          leading={<IconTile name="add" tone="brand" />}
          onPress={() => router.push(newSetHref(wsId))}
        />
      ) : null}
    </Card>
  );
}
