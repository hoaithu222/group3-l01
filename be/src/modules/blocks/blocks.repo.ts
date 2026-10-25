import { Prisma } from "@prisma/client";
import { prisma } from "../../infrastructure/database";

/** `P2002` — vi phạm unique `(blockerId, blockedId)` (2 request chặn cùng lúc). Đặt ở repo để service không import Prisma. */
export function isBlockDuplicateError(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

/** Bản ghi `UserBlock` (A chặn B). */
export interface UserBlockEntity {
  id: string;
  blockerId: string;
  blockedId: string;
  createdAt: Date;
}

export interface BlockedUserBrief {
  id: string;
  name: string;
  /** Asset id thô — service đổi thành URL ảnh ký sẵn (`avatarUrlOf`); `null` = chưa đặt ảnh/đã ẩn danh hoá. */
  avatarAssetId: string | null;
}

export interface ListBlocksParams {
  blockerId: string;
  /** Con trỏ `(createdAt, id)` giảm dần — trang kế tiếp lấy bản ghi CŨ HƠN con trỏ. */
  cursor?: { at: Date; id: string } | null;
  limit: number;
}

/**
 * Repository Flat của module `blocks` (be.md p1-08 §1) — method GHI nhận
 * `Prisma.TransactionClient` (cùng transaction với `outbox.add`), method ĐỌC
 * dùng singleton `prisma`. `create()` GHI TƯỜNG MINH mọi field (không có field
 * nullable ở `UserBlock` nên không dính bẫy "absent ≠ null" của Prisma-Mongo).
 */
export interface IBlocksRepo {
  count(blockerId: string): Promise<number>;
  find(blockerId: string, blockedId: string): Promise<UserBlockEntity | null>;
  create(tx: Prisma.TransactionClient, blockerId: string, blockedId: string): Promise<UserBlockEntity>;
  deletePair(tx: Prisma.TransactionClient, blockerId: string, blockedId: string): Promise<number>;
  listByBlocker(params: ListBlocksParams): Promise<UserBlockEntity[]>;
  listBlockedIds(blockerId: string, max: number): Promise<string[]>;
  listBlockerIds(blockedId: string): Promise<string[]>;
  findUsers(ids: string[]): Promise<BlockedUserBrief[]>;
  userExists(id: string): Promise<boolean>;
}

export class PrismaBlocksRepo implements IBlocksRepo {
  async count(blockerId: string): Promise<number> {
    return prisma.userBlock.count({ where: { blockerId } });
  }

  async find(blockerId: string, blockedId: string): Promise<UserBlockEntity | null> {
    return prisma.userBlock.findUnique({ where: { blockerId_blockedId: { blockerId, blockedId } } });
  }

  async create(tx: Prisma.TransactionClient, blockerId: string, blockedId: string): Promise<UserBlockEntity> {
    return tx.userBlock.create({ data: { blockerId, blockedId } });
  }

  async deletePair(tx: Prisma.TransactionClient, blockerId: string, blockedId: string): Promise<number> {
    const result = await tx.userBlock.deleteMany({ where: { blockerId, blockedId } });
    return result.count;
  }

  async listByBlocker(params: ListBlocksParams): Promise<UserBlockEntity[]> {
    const { blockerId, cursor, limit } = params;
    return prisma.userBlock.findMany({
      where: {
        blockerId,
        ...(cursor && { OR: [{ createdAt: { lt: cursor.at } }, { createdAt: cursor.at, id: { lt: cursor.id } }] }),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit,
    });
  }

  async listBlockedIds(blockerId: string, max: number): Promise<string[]> {
    const rows = await prisma.userBlock.findMany({ where: { blockerId }, select: { blockedId: true }, take: max });
    return rows.map((r) => r.blockedId);
  }

  async listBlockerIds(blockedId: string): Promise<string[]> {
    const rows = await prisma.userBlock.findMany({ where: { blockedId }, select: { blockerId: true } });
    return rows.map((r) => r.blockerId);
  }

  async findUsers(ids: string[]): Promise<BlockedUserBrief[]> {
    if (ids.length === 0) return [];
    return prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, avatarAssetId: true } });
  }

  async userExists(id: string): Promise<boolean> {
    const user = await prisma.user.findUnique({ where: { id }, select: { id: true } });
    return user !== null;
  }
}
