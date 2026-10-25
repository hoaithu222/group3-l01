import type { BoardColumn, BoardLabel, TaskCardDto } from '../../api/boards.types';
import type { CreateTaskInput } from '../../queries/tasks.queries';
import type { TaskA11yAction } from './TaskCardMini';

/** Props CHUNG của cột và pager — gom một chỗ để hai file không lệch nhau. */
export interface KanbanBoardProps {
  columns: readonly BoardColumn[];
  /** Có được thêm thẻ / mở menu chuyển thẻ (đúng quyền, đang online, bảng chưa lưu trữ). */
  canCreate: boolean;
  canMove: boolean;
  /**
   * Người dùng CÓ quyền tạo thẻ không (khác `canCreate`: offline chỉ khoá TẠM, ô vẫn hiện). Không có quyền/bảng lưu trữ ⇒ ẩn ô
   * "Thêm thẻ" ở mọi cột — nút xám lặp ở từng cột mà không nói vì sao chỉ là nhiễu. Mặc định `true`.
   */
  showCreate?: boolean;
  hasMore: Readonly<Record<string, boolean>>;
  labels: ReadonlyMap<string, BoardLabel>;
  tasks: Readonly<Record<string, readonly TaskCardDto[]>>;
  onA11yAction: (task: TaskCardDto, action: TaskA11yAction) => void;
  onCreate: (input: CreateTaskInput) => void;
  onLoadMore: (columnId: string) => void;
  onOpenMenu: (task: TaskCardDto) => void;
  onOpenTask: (task: TaskCardDto) => void;
}

export interface KanbanColumnProps
  extends Omit<KanbanBoardProps, 'columns' | 'hasMore' | 'tasks'> {
  column: BoardColumn;
  hasMore: boolean;
  /** Chiều cao/rộng cột (dp) — pager đo và truyền xuống để FlashList có khung xác định. */
  height: number;
  tasks: readonly TaskCardDto[];
  width: number;
}
