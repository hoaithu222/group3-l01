import { View } from 'react-native';

import { useBreakpoint } from '@/shared/theme';
import { Divider } from '@/shared/ui/divider';

import type { BoardLabel } from '../../api/boards.types';
import type { TaskDetailDto } from '../../api/task-detail.types';
import type { TaskAccess } from '../../utils/task-permissions';
import { ActivityFeed } from './ActivityFeed';
import { AttachmentsSection } from './AttachmentsSection';
import { ChecklistSection } from './ChecklistSection';
import { DependencySection } from './DependencySection';
import { DescriptionSection } from './DescriptionSection';
import { ReviewSection } from './ReviewSection';
import { TaskHeader } from './TaskHeader';
import { TaskPropertyRow, type PropertyKind } from './TaskPropertyRow';
import { TaskWatchRow } from './TaskWatchRow';

export interface TaskDetailSectionsProps {
  access: TaskAccess;
  boardId: string;
  /** Được chuyển việc nhỏ thành thẻ: sửa thẻ cha (`myPermissions.edit`) VÀ tạo thẻ trên bảng (`TASK_CREATE`) VÀ online — nơi gọi ghép. */
  canConvert: boolean;
  columnTitle?: string;
  currentUserId: string;
  detail: TaskDetailDto;
  isAdmin: boolean;
  labels: ReadonlyMap<string, BoardLabel>;
  /** Bản giữ chỗ dựng từ thẻ mini — mô tả/checklist/đính kèm chưa có thật. */
  placeholder: boolean;
  taskId: string;
  wsId: string;
  onEditDescription: () => void;
  onOpenColumn: () => void;
  onOpenProperty: (kind: PropertyKind) => void;
  /** Mở thẻ ở đầu kia của một phụ thuộc (p4-04). */
  onOpenTask: (taskId: string) => void;
  onSaveTitle: (title: string) => Promise<string | null>;
}

/**
 * Bố cục các khối của màn chi tiết (app.md §7 "Tablet: 2 cột"). Điện thoại: MỘT cột theo thứ tự tiêu đề → theo dõi (p3-03 P1) →
 * thuộc tính → mô tả → việc nhỏ → phụ thuộc → chấm chéo (p4-05) → tệp → trao đổi. Tablet: cột TRÁI là nội dung (tiêu đề, mô tả, việc nhỏ, phụ thuộc, chấm chéo, tệp),
 * cột PHẢI là thuộc tính + trao đổi. Dùng `useBreakpoint` vì hai bố cục là hai CÂY khác nhau (không chỉ đổi
 * class): thứ tự khối khác hẳn giữa hai chế độ.
 */
export function TaskDetailSections(props: TaskDetailSectionsProps) {
  const { access, boardId, detail, placeholder, taskId } = props;
  const { isTablet } = useBreakpoint();

  const header = (
    <TaskHeader
      canEdit={access.canEdit}
      columnTitle={props.columnTitle}
      title={detail.title}
      onOpenColumn={props.onOpenColumn}
      onSaveTitle={props.onSaveTitle}
    />
  );
  // p3-03 P1: theo dõi thẻ — không vẽ cho bản giữ chỗ (chưa biết thẻ có thật) và thẻ đã xoá (chỉ xem). Tự lo tải/lỗi bên trong.
  const watch = placeholder || access.deleted ? null : <TaskWatchRow taskId={taskId} />;
  const properties = (
    <TaskPropertyRow
      canEdit={access.canEdit}
      detail={detail}
      labels={props.labels}
      onOpen={props.onOpenProperty}
    />
  );
  const description = (
    <DescriptionSection
      canEdit={access.canEdit}
      description={detail.description}
      loading={placeholder}
      onEdit={props.onEditDescription}
    />
  );
  const checklist = placeholder ? null : (
    <ChecklistSection
      boardId={boardId}
      canConvert={props.canConvert}
      canEdit={access.canEdit}
      checklist={detail.checklist}
      done={detail.checklistDone}
      taskId={taskId}
      total={detail.checklistTotal}
    />
  );
  const dependencies = placeholder ? null : (
    <DependencySection
      boardId={boardId}
      canEdit={access.canEdit}
      taskId={taskId}
      onOpenTask={props.onOpenTask}
    />
  );
  // p4-05: khối tự ẩn khi bảng không bật chấm chéo và thẻ chưa từng có lượt. Chỉ-đọc khi offline/lưu trữ/thẻ đã xoá (BE vẫn quyết).
  const review = placeholder ? null : (
    <ReviewSection
      assigneeIds={detail.assignees.map((assignee) => assignee.id)}
      boardId={boardId}
      initial={detail.reviews}
      readOnly={access.readOnlyReason === 'archived' || access.readOnlyReason === 'deleted' || access.readOnlyReason === 'offline'}
      taskId={taskId}
      wsId={props.wsId}
    />
  );
  const attachments = placeholder ? null : (
    <AttachmentsSection
      attachedCount={detail.attachmentCount}
      boardId={boardId}
      canAttach={access.canAttach}
      currentUserId={props.currentUserId}
      isAdmin={props.isAdmin}
      taskId={taskId}
    />
  );
  const feed = (
    <ActivityFeed
      boardId={boardId}
      currentUserId={props.currentUserId}
      detail={detail}
      isAdmin={props.isAdmin}
      taskId={taskId}
    />
  );

  if (isTablet) {
    return (
      <View className="flex-row gap-xl">
        <View className="flex-[3] gap-md">
          {header}
          {watch}
          {description}
          {checklist}
          {dependencies}
          {review}
          {attachments}
        </View>
        <View className="flex-[2] gap-md">
          {properties}
          <Divider />
          {feed}
        </View>
      </View>
    );
  }

  return (
    <View className="gap-md">
      {header}
      {watch}
      {properties}
      <Divider />
      {description}
      {checklist}
      {dependencies}
      {review}
      {attachments}
      <Divider />
      {feed}
    </View>
  );
}
