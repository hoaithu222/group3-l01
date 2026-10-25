/**
 * DTO của phân hệ Bảng công việc (p3-02) — VIẾT TAY theo `be.md` §2–§6 vì công
 * cụ sinh kiểu OpenAPI (p0-09) chưa có. ⚠️ Khi BE `modules/projects/dtos/` đổi
 * tên trường thì CHỈ sửa file này và `boards.service.ts` (`feature-structure.md`).
 */

/** Loại cột — logic XP/review/đóng góp dựa vào `kind`, KHÔNG dựa vào tên cột (README §2). */
export type ColumnKind = 'DONE' | 'IN_PROGRESS' | 'REVIEW' | 'TODO';

export type ReviewState = 'APPROVED' | 'CHANGES_REQUESTED' | 'NONE' | 'PENDING';

export interface BoardColumn {
  id: string;
  title: string;
  kind: ColumnKind;
  order: number;
  wipLimit: number | null;
}

export interface BoardSummaryColumn {
  id: string;
  title: string;
  kind: ColumnKind;
  taskCount: number;
}

/** `GET /workspaces/:workspaceId/boards` — be.md §4. */
export interface BoardSummary {
  id: string;
  name: string;
  columns: BoardSummaryColumn[];
  taskCount: number;
  doneCount: number;
  updatedAt: string;
}

export interface BoardLabel {
  id: string;
  boardId?: string;
  name: string;
  /** Khoá token màu (`"blue"`, `"orange"`…) — KHÔNG hex tự do (be.md §2). */
  color: string;
}

export interface BoardDto {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  columns: BoardColumn[];
  archivedAt: string | null;
  version: number;
  createdAt?: string;
  updatedAt?: string;
}

/** `GET /boards/:id` = `BoardDto & { labels[], myPermissions }` — be.md §4. */
export interface BoardDetail extends BoardDto {
  labels: BoardLabel[];
  /** Mảng khoá quyền BE trả (be.md §4); cách đọc ở `utils/board-permissions.ts`. */
  myPermissions: string[];
}

export interface TaskAssignee {
  id: string;
  name: string;
  avatarUrl: string | null;
}

/** `TaskCardDto` — be.md §4 (dòng cuối bảng endpoint). */
export interface TaskCardDto {
  id: string;
  boardId: string;
  columnId: string;
  columnKind: ColumnKind;
  /** Khoá fractional index — sắp bằng so sánh CHUỖI thô, ⛔ không `localeCompare`. */
  position: string;
  title: string;
  assignees: TaskAssignee[];
  labelIds: string[];
  dueDate: string | null;
  isOverdue: boolean;
  storyPoints: number | null;
  checklistDone: number;
  checklistTotal: number;
  attachmentCount: number;
  commentCount: number;
  reviewState: ReviewState;
  /**
   * p4-05: tiến độ lượt chấm ĐANG MỞ ("Chờ duyệt 1/2") — BE chỉ gửi ở `GET /boards/:id/tasks` và `task:updated { changed: ["review"] }`
   * khi `reviewState = PENDING`; vắng ở các bản dựng khác (chi tiết thẻ, bản gộp) ⇒ reducer GIỮ giá trị đã có (`apply-task-event.ts`).
   */
  review?: { approvedCount: number; requiredReviews: number } | null;
  completedAt: string | null;
  /** p4-04: số thẻ TRƯỚC chưa xong (chưa xoá) — chip "Bị chặn". BE tính sẵn, thẻ mini không phải truy vấn đồ thị. */
  blockedByCount: number;
  /** p4-04: số thẻ SAU chưa xong đang chờ thẻ này — chip "Chặn N". */
  blockingCount: number;
  version: number;
  updatedAt: string;
}

/** Một cột trong phản hồi `GET /boards/:id/tasks` (be.md §4). */
export interface BoardTasksColumnResponse {
  columnId: string;
  tasks: TaskCardDto[];
  hasMore: boolean;
}

/**
 * Dạng CACHE của danh sách thẻ (app.md §4): đã chuẩn hoá theo `columnId` và
 * đã sắp theo `position`. Service dựng từ `{ columns: [...] }` của server.
 */
export interface BoardTasksData {
  columns: Record<string, TaskCardDto[]>;
  hasMore: Record<string, boolean>;
}

/** Bộ lọc — gửi lên server (query key đổi theo nó); "Của tôi" = `assigneeId: 'me'`. */
export interface BoardFilter {
  /** `'me'` hoặc id người làm. */
  assigneeId?: string;
  labelId?: string;
  overdue?: boolean;
  /** Đã trim; server chỉ nhận ≥ 2 ký tự (`listTasksQuery.q`). */
  q?: string;
}

export interface ColumnInput {
  /** Thiếu = cột mới (be.md §3 `columnSchema`). */
  id?: string;
  title: string;
  kind: ColumnKind;
  wipLimit?: number | null;
}

export interface CreateBoardPayload {
  name: string;
  description?: string;
  columns?: ColumnInput[];
}

/**
 * `GET /board-templates` (p3-02 P1, dữ liệu tĩnh của BE `board-templates.ts`): mẫu bảng dựng sẵn. `code` khai `string` mở — BE thêm
 * mẫu mới thì app vẫn liệt kê và gửi lại đúng mã đó (BE mới là nơi kiểm mã, sai → `VAL_001`).
 */
