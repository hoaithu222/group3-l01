import type { AuthUser } from "../../core/types/express";

/**
 * Cổng "tạo thẻ công việc từ một tin nhắn" (p7-04 be.md §5.5) — `chat-extensions` gọi mà KHÔNG import `modules/projects`. `modules/projects` cài đặt bằng CHÍNH `TaskService.create`
 * (quyền `workspace.task.create`, hạn mức thẻ, vị trí do server tính, activity, outbox `task.created`) và export factory `createTaskCreationPort()`.
 *
 * Thẻ chỉ mang THAM CHIẾU về tin (`sourceMessageRef`); mô tả do người gọi dựng và CHỈ trích nội dung khi được phép (xem `MessageConversionService`) — cổng không tự đọc tin.
 */
export interface TaskSourceMessage {
  scopeType: "CHANNEL" | "CONVERSATION";
  scopeId: string;
  messageId: string;
  workspaceId: string | null;
}

export interface TaskCreationInput {
  actor: AuthUser;
  boardId: string;
  /** Vắng → cột mặc định của bảng. */
  columnId?: string;
  title: string;
  assigneeIds: string[];
  dueDate?: Date;
  description: string | null;
  sourceMessageRef: TaskSourceMessage;
  /** Khoá idempotent theo (bảng, người tạo): bấm/gửi lại cùng tin không sinh hai thẻ. */
  clientTaskId: string;
}

export interface TaskCreationResult {
  task: { id: string; boardId: string; title: string };
  /** `false` khi `clientTaskId` đã tạo thẻ này trước đó. */
  created: boolean;
}

export interface ITaskCreationPort {
  /** Kiểm quyền tạo thẻ ở bảng (`workspace.task.create`, bảng/nhóm còn hoạt động) và trả `workspaceId` của bảng — bước ĐẦU, trước mọi ghi. Không có quyền/không thấy → 404/403 của `projects`. */
  assertCanCreate(actor: AuthUser, boardId: string): Promise<{ workspaceId: string }>;
  createFromMessage(input: TaskCreationInput): Promise<TaskCreationResult>;
}
