import type { Board, BoardColumn, BoardTaskCounts } from "../entities/board.interface";
import type { Label } from "../entities/label.interface";

export interface BoardColumnDto {
  id: string;
  title: string;
  kind: BoardColumn["kind"];
  order: number;
  wipLimit: number | null;
}

export interface BoardDto {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  columns: BoardColumnDto[];
  archivedAt: string | null;
  version: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface BoardSummaryDto {
  id: string;
  name: string;
  description: string | null;
  columns: (BoardColumnDto & { taskCount: number })[];
  taskCount: number;
  doneCount: number;
  archivedAt: string | null;
  version: number;
  updatedAt: string;
}

export interface LabelDto {
  id: string;
  boardId: string;
  name: string;
  color: string;
  createdAt: string;
}

const toColumnDto = (c: BoardColumn): BoardColumnDto => ({
  id: c.id,
  title: c.title,
  kind: c.kind,
  order: c.order,
  wipLimit: c.wipLimit,
});

export function toBoardDto(board: Board): BoardDto {
  return {
    id: board.id,
    workspaceId: board.workspaceId,
    name: board.name,
    description: board.description,
    columns: board.columns.map(toColumnDto),
    archivedAt: board.archivedAt ? board.archivedAt.toISOString() : null,
    version: board.version,
    createdBy: board.createdBy,
    createdAt: board.createdAt.toISOString(),
    updatedAt: board.updatedAt.toISOString(),
  };
}

export function toBoardSummary(board: Board, counts: BoardTaskCounts | undefined): BoardSummaryDto {
  const byColumn = counts?.byColumn ?? new Map<string, number>();
  const columns = board.columns.map((c) => ({ ...toColumnDto(c), taskCount: byColumn.get(c.id) ?? 0 }));
  return {
    id: board.id,
    name: board.name,
    description: board.description,
    columns,
    taskCount: counts?.total ?? 0,
    doneCount: columns.filter((c) => c.kind === "DONE").reduce((sum, c) => sum + c.taskCount, 0),
    archivedAt: board.archivedAt ? board.archivedAt.toISOString() : null,
    version: board.version,
    updatedAt: board.updatedAt.toISOString(),
  };
}

export const toLabelDto = (label: Label): LabelDto => ({
  id: label.id,
  boardId: label.boardId,
  name: label.name,
  color: label.color,
  createdAt: label.createdAt.toISOString(),
});