export interface BoardTemplate {
  code: string;
  columns: { kind: ColumnKind; title: string; wipLimit: number | null }[];
  description: string;
  labels: { color: string; name: string }[];
  name: string;
}

/** Thân `POST /workspaces/:id/boards/from-template` — `name`/`description` vắng thì BE lấy của mẫu. */
export interface CreateBoardFromTemplatePayload {
  template: string;
  name?: string;
  description?: string;
}

/** Thân `POST /boards/:id/duplicate` — mặc định BE: `includeLabels`/`includeReviewConfig` = true, `includeTasks` = false. */
export interface DuplicateBoardPayload {
  name?: string;
  includeLabels?: boolean;
  includeReviewConfig?: boolean;
  includeTasks?: boolean;
}

/** Phản hồi tạo-từ-mẫu / sao chép bảng: `BoardDto` kèm nhãn (KHÔNG có `myPermissions` — mở bảng thì `GET /boards/:id` cấp). */
export interface BoardWithLabelsDto extends BoardDto {
  /** Số thẻ đã sao chép — chỉ có khi gửi `includeTasks`. */
  copiedTasks?: number;
  labels: BoardLabel[];
  /** `true` khi bảng gốc còn thẻ chưa sao chép vì chạm trần (100 thẻ). */
  tasksTruncated?: boolean;
}

export interface UpdateBoardPayload {
  name?: string;
  description?: string;
  expectedVersion: number;
}

export interface PutColumnsPayload {
  columns: ColumnInput[];
  expectedVersion: number;
}

export interface CreateTaskPayload {
  title: string;
  columnId?: string;
  afterTaskId?: string;
  /** 8–64 ký tự (BE `createTaskSchema`) — có mặt trong `task:created` để chính máy tạo bỏ qua bản tin của mình. */
  clientMutationId?: string;
}

export interface MoveTaskPayload {
  columnId: string;
  /** `null` = đầu cột. */
  afterTaskId: string | null;
  /** `null` = cuối cột. */
  beforeTaskId: string | null;
  expectedVersion: number;
  /** 8–64 ký tự (be.md §3 `moveTaskSchema`). */
  clientMutationId: string;
}

/** Phản hồi `POST /tasks/:id/move` — be.md §4. */
export interface MoveTaskResult {
  id: string;
  columnId: string;
  columnKind: ColumnKind;
  position: string;
  version: number;
  completedAt: string | null;
}

export interface LabelPayload {
  name: string;
  color: string;
}

/** Thành viên nhóm để chọn "Người làm" trong bộ lọc — endpoint của `members` (p1-02). */
export interface WorkspaceMemberOption {
  userId: string;
  name: string;
  displayName: string | null;
  avatarUrl: string | null;
}

/**
 * Lát TỐI THIỂU của `GET /workspaces/:id` mà module này cần: vai trò để bật nút
 * "Tạo bảng" và trạng thái lưu trữ để chuyển sang chỉ-đọc. Khai HẸP có chủ ý —
 * cùng cách `channels` đọc `myPermissions.canCreateChannel`.
 */
export interface WorkspaceBoardAccess {
  status: 'ACTIVE' | 'ARCHIVED';
  myRole: 'ADMIN' | 'GUEST' | 'MEMBER' | 'OWNER';
}

// ── Payload sự kiện socket (be.md §6, `v: 1`) ────────────────────────────────

export interface BoardUpdatedPayload {
  boardId: string;
  version: number;
  rebalancedColumnId?: string;
  /**
   * Nhãn của bảng đổi (thêm/sửa/xoá) — `version` của bảng KHÔNG đổi theo nhãn nên client không thể
   * dựa vào `version` để biết phải tải lại `detail.labels` (BE `label.service.ts`).
   */
  labelsChanged?: boolean;
  /** Công thức tính điểm đóng góp vừa đổi (`PUT contribution-config`, p4-06) — cùng nghĩa `contribution.types.ts` `BoardUpdatedEvent`. */
  contributionChanged?: boolean;
}

export interface TaskCreatedPayload {
  task: TaskCardDto;
  actorId: string;
  clientMutationId?: string;
}

export interface TaskUpdatedPayload {
  task: TaskCardDto;
  actorId: string;
  clientMutationId?: string;
  /** Tên trường đã đổi (`dates`, `dependencies`, `checklist`…) — chỉ có ở vài nguồn phát (be.md p3-03/p4-04 §6). */
  changed?: string[];
}

export interface TaskMovedPayload {
  id: string;
  /** BE luôn gửi (`board-emitter.ts` `TaskMovedPayload`); tuỳ chọn ở đây để bản tin cũ/thiếu trường vẫn áp như trước. */
  boardId?: string;
  columnId: string;
  columnKind: ColumnKind;
  position: string;
  version: number;
  completedAt: string | null;
  actorId: string;
  clientMutationId?: string;
}

export interface TaskDeletedPayload {
  id: string;
  actorId: string;
}

/** Sự kiện thẻ đã chuẩn hoá cho reducer thuần `apply-task-event.ts`. */
export type TaskEvent =
  | { type: 'created'; task: TaskCardDto }
  | { type: 'deleted'; id: string }
  | { type: 'moved'; patch: MoveTaskResult }
  | { type: 'updated'; task: TaskCardDto };
