import { newObjectId } from "../../../core/utils/object-id";
import type { Board, BoardCreateInput, BoardPatch } from "../entities/board.interface";
import type { BoardReviewConfig } from "../entities/task-review.interface";
import type { IBoardRepository } from "./board.repository.interface";
import type { TxContext } from "./unit-of-work";

/** Repository in-memory cho unit test (không mô phỏng rollback — transaction thật kiểm ở test tích hợp Mongo). */
export class InMemoryBoardRepository implements IBoardRepository {
  readonly boards = new Map<string, Board>();

  async findById(id: string, _tx?: TxContext): Promise<Board | null> {
    const b = this.boards.get(id);
    return b ? structuredClone(b) : null;
  }

  async listByWorkspace(workspaceId: string, archived: boolean): Promise<Board[]> {
    return [...this.boards.values()]
      .filter((b) => b.workspaceId === workspaceId && (b.archivedAt !== null) === archived)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((b) => structuredClone(b));
  }

  async listIdsByWorkspace(workspaceId: string): Promise<string[]> {
    return [...this.boards.values()].filter((b) => b.workspaceId === workspaceId).map((b) => b.id);
  }

  async countActive(workspaceId: string): Promise<number> {
    return [...this.boards.values()].filter((b) => b.workspaceId === workspaceId && b.archivedAt === null).length;
  }

  async create(input: BoardCreateInput): Promise<Board> {
    const now = new Date();
    const board: Board = { id: newObjectId(), ...input, archivedAt: null, version: 1, createdAt: now, updatedAt: now };
    this.boards.set(board.id, structuredClone(board));
    return board;
  }

  async updateCas(id: string, expectedVersion: number, patch: BoardPatch): Promise<Board | null> {
    const b = this.boards.get(id);
    if (!b || b.version !== expectedVersion) return null;
    Object.assign(b, {
      ...(patch.name !== undefined && { name: patch.name, normalizedName: patch.normalizedName }),
      ...(patch.description !== undefined && { description: patch.description }),
      ...(patch.columns !== undefined && { columns: structuredClone(patch.columns) }),
      version: b.version + 1,
      updatedAt: new Date(),
    });
    return structuredClone(b);
  }

  async setArchived(id: string, archivedAt: Date | null): Promise<Board | null> {
    const b = this.boards.get(id);
    if (!b) return null;
    Object.assign(b, { archivedAt, version: b.version + 1, updatedAt: new Date() });
    return structuredClone(b);
  }

  async updateReviewCas(id: string, expectedVersion: number, review: BoardReviewConfig): Promise<Board | null> {
    const b = this.boards.get(id);
    if (!b || b.version !== expectedVersion) return null;
    Object.assign(b, { review: structuredClone(review), version: b.version + 1, updatedAt: new Date() });
    return structuredClone(b);
  }

  async touch(id: string): Promise<boolean> {
    const b = this.boards.get(id);
    if (!b) return false;
    b.updatedAt = new Date();
    return true;
  }
}
