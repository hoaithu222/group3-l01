/**
 * DTO của p3-03 (chi tiết thẻ · checklist · đính kèm · bình luận) — VIẾT TAY vì công cụ sinh kiểu
 * OpenAPI (p0-09) chưa có.
 *
 * ✅ ĐÃ ĐỐI CHIẾU BE thật 2026-09-21 (be.md p3-03 §12.2 + §14, `modules/projects/services/*presenter.ts`):
 * các chỗ còn ghi "(giả định)" bên dưới nay là hợp đồng chính thức — `restore` và `deletedAt` luôn có ở
 * BE; `before/after` của activity theo từng loại (`{columnId, columnKind}` cho `MOVED`,
 * `{items:[{itemId,text,done}]}` cho `CHECKLIST_DONE|UNDONE`…) xem `activity-text.ts`. `description`/
 * `content` BE lưu đã escape `<>&` — giải mã một lần ở biên (`html-entities.ts`).
 */
import type { AssetKind } from '@/core/uploads/upload.types';

import type { BoardLabel, TaskAssignee, TaskCardDto } from './boards.types';
import type { TaskDependenciesDto } from './critical-path.types';
import type { TaskReviewsDto } from './reviews.types';

/** Mục checklist nhúng trong `Task.checklist[]` — `order` là số thực, chèn giữa hai mục = trung bình. */
export interface ChecklistItemDto {
  id: string;
  text: string;
  done: boolean;
  doneBy?: string | null;
  doneAt?: string | null;
  order: number;
}

/** `TaskDetailDto.myPermissions` — be.md §4 `{ edit, delete, comment, attach }`; `restore` là (giả định). */
export interface TaskPermissions {
  edit: boolean;
  delete: boolean;
  comment: boolean;
  attach: boolean;
  /** (giả định) chỉ có khi thẻ đã xoá; thiếu thì lấy theo `delete`. */
  restore?: boolean;
}

/** `GET /tasks/:id` — be.md §4: `TaskCardDto + { description, startDate, checklist[], createdBy, createdAt, labels[], myPermissions }`. */
export interface TaskDetailDto extends TaskCardDto {
  description: string | null;
  startDate: string | null;
  checklist: ChecklistItemDto[];
  createdBy: string;
  createdAt: string;
  labels: BoardLabel[];
  /** (giả định) có khi mở thẻ đã xoá bằng `?includeDeleted=true` (người có quyền khôi phục). */
  deletedAt?: string | null;
  /**
   * p4-04 (be.md — `TaskDetailDto.dependencies`, BE CHƯA trả): có thì làm `initialData` cho
   * `taskKeys.dependencies(taskId)`, thiếu thì màn tự gọi `GET /tasks/:id/dependencies`.
   */
  dependencies?: TaskDependenciesDto;
  /** p4-05: khối chấm chéo của thẻ — làm `initialData` cho `reviewKeys.task(taskId)` (điểm/nhận xét đã lọc theo người xem). */
  reviews?: TaskReviewsDto;
  myPermissions: TaskPermissions;
}

/** Thân `PATCH /tasks/:id` — be.md §3 `patchTaskSchema` (ngày là chuỗi ISO, `null` = xoá). */
export interface TaskPatchPayload {
  title?: string;
  description?: string | null;
  assigneeIds?: string[];
  labelIds?: string[];
  startDate?: string | null;
  dueDate?: string | null;
  storyPoints?: number | null;
  expectedVersion: number;
}

/** Trả về của mọi thao tác checklist — be.md §4 `{ item, checklistDone, checklistTotal, version }`. */
export interface ChecklistResult {
  item: ChecklistItemDto;
  checklistDone: number;
  checklistTotal: number;
  version: number;
}

/** `TaskWatchState` của BE (`core/constants/project.ts`): `AUTO_ON` do hệ thống ghi khi mình bình luận/được nhắc tên. */
export type TaskWatchState = 'AUTO_ON' | 'EXPLICIT_OFF' | 'EXPLICIT_ON';

/** `PUT|DELETE /tasks/:id/watch` → `{ watching, state }`; cũng là khối `me` của `GET /tasks/:id/watchers`. `state: null` = chưa chọn. */
export interface TaskWatchStatus {
  state: TaskWatchState | null;
  watching: boolean;
}

/** `IMPLICIT` = người làm/người tạo chưa có lựa chọn riêng (vẫn nhận thông báo bình luận/nhắc hạn). */
export interface TaskWatcher {
  state: TaskWatchState | 'IMPLICIT';
  user: { avatarUrl: string | null; id: string; name: string };
}

/** `GET /tasks/:id/watchers` — chỉ thành viên ACTIVE hiện tại, tối đa 200; `total` là số trong danh sách. */
export interface TaskWatchers {
  me: TaskWatchStatus;
  total: number;
  watchers: TaskWatcher[];
}

