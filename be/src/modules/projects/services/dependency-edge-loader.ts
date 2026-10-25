import type { DependencyEdge } from "./dependency-graph";
import type { ITaskDependencyRepository } from "../repositories/task-dependency.repository.interface";
import type { TxContext } from "../repositories/unit-of-work";

/** Bảng có tối đa ngần này cạnh thì đọc MỘT lần rồi duyệt trong bộ nhớ; nhiều hơn → duyệt theo tầng (mỗi tầng một truy vấn). */
export const BOARD_EDGES_CAP = 20_000;

export interface EdgeLoader {
  outgoing(predecessorIds: string[], limit: number): Promise<DependencyEdge[]>;
  incoming(successorIds: string[], limit: number): Promise<DependencyEdge[]>;
}

/**
 * Bộ tải cạnh cho BFS (kiểm vòng, dựng đồ thị con dời lịch). Duyệt theo TẦNG tốn một truy vấn mỗi tầng — chuỗi phụ thuộc dài
 * hàng trăm thẻ thành hàng trăm truy vấn nối tiếp (có khi nằm trong transaction 10 s). Nên đọc CẢ cạnh của bảng đúng một lần (chỉ số
 * `boardId`) rồi lọc trong bộ nhớ; bảng quá nhiều cạnh (> `BOARD_EDGES_CAP`) thì lùi về truy vấn theo tầng. Kết quả tôn trọng `limit`
 * như truy vấn thật nên phép đếm `dependencyGraphVisitMax` (TASK_021) không đổi. Cạnh chỉ nối thẻ CÙNG bảng nên không sót cạnh nào.
 */
export function boardEdgeLoader(repo: ITaskDependencyRepository, boardId: string, tx?: TxContext): EdgeLoader {
  let cached: Promise<DependencyEdge[] | null> | null = null;
  const all = (): Promise<DependencyEdge[] | null> => {
    cached ??= repo.edgesOfBoard(boardId, BOARD_EDGES_CAP + 1, tx).then((edges) => (edges.length > BOARD_EDGES_CAP ? null : edges));
    return cached;
  };
  return {
    async outgoing(ids, limit) {
      const edges = await all();
      if (!edges) return repo.outgoing(ids, limit, tx);
      const set = new Set(ids);
      return edges.filter((e) => set.has(e.predecessorId)).slice(0, limit);
    },
    async incoming(ids, limit) {
      const edges = await all();
      if (!edges) return repo.incoming(ids, limit, tx);
      const set = new Set(ids);
      return edges.filter((e) => set.has(e.successorId)).slice(0, limit);
    },
  };
}
