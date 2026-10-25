import { buildMyPermissions, permissionService } from "../../../core/permission";
import type { Action } from "../../../core/permission";
import { AppError, ScopeNotFoundError, VersionConflictError } from "../../../core/exceptions";
import type { AuthUser } from "../../../core/types/express";
import { ErrorCode, ErrorMessages } from "../../../core/utils/error.codes";
import { normalizeSearch } from "../../../core/utils/normalize";
import type { Board, BoardPatch } from "../entities/board.interface";
import type { CreateBoardDto, PutColumnsDto, UpdateBoardDto } from "../dtos";
import type { IBoardRepository } from "../repositories/board.repository.interface";
import type { ILabelRepository } from "../repositories/label.repository.interface";
import type { ITaskRepository } from "../repositories/task.repository.interface";
import type { IBoardEmitter } from "../realtime/board-emitter";
import type { IEventOutbox } from "../events/event-outbox";
import { BOARD_SCOPE_ACTIONS } from "./board-access.resolver";
import { assembleColumns, columnsError, diffColumns, isCompletionKindChange } from "./board-columns.validator";
import { toBoardDto, toBoardSummary, toLabelDto, type BoardDto, type BoardSummaryDto, type LabelDto } from "./board.presenter";
import type { BoardWriteRunner } from "./board-write-runner";
import type { KeyedMutex } from "./keyed-mutex";
import type { ProjectAccess } from "./project-access";
import type { IProjectConfig } from "./project-config";
import { snapshotForNewBoard, type IReviewDefaults } from "./review/review-defaults";
import { reviewSyncRow } from "./review/review-events";

export interface BoardDetailDto extends BoardDto {
  labels: LabelDto[];
  myPermissions: Action[];
}

export interface BoardServiceDeps {
  boards: IBoardRepository;
  tasks: ITaskRepository;
  labels: ILabelRepository;
  access: ProjectAccess;
  runner: BoardWriteRunner;
  config: IProjectConfig;
  emitter: IBoardEmitter;
  /** Hàng đợi tạo/khôi phục bảng theo workspace (giữ trần số bảng khỏi bị vượt bởi request song song). */
  workspaceMutex: KeyedMutex;
  /** (p4-05) Mặc định chấm chéo (`SystemConfig pm.review`) chụp vào `Board.review` của bảng MỚI; vắng → bảng mới không có cấu hình (tắt). */
  reviewDefaults?: IReviewDefaults;
  /** (p4-05) Ghi outbox `review.backfill { mode: SYNC }` khi `PUT columns` đổi `kind` cột CÓ thẻ sang/khỏi REVIEW; vắng ⇒ không đối soát lượt chấm (test cũ). */
  outbox?: IEventOutbox;
}

const boardLimitError = (): AppError => new AppError(ErrorMessages[ErrorCode.TASK_009], 409, ErrorCode.TASK_009);

/** Bảng: tạo (cột mặc định), sửa, PUT cột (giữ đúng 1 DONE, chỉ xoá cột rỗng), lưu trữ/khôi phục. */
export class BoardService {
  constructor(private readonly d: BoardServiceDeps) {}

  async list(user: AuthUser, workspaceId: string, archived: boolean): Promise<BoardSummaryDto[]> {
    await this.d.access.workspace(user, workspaceId, "workspace.board.read");
    const boards = await this.d.boards.listByWorkspace(workspaceId, archived);
    const counts = await this.d.tasks.countsByBoard(boards.map((b) => b.id));
    return boards.map((b) => toBoardSummary(b, counts.get(b.id)));
  }

  async create(user: AuthUser, workspaceId: string, dto: CreateBoardDto): Promise<BoardDto> {
    await this.d.access.workspace(user, workspaceId, "workspace.board.create");
    const cfg = await this.d.config.load();
    const columns = assembleColumns(dto.columns ?? cfg.defaultColumns, { columnsMax: cfg.columnsMax });
    const review = this.d.reviewDefaults ? snapshotForNewBoard(await this.d.reviewDefaults.load()) : undefined;
    const board = await this.d.workspaceMutex.run(workspaceId, async () => {
      if ((await this.d.boards.countActive(workspaceId)) >= cfg.perWorkspaceMax) throw boardLimitError();
      return this.d.boards.create({
        workspaceId,
        name: dto.name,
        normalizedName: normalizeSearch(dto.name),
        description: dto.description ? dto.description : null,
        columns,
        ...(review && { review }),
        createdBy: user.id,
      });
    });
    return toBoardDto(board);
  }

  async get(user: AuthUser, boardId: string): Promise<BoardDetailDto> {
    const { board, access } = await this.d.access.board(user, boardId, "workspace.board.read");
    const labels = await this.d.labels.listByBoard(boardId);
    return {
      ...toBoardDto(board),
      labels: labels.map(toLabelDto),
      myPermissions: buildMyPermissions(access, BOARD_SCOPE_ACTIONS),
    };
  }

