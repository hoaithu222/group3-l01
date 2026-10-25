import { formatDate } from '@/shared/utils/format/date.utils';

import type { TaskAssignee, TaskCardDto } from '../api/boards.types';

/** Số avatar hiện trên thẻ; phần còn lại gộp thành "+N" (`app.md` §2 `TaskCardMini`). */
export const MAX_CARD_ASSIGNEES = 3;

export function splitAssignees(assignees: readonly TaskAssignee[]): {
  overflow: number;
  visible: TaskAssignee[];
} {
  return {
    overflow: Math.max(0, assignees.length - MAX_CARD_ASSIGNEES),
    visible: assignees.slice(0, MAX_CARD_ASSIGNEES),
  };
}

/** "2/4" — `null` khi thẻ không có checklist (đừng vẽ "0/0"). */
export function checklistLabel(task: Pick<TaskCardDto, 'checklistDone' | 'checklistTotal'>): string | null {
  return task.checklistTotal > 0 ? `${task.checklistDone}/${task.checklistTotal}` : null;
}

/**
 * Nhãn hạn: quá hạn thì có CHỮ "Quá hạn" đi kèm ngày — không chỉ màu đỏ
 * (`app.md` §7 "Quá hạn: icon + chữ").
 */
export function dueLabel(task: Pick<TaskCardDto, 'dueDate' | 'isOverdue'>): string | null {
  if (!task.dueDate) return null;
  const date = formatDate(task.dueDate);
  return task.isOverdue ? `Quá hạn · ${date}` : date;
}

/** Câu đọc cho trình đọc màn hình — gộp mọi thứ chỉ-nhìn-thấy-bằng-mắt của thẻ. */
export function taskAccessibilityLabel(task: TaskCardDto, columnTitle: string): string {
  const parts = [task.title, `Cột ${columnTitle}`];
  const due = dueLabel(task);
  if (due) parts.push(`Hạn ${due}`);
  const checklist = checklistLabel(task);
  if (checklist) parts.push(`Checklist ${checklist}`);
  if (task.blockedByCount > 0) parts.push(`Bị chặn bởi ${task.blockedByCount} thẻ chưa xong`);
  if (task.blockingCount > 0) parts.push(`Đang chặn ${task.blockingCount} thẻ`);
  if (task.assignees.length > 0) {
    parts.push(`Người làm ${task.assignees.map((assignee) => assignee.name).join(', ')}`);
  }
  // Ba mẩu "icon + số" ở hàng dưới của thẻ (`TaskCardFooter`) — người dùng trình đọc màn hình không thấy icon.
  if (typeof task.storyPoints === 'number') parts.push(`${task.storyPoints} điểm`);
  if (task.commentCount > 0) parts.push(`${task.commentCount} bình luận`);
  if (task.attachmentCount > 0) parts.push(`${task.attachmentCount} tệp đính kèm`);
  return parts.join('. ');
}

/** % thẻ đã hoàn thành của bảng — 0 khi bảng chưa có thẻ (đừng chia cho 0 ra `NaN%`). */
export function percentDone(board: { doneCount: number; taskCount: number }): number {
  if (board.taskCount <= 0) return 0;
  return Math.min(100, Math.round((board.doneCount / board.taskCount) * 100));
}
