import type { TaskAssignee, TaskCardDto } from '../api/boards.types';
import type { ChecklistItemDto, ChecklistResult, TaskDetailDto } from '../api/task-detail.types';
import { checklistCounts, sortChecklist } from './checklist';

/**
 * Các phép THUẦN trên bản chi tiết (`TaskDetailDto`) trong cache — không I/O, không React
 * (cùng khuôn `board-tasks-data.ts`): mọi phép trả đối tượng MỚI khi có đổi, trả CHÍNH đối tượng
 * cũ khi không đổi gì để React Query khỏi thông báo đổi cache oan.
 */

/** Trường của thẻ mini nằm trong chi tiết — để vá ngược sang cache bảng (`boardKeys.tasks`). */
export function cardOf(detail: TaskDetailDto): TaskCardDto {
  return {
    assignees: detail.assignees,
    attachmentCount: detail.attachmentCount,
    boardId: detail.boardId,
    checklistDone: detail.checklistDone,
    checklistTotal: detail.checklistTotal,
    columnId: detail.columnId,
    columnKind: detail.columnKind,
    blockedByCount: detail.blockedByCount,
    blockingCount: detail.blockingCount,
    commentCount: detail.commentCount,
    completedAt: detail.completedAt,
    dueDate: detail.dueDate,
    id: detail.id,
    isOverdue: detail.isOverdue,
    labelIds: detail.labelIds,
    position: detail.position,
    reviewState: detail.reviewState,
    storyPoints: detail.storyPoints,
    title: detail.title,
    updatedAt: detail.updatedAt,
    version: detail.version,
  };
}

/**
 * Bản GIỮ CHỖ dựng từ thẻ mini trong cache bảng → hiện ngay tiêu đề/chip trong lúc `GET /tasks/:id`
 * còn bay (app.md §4 "Mở"). Quyền để `false` hết: chưa biết thì không cho sửa (`isPlaceholderData`).
 */
export function detailFromCard(card: TaskCardDto): TaskDetailDto {
  return {
    ...card,
    checklist: [],
    createdAt: card.updatedAt,
    createdBy: '',
    description: null,
    labels: [],
    myPermissions: { attach: false, comment: false, delete: false, edit: false },
    startDate: null,
  };
}

/**
 * Trộn thẻ mini mới (từ `task:updated`) vào chi tiết. CŨ HƠN hoặc BẰNG thì bỏ — socket không
 * đảm bảo thứ tự, và sự kiện của CHÍNH MÌNH luôn tới sau khi HTTP đã ghi `version` mới.
 * Trả `null` khi bỏ để nơi gọi khỏi `setQueryData` oan.
 */
export function mergeCardIntoDetail(detail: TaskDetailDto, card: TaskCardDto): TaskDetailDto | null {
  if (card.version <= detail.version) return null;
  return { ...detail, ...card };
}

/**
 * Trường của `task:updated.changed` mà thẻ mini KHÔNG mang → phải tải lại chi tiết mới có. `dates` (p4-04: thẻ bị dời
 * lịch) đổi cả `startDate` — thẻ mini chỉ có `dueDate`.
 */
const DETAIL_ONLY_FIELDS = new Set(['attachments', 'checklist', 'dates', 'description', 'labels', 'startDate']);

export function needsDetailRefetch(changed: readonly string[] | undefined): boolean {
  return !changed || changed.some((field) => DETAIL_ONLY_FIELDS.has(field));
}

/** Optimistic: thay danh sách checklist và tính lại đếm cục bộ (PM2-02 phía client: "2/4 · 50 %" ngay). */
export function withChecklist(detail: TaskDetailDto, items: readonly ChecklistItemDto[]): TaskDetailDto {
  const counts = checklistCounts(items);
  return {
    ...detail,
    checklist: sortChecklist(items),
    checklistDone: counts.done,
    checklistTotal: counts.total,
  };
}

/**
 * Ghi kết quả của một thao tác checklist: mục (thêm/đổi) + `version` mới. Đếm TÍNH LẠI từ danh
 * sách cục bộ chứ không lấy `checklistDone/Total` của phản hồi: hai lần tick liên tiếp có hai phản
 * hồi tới lệch nhịp, lấy đếm của phản hồi thứ nhất sẽ làm "2/4" nhảy về "1/4" rồi lại "2/4". Đếm
 * chuẩn của server tới qua `task:updated` (thẻ mini) và lần tải lại chi tiết.
 */
export function applyChecklistResult(detail: TaskDetailDto, result: ChecklistResult): TaskDetailDto {
  const exists = detail.checklist.some((item) => item.id === result.item.id);
  const items = exists
    ? detail.checklist.map((item) => (item.id === result.item.id ? result.item : item))
    : [...detail.checklist, result.item];
  return { ...withChecklist(detail, items), version: Math.max(detail.version, result.version) };
}

export function applyChecklistRemoved(
  detail: TaskDetailDto,
  itemId: string,
  result: Pick<ChecklistResult, 'version'>,
): TaskDetailDto {
  const items = detail.checklist.filter((item) => item.id !== itemId);
  return { ...withChecklist(detail, items), version: Math.max(detail.version, result.version) };
}

/** Đầu vào optimistic của `PATCH /tasks/:id` — chỉ trường thẻ mini/chi tiết hiển thị được ngay. */
export interface OptimisticPatch {
  assignees?: TaskAssignee[];
  description?: string | null;
  dueDate?: string | null;
  labelIds?: string[];
  startDate?: string | null;
  storyPoints?: number | null;
  title?: string;
}

export function applyOptimisticPatch(detail: TaskDetailDto, patch: OptimisticPatch): TaskDetailDto {
  const next = { ...detail };
  if (patch.title !== undefined) next.title = patch.title;
  if (patch.description !== undefined) next.description = patch.description;
  if (patch.assignees !== undefined) next.assignees = patch.assignees;
  if (patch.labelIds !== undefined) {
    next.labelIds = patch.labelIds;
    next.labels = detail.labels.filter((label) => patch.labelIds?.includes(label.id));
  }
  if (patch.startDate !== undefined) next.startDate = patch.startDate;
  if (patch.dueDate !== undefined) {
    next.dueDate = patch.dueDate;
    next.isOverdue =
      patch.dueDate !== null && next.columnKind !== 'DONE' && new Date(patch.dueDate).getTime() < Date.now();
  }
  if (patch.storyPoints !== undefined) next.storyPoints = patch.storyPoints;
  return next;
}