  async patch(user: AuthUser, boardId: string, dto: UpdateBoardDto): Promise<BoardDto> {
    const { board } = await this.d.access.board(user, boardId, "workspace.board.edit");
    if (board.version !== dto.expectedVersion) throw new VersionConflictError(board.version);
    const patch: BoardPatch = {
      ...(dto.name !== undefined && { name: dto.name, normalizedName: normalizeSearch(dto.name) }),
      ...(dto.description !== undefined && { description: dto.description ? dto.description : null }),
    };
    const updated = await this.d.boards.updateCas(boardId, dto.expectedVersion, patch);
    if (!updated) throw await this.conflictFor(boardId, board);
    this.d.emitter.boardUpdated(boardId, { boardId, version: updated.version });
    return toBoardDto(updated);
  }

  /**
   * Ghi đè toàn bộ cột. `expectedVersion` lệch → 409 `RES_003`; sai số lượng/DONE → `TASK_008` (400); bỏ cột còn thẻ →
   * `TASK_007` (409, `details.taskCount`); đổi loại DONE ↔ khác trên cột có thẻ → `TASK_008`; đổi loại khác thì
   * cập nhật `columnKind` của thẻ trong CÙNG transaction. Đổi sang/khỏi REVIEW trên cột có thẻ còn ghi outbox `review.backfill { SYNC }` (cùng transaction) để job mở/đóng
   * lượt chấm hàng loạt sau commit (không mở lượt cho hàng trăm thẻ trong một transaction).
   */
  async putColumns(user: AuthUser, boardId: string, dto: PutColumnsDto): Promise<BoardDto> {
    const { board } = await this.d.access.board(user, boardId, "workspace.board.edit");
    const cfg = await this.d.config.load();
    const columns = assembleColumns(dto.columns, {
      columnsMax: cfg.columnsMax,
      existingIds: new Set(board.columns.map((c) => c.id)),
    });

    const updated = await this.d.runner.run(boardId, async (tx) => {
      const current = await this.d.boards.findById(boardId, tx);
      if (!current) throw new ScopeNotFoundError();
      if (current.version !== dto.expectedVersion) throw new VersionConflictError(current.version);

      const diff = diffColumns(current.columns, columns);
      for (const column of diff.removed) {
        const taskCount = await this.d.tasks.countInColumn(boardId, column.id, tx);
        if (taskCount > 0) {
          throw new AppError(ErrorMessages[ErrorCode.TASK_007], 409, ErrorCode.TASK_007, { columnId: column.id, taskCount });
        }
      }
      let reviewSync = false;
      for (const change of diff.kindChanged) {
        if ((await this.d.tasks.countInColumn(boardId, change.id, tx)) === 0) continue;
        if (isCompletionKindChange(change)) throw columnsError();
        await this.d.tasks.setColumnKind(boardId, change.id, change.to, tx);
        if (change.from === "REVIEW" || change.to === "REVIEW") reviewSync = true;
      }

      const saved = await this.d.boards.updateCas(boardId, dto.expectedVersion, { columns }, tx);
      if (!saved) throw new VersionConflictError(current.version);
      if (reviewSync && this.d.outbox) await this.d.outbox.add(tx, reviewSyncRow(boardId, saved.version));
      return saved;
    });
    this.d.emitter.boardUpdated(boardId, { boardId, version: updated.version });
    return toBoardDto(updated);
  }

  /** Lưu trữ (idempotent): bảng chỉ còn đọc; quyền kiểm ở WORKSPACE cha (`workspace.board.edit`). */
  async archive(user: AuthUser, boardId: string): Promise<BoardDto> {
    const board = await this.d.access.boardViaWorkspace(user, boardId, "workspace.board.edit");
    if (board.archivedAt) return toBoardDto(board);
    return this.setArchived(boardId, new Date());
  }

  /** Khôi phục (idempotent): vẫn bị trần số bảng đang hoạt động (`TASK_009`). */
  async restore(user: AuthUser, boardId: string): Promise<BoardDto> {
    const board = await this.d.access.boardViaWorkspace(user, boardId, "workspace.board.edit");
    if (!board.archivedAt) return toBoardDto(board);
    const cfg = await this.d.config.load();
    return this.d.workspaceMutex.run(board.workspaceId, async () => {
      if ((await this.d.boards.countActive(board.workspaceId)) >= cfg.perWorkspaceMax) throw boardLimitError();
      return this.setArchived(boardId, null);
    });
  }

  private async setArchived(boardId: string, archivedAt: Date | null): Promise<BoardDto> {
    const updated = await this.d.boards.setArchived(boardId, archivedAt);
    if (!updated) throw new ScopeNotFoundError();
    // Quyền trên BOARD đổi theo trạng thái lưu trữ → vô hiệu cache quyền của scope này.
    await permissionService.bumpVersion({ type: "BOARD", id: boardId });
    this.d.emitter.boardUpdated(boardId, { boardId, version: updated.version });
    return toBoardDto(updated);
  }

  private async conflictFor(boardId: string, fallback: Board): Promise<Error> {
    const current = await this.d.boards.findById(boardId);
    return current ? new VersionConflictError(current.version) : new VersionConflictError(fallback.version);
  }
}
