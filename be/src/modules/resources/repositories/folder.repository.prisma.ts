import { Prisma } from "@prisma/client";
import { prisma } from "../../../infrastructure/database";
import { rscErrors } from "../errors";
import { ROOT_KEY, type Folder, type FolderCreateInput, type FolderMoveInput } from "../entities/folder.interface";
import type { FolderSubtreeChange, IFolderRepository } from "./folder.repository.interface";
import type { TxHandle } from "./tx";

type FolderRecord = Awaited<ReturnType<typeof prisma.folder.findFirstOrThrow>>;

const oid = (id: string) => ({ $oid: id });
const date = (d: Date) => ({ $date: d.toISOString() });

function isDuplicateKey(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

/** `$runCommandRaw` KHÔNG ném khi 1 dòng ghi lỗi (vd trùng khoá unique) — lỗi nằm ở `writeErrors` của phản hồi. */
function assertRawWriteOk(result: Prisma.JsonObject): void {
  const errors = result["writeErrors"];
  if (!Array.isArray(errors) || errors.length === 0) return;
  const first = errors[0] as { code?: number; errmsg?: string };
  if (first.code === 11000) throw rscErrors.folderNameTaken();
  throw new Error(`Lệnh ghi thô lên Folder thất bại: ${first.errmsg ?? JSON.stringify(first)}`);
}

function toEntity(r: FolderRecord): Folder {
  return {
    id: r.id,
    workspaceId: r.workspaceId,
    parentId: r.parentId,
    parentKey: r.parentKey,
    path: r.path,
    depth: r.depth,
    name: r.name,
    normalizedName: r.normalizedName,
    nameKey: r.nameKey,
    createdBy: r.createdBy,
    deletedAt: r.deletedAt,
    deletedBy: r.deletedBy,
    version: r.version,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

export class PrismaFolderRepository implements IFolderRepository {
  async findById(id: string, tx?: TxHandle): Promise<Folder | null> {
    const record = await (tx ?? prisma).folder.findUnique({ where: { id } });
    return record ? toEntity(record) : null;
  }

  async listChildren(workspaceId: string, parentKey: string, limit: number): Promise<Folder[]> {
    const records = await prisma.folder.findMany({
      where: { workspaceId, parentKey, deletedAt: null },
      orderBy: [{ normalizedName: "asc" }, { id: "asc" }],
      take: limit,
    });
    return records.map(toEntity);
  }

  async findByIds(ids: string[]): Promise<Folder[]> {
    if (ids.length === 0) return [];
    return (await prisma.folder.findMany({ where: { id: { in: ids } } })).map(toEntity);
  }

  countActiveChildren(folderId: string, tx?: TxHandle): Promise<number> {
    return (tx ?? prisma).folder.count({ where: { parentId: folderId, deletedAt: null } });
  }

  countChildren(folderId: string): Promise<number> {
    return prisma.folder.count({ where: { parentId: folderId } });
  }

  async maxDescendantDepth(workspaceId: string, folderId: string, tx?: TxHandle): Promise<number> {
    const agg = await (tx ?? prisma).folder.aggregate({
      where: { workspaceId, path: { has: folderId } },
      _max: { depth: true },
    });
    return agg._max.depth ?? 0;
  }

  async create(input: FolderCreateInput, tx: TxHandle): Promise<Folder> {
    try {
      const record = await tx.folder.create({
        data: {
          id: input.id,
          workspaceId: input.workspaceId,
          parentId: input.parentId,
          parentKey: input.parentId ?? ROOT_KEY,
          path: input.path,
          depth: input.depth,
          name: input.name,
          normalizedName: input.normalizedName,
          nameKey: input.normalizedName,
          createdBy: input.createdBy,
          // Quy ước Mongo: mọi trường về sau lọc bằng `{ field: null }` phải ghi `null` TƯỜNG MINH lúc tạo.
          deletedAt: null,
          deletedBy: null,
          version: 1,
        },
      });
      return toEntity(record);
    } catch (err) {
      // Lỗi ném RA KHỎI transaction (đã abort) — không tiếp tục dùng `tx` sau P2002.
      if (isDuplicateKey(err)) throw rscErrors.folderNameTaken();
      throw err;
    }
  }

  async updateWithVersion(
    id: string,
    expectedVersion: number,
    patch: FolderMoveInput,
    tx: TxHandle
  ): Promise<Folder | null> {
    try {
      const result = await tx.folder.updateMany({
        where: { id, version: expectedVersion, deletedAt: null },
        data: {
          name: patch.name,
          normalizedName: patch.normalizedName,
          nameKey: patch.normalizedName,
          parentId: patch.parentId,
          parentKey: patch.parentId ?? ROOT_KEY,
          path: patch.path,
          depth: patch.depth,
          version: { increment: 1 },
        },
      });
      if (result.count === 0) return null;
    } catch (err) {
      if (isDuplicateKey(err)) throw rscErrors.folderNameTaken();
      throw err;
    }
    return this.findById(id, tx);
  }

  async rebaseDescendants(
    tx: TxHandle,
    args: { workspaceId: string; folderId: string; oldAncestorsLength: number; newAncestors: string[]; depthDelta: number }
  ): Promise<void> {
    const result = await tx.$runCommandRaw({
      update: "Folder",
      updates: [
        {
          q: { workspaceId: oid(args.workspaceId), path: oid(args.folderId) },
          u: [
            {
              $set: {
                path: {
                  $concatArrays: [
                    args.newAncestors.map(oid),
                    { $slice: ["$path", args.oldAncestorsLength, { $size: "$path" }] },
                  ],
                },
                depth: { $add: ["$depth", args.depthDelta] },
                updatedAt: date(new Date()),
              },
            },
          ],
          multi: true,
        },
      ],
    });
    assertRawWriteOk(result);
  }

  async touch(tx: TxHandle, id: string): Promise<void> {
    await tx.folder.updateMany({ where: { id }, data: { updatedAt: new Date() } });
  }

  async softDeleteSubtree(
    tx: TxHandle,
    args: { workspaceId: string; folderId: string; at: Date; by: string }
  ): Promise<FolderSubtreeChange> {
    const rows = await tx.folder.findMany({
      where: {
        workspaceId: args.workspaceId,
        deletedAt: null,
        OR: [{ id: args.folderId }, { path: { has: args.folderId } }],
      },
      select: { id: true },
    });
    const ids = rows.map((r) => r.id);
    if (ids.length === 0) return { folderIds: [] };
    const result = await tx.$runCommandRaw({
      update: "Folder",
      updates: [
        {
          q: { _id: { $in: ids.map(oid) } },
          u: [
            {
              $set: {
                deletedAt: date(args.at),
                deletedBy: oid(args.by),
                // Nhường tên cho thư mục mới cùng tên (unique `nameKey`): `normalizedName#<id>`.
                nameKey: { $concat: ["$normalizedName", "#", { $toString: "$_id" }] },
                version: { $add: ["$version", 1] },
                updatedAt: date(args.at),
              },
            },
          ],
          multi: true,
        },
      ],
    });
    assertRawWriteOk(result);
    return { folderIds: ids };
  }

  async restoreSubtree(
    tx: TxHandle,
    args: { workspaceId: string; folderId: string; deletedAt: Date }
  ): Promise<FolderSubtreeChange> {
    const rows = await tx.folder.findMany({
      where: {
        workspaceId: args.workspaceId,
        deletedAt: args.deletedAt,
        OR: [{ id: args.folderId }, { path: { has: args.folderId } }],
      },
      select: { id: true },
    });
    const ids = rows.map((r) => r.id);
    if (ids.length === 0) return { folderIds: [] };
    const result = await tx.$runCommandRaw({
      update: "Folder",
      updates: [
        {
          q: { _id: { $in: ids.map(oid) } },
          u: [
            {
              $set: {
                deletedAt: null,
                deletedBy: null,
                nameKey: "$normalizedName",
                version: { $add: ["$version", 1] },
                updatedAt: date(new Date()),
              },
            },
          ],
          multi: true,
        },
      ],
    });
    assertRawWriteOk(result);
    return { folderIds: ids };
  }

  async listTrash(args: {
    workspaceId: string;
    deletedBy?: string;
    deletedAfter: Date;
    before?: { at: Date; id: string };
    limit: number;
  }): Promise<Folder[]> {
    const records = await prisma.folder.findMany({
      where: {
        workspaceId: args.workspaceId,
        deletedAt: { gt: args.deletedAfter },
        ...(args.deletedBy && { deletedBy: args.deletedBy }),
        ...(args.before && {
          OR: [
            { deletedAt: { lt: args.before.at } },
            { deletedAt: args.before.at, id: { lt: args.before.id } },
          ],
        }),
      },
      orderBy: [{ deletedAt: "desc" }, { id: "desc" }],
      take: args.limit,
    });
    return records.map(toEntity);
  }

  async findPurgeCandidates(before: Date, limit: number): Promise<Folder[]> {
    const records = await prisma.folder.findMany({
      where: { deletedAt: { lt: before } },
      orderBy: { deletedAt: "asc" },
      take: limit,
    });
    return records.map(toEntity);
  }

  async hardDelete(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;
    const result = await prisma.folder.deleteMany({ where: { id: { in: ids }, deletedAt: { not: null } } });
    return result.count;
  }

  countActive(workspaceId: string): Promise<number> {
    return prisma.folder.count({ where: { workspaceId, deletedAt: null } });
  }
}
