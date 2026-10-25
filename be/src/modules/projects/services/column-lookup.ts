import { AppError } from "../../../core/exceptions";
import { ErrorCode, ErrorMessages } from "../../../core/utils/error.codes";
import type { Board, BoardColumn } from "../entities/board.interface";

export const unknownColumnError = (columnId: string): AppError =>
  new AppError(ErrorMessages[ErrorCode.TASK_001], 400, ErrorCode.TASK_001, { columnId });

/** Cột theo id; không có → `TASK_001` (400). */
export function findColumn(board: Board, columnId: string): BoardColumn {
  const column = board.columns.find((c) => c.id === columnId);
  if (!column) throw unknownColumnError(columnId);
  return column;
}

/** Cột mặc định khi tạo thẻ: cột TODO có `order` nhỏ nhất; không có thì cột đầu không phải DONE; cuối cùng cột đầu. */
export function defaultColumn(board: Board): BoardColumn {
  const ordered = [...board.columns].sort((a, b) => a.order - b.order);
  return ordered.find((c) => c.kind === "TODO") ?? ordered.find((c) => c.kind !== "DONE") ?? ordered[0];
}
