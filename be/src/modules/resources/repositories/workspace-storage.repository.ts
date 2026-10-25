import { prisma } from "../../../infrastructure/database";
import type { TxHandle } from "./tx";

/**
 * Bộ đếm dung lượng kho tài liệu trên `Workspace.storageUsedBytes` (Float — D-28, không BigInt: JSON-safe, `$inc`
 * chạy được). Module `resources` chỉ chạm ĐÚNG trường này của collection `Workspace` (không import module `workspaces`).
 */
export interface IWorkspaceStorageRepository {
  /** `null` khi workspace không tồn tại. Doc cũ thiếu trường → Prisma đọc ra `0` (đã kiểm ở foundation D-28). */
  getUsedBytes(workspaceId: string, tx?: TxHandle): Promise<number | null>;
  /** `$inc` — `delta` âm khi xoá vĩnh viễn. Phải gọi trong transaction cùng thao tác tạo/xoá Resource. */
  increment(tx: TxHandle, workspaceId: string, delta: number): Promise<void>;
}

export class PrismaWorkspaceStorageRepository implements IWorkspaceStorageRepository {
  async getUsedBytes(workspaceId: string, tx?: TxHandle): Promise<number | null> {
    const ws = await (tx ?? prisma).workspace.findUnique({ where: { id: workspaceId }, select: { storageUsedBytes: true } });
    return ws ? ws.storageUsedBytes : null;
  }

  async increment(tx: TxHandle, workspaceId: string, delta: number): Promise<void> {
    await tx.workspace.update({ where: { id: workspaceId }, data: { storageUsedBytes: { increment: delta } } });
  }
}

export class InMemoryWorkspaceStorageRepository implements IWorkspaceStorageRepository {
  readonly used = new Map<string, number>();

  getUsedBytes(workspaceId: string, _tx?: TxHandle): Promise<number | null> {
    return Promise.resolve(this.used.has(workspaceId) ? (this.used.get(workspaceId) as number) : null);
  }

  increment(_tx: TxHandle, workspaceId: string, delta: number): Promise<void> {
    this.used.set(workspaceId, (this.used.get(workspaceId) ?? 0) + delta);
    return Promise.resolve();
  }
}
