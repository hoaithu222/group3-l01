import { ScopeNotFoundError } from "../../../core/exceptions";
import type { IBoardEmitter } from "../realtime/board-emitter";
import type { IBoardRepository } from "../repositories/board.repository.interface";
import type { ITaskRepository } from "../repositories/task.repository.interface";
import type { BoardWriteRunner } from "./board-write-runner";
import { evenKeys, isValidPositionKey, needsRebalance } from "./task-position";

export interface RebalanceResult {
  /** `true` khi không cần nén (khoá đã ngắn) hoặc bảng không còn. */
  skipped: boolean;
  changed: number;
}

/**
 * Nén khoá vị trí của MỘT cột (job `board.rebalance-column`): sinh lại khoá đều `a0, a1, …` theo đúng thứ tự hiện
 * tại → thứ tự tương đối KHÔNG đổi nên không tăng `Task.version` (kéo dở của client vẫn hợp lệ, vì client gửi id hàng
 * xóm chứ không gửi khoá). Chạy dưới cùng khoá/transaction với move ⇒ không xen ngang một lượt kéo. Idempotent: lượt
 * chạy lại khi khoá đã ngắn là no-op.
 */
export class BoardRebalanceService {
  constructor(
    private readonly runner: BoardWriteRunner,
    private readonly boards: IBoardRepository,
    private readonly tasks: ITaskRepository,
    private readonly emitter: IBoardEmitter
  ) {}

  async rebalanceColumn(boardId: string, columnId: string): Promise<RebalanceResult> {
    try {
      const { result, version } = await this.runner.run(boardId, async (tx) => {
        const board = await this.boards.findById(boardId, tx);
        if (!board) throw new ScopeNotFoundError();
        const rows = await this.tasks.listColumnAll(boardId, columnId, tx);
        // Nén khi có khoá quá dài, sai định dạng hoặc TRÙNG nhau (dữ liệu hỏng) — nén cũng chữa các trường hợp sau.
        const keys0 = rows.map((t) => t.position);
        const needed = keys0.some((k) => needsRebalance(k) || !isValidPositionKey(k)) || new Set(keys0).size !== keys0.length;
        if (!needed) {
          return { result: { skipped: true, changed: 0 }, version: board.version };
        }
        const keys = evenKeys(rows.length);
        const items = rows.flatMap((t, i) => (t.position !== keys[i] ? [{ id: t.id, position: keys[i] }] : []));
        return { result: { skipped: false, changed: await this.tasks.updatePositions(items, tx) }, version: board.version };
      });
      if (!result.skipped) this.emitter.boardUpdated(boardId, { boardId, version, rebalancedColumnId: columnId });
      return result;
    } catch (err) {
      if (err instanceof ScopeNotFoundError) return { skipped: true, changed: 0 };
      throw err;
    }
  }
}
