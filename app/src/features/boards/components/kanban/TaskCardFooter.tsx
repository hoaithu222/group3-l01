import { Text, View } from 'react-native';

import { AvatarGroup } from '@/shared/ui/avatar-group';
import { Icon, type IconName } from '@/shared/ui/icon';

import type { TaskCardDto } from '../../api/boards.types';
import { checklistLabel, dueLabel, MAX_CARD_ASSIGNEES } from '../../utils/task-format';

/** Một mẩu "icon + số" ở hàng dưới của thẻ (điểm · bình luận · tệp). */
function Meta({ icon, text }: { icon: IconName; text: string }) {
  return (
    <View className="flex-row items-center gap-3xs">
      <Icon color="fg-2" name={icon} size={16} />
      <Text className="text-caption-sm text-fg-2" maxFontSizeMultiplier={1.3}>
        {text}
      </Text>
    </View>
  );
}

/**
 * Hàng dưới của thẻ: hạn · checklist · điểm · bình luận · tệp · người làm. Ẩn hẳn khi thẻ không có gì
 * để hiện (thẻ mới tạo chỉ có tiêu đề).
 *
 * Quá hạn = icon + chữ "Quá hạn" + màu `error` (`app.md` §7: không chỉ màu đỏ).
 *
 * Người làm = `AvatarGroup` (chồng mép, tối đa `MAX_CARD_ASSIGNEES`, phần dư "+N") — cùng khuôn "facepile" của cả app thay cho
 * hàng avatar rời. Điểm/bình luận/tệp đính kèm (đã có trong `TaskCardDto`, trước đây không hiện) chỉ vẽ khi > 0; con số của
 * chúng cũng nằm trong nhãn trợ năng của thẻ (`taskAccessibilityLabel`).
 */
export function TaskCardFooter({ task }: { task: TaskCardDto }) {
  const due = dueLabel(task);
  const checklist = checklistLabel(task);
  // `typeof` chứ không `!== null`: bản vá từ socket có thể thiếu trường — đừng vẽ "undefined điểm".
  const hasPoints = typeof task.storyPoints === 'number';
  const hasMeta = hasPoints || task.commentCount > 0 || task.attachmentCount > 0;

  if (!due && !checklist && !hasMeta && task.assignees.length === 0) return null;

  return (
    <View className="flex-row items-center justify-between gap-xs">
      <View className="flex-1 flex-row flex-wrap items-center gap-sm">
        {due ? (
          <View className="flex-row items-center gap-3xs">
            <Icon
              color={task.isOverdue ? 'error' : 'fg-2'}
              name={task.isOverdue ? 'alert-warning' : 'calendar'}
              size={16}
            />
            <Text
              className={
                task.isOverdue
                  ? 'text-caption-sm font-semibold text-error'
                  : 'text-caption-sm text-fg-2'
              }
              maxFontSizeMultiplier={1.3}
            >
              {due}
            </Text>
          </View>
        ) : null}
        {checklist ? (
          <View
            accessibilityLabel={`Checklist ${checklist}`}
            className="flex-row items-center gap-3xs"
          >
            <Icon color="fg-2" name="checkmark-square" size={16} />
            <Text className="text-caption-sm text-fg-2" maxFontSizeMultiplier={1.3}>
              {checklist}
            </Text>
          </View>
        ) : null}
        {hasPoints ? <Meta icon="star" text={`${String(task.storyPoints)} điểm`} /> : null}
        {task.commentCount > 0 ? <Meta icon="chat-bubble" text={String(task.commentCount)} /> : null}
        {task.attachmentCount > 0 ? (
          <Meta icon="file-2" text={String(task.attachmentCount)} />
        ) : null}
      </View>

      {task.assignees.length > 0 ? (
        <AvatarGroup max={MAX_CARD_ASSIGNEES} size="xs" users={task.assignees} />
      ) : null}
    </View>
  );
}