/** Thân `POST /tasks/:id/duplicate` (be `duplicateTaskSchema`): nhãn/mô tả/ngày/điểm luôn được chép; KHÔNG chép tệp, bình luận, phụ thuộc, trạng thái chấm. */
export interface DuplicateTaskPayload {
  /** Vắng ⇒ BE đặt "<tiêu đề gốc> (bản sao)". */
  title?: string;
  /** Vắng ⇒ cột của thẻ gốc (TODO/IN_PROGRESS), còn REVIEW/DONE ⇒ cột TODO đầu tiên. */
  columnId?: string;
  keepAssignees: boolean;
  keepChecklist: boolean;
  /** 8–64 ký tự: gửi lại cùng giá trị thì BE trả thẻ đã tạo (200) thay vì tạo thêm. */
  clientTaskId?: string;
}

/** `POST /tasks/:id/checklist/:itemId/convert` — `created: false` khi mục đã được chuyển trước đó (gọi lại/đua nhau). */
export interface ConvertChecklistResult {
  created: boolean;
  /** Trạng thái checklist của thẻ CHA sau khi mục bị gỡ. */
  source: { checklistDone: number; checklistTotal: number; taskId: string; version: number };
  task: TaskCardDto;
}

/** `AttachmentDto` (giả định — be.md chỉ ghi "kèm `thumbnailUrl` ký"): khoá gỡ là `assetId`. */
export interface AttachmentDto {
  assetId: string;
  originalName: string;
  mime: string;
  size: number | null;
  kind: AssetKind;
  thumbnailUrl: string | null;
  attachedBy: string;
  createdAt: string;
}

export interface AttachResult {
  attachment: AttachmentDto;
  attachmentCount: number;
}

/** `TASK_ACTIVITY_TYPES` của BE (`core/constants/project.ts`) — `string` mở để p4 thêm loại không làm app gãy. */
export type TaskActivityType =
  | 'ASSIGNED'
  | 'ATTACHMENT_ADDED'
  | 'ATTACHMENT_REMOVED'
  | 'CHECKLIST_ADDED'
  | 'CHECKLIST_DONE'
  | 'CHECKLIST_EDITED'
  | 'CHECKLIST_REMOVED'
  | 'CHECKLIST_UNDONE'
  | 'COMMENT_DELETED_BY_ADMIN'
  | 'CREATED'
  | 'DELETED'
  | 'DEPENDENCY_ADDED'
  | 'DEPENDENCY_REMOVED'
  | 'DESCRIPTION'
  | 'DUE_CHANGED'
  | 'LABELS'
  | 'MOVED'
  | 'POINTS'
  | 'RENAMED'
  | 'RESCHEDULED'
  | 'RESTORED'
  | 'REVIEW_REASSIGNED'
  | 'REVIEW_REQUESTED'
  | 'REVIEW_SUBMITTED'
  | 'REVIEW_WAIVED'
  | 'START_CHANGED'
  | 'UNASSIGNED';

export interface TaskActor {
  id: string;
  name: string;
  avatarUrl: string | null;
}

/** `TaskActivityDto` (giả định: `actor` đã nhúng; `before`/`after` là JSON tuỳ loại — xem `activity-text.ts`). */
export interface TaskActivityDto {
  id: string;
  taskId: string;
  type: string;
  actor: TaskActor | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  at: string;
}

/** Token nhắc tên `{ type: 'USER', targetId }` (p1-06); `label` là (giả định) — ảnh chụp tên lúc gửi. */
export interface TaskMention {
  type: 'USER';
  targetId: string;
  label?: string;
}

/** `TaskCommentDto` (giả định). `content` giữ marker `@{u:<id>}` như tin nhắn (p1-06). */
export interface TaskCommentDto {
  id: string;
  taskId: string;
  author: TaskActor;
  clientCommentId: string;
  content: string;
  mentions: TaskMention[];
  attachments: AttachmentDto[];
  attachmentCount: number;
  editedAt: string | null;
  deletedAt: string | null;
  version: number;
  createdAt: string;
}

export interface CreateCommentPayload {
  /** 8–64 ký tự (`createCommentSchema`), sinh MỘT LẦN lúc bấm Gửi và dùng lại khi Thử lại. */
  clientCommentId: string;
  content: string;
  mentions: { type: 'USER'; targetId: string }[];
  attachmentAssetIds: string[];
}

export interface PatchCommentPayload {
  content: string;
  mentions: { type: 'USER'; targetId: string }[];
  expectedVersion: number;
}

/** `GET /boards/:id/mentionables` → `[{ id, name, avatarUrl }]` ≤ 20. */
export type Mentionable = TaskAssignee;

/** Một trang cursor — BE trả `{ data: T[], meta: { nextCursor } }` (đã chuẩn hoá ở service). */
export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}

/** Payload `task:activity` (be.md §6) — hoặc bản ghi activity, hoặc `{ type: 'COMMENT', comment }`. */
export interface TaskActivityEvent {
  taskId: string;
  activity: TaskActivityDto | { type: 'COMMENT'; comment: TaskCommentDto };
}

/** Bình luận trong cache — thêm trạng thái CỤC BỘ cho bản đang gửi/lỗi (app.md §4 "Bình luận"). */
export interface TaskCommentView extends TaskCommentDto {
  localStatus?: 'failed' | 'sending';
  /** Giữ để "Thử lại" dùng lại đúng `clientCommentId` + nội dung. */
  localPayload?: CreateCommentPayload;
}
