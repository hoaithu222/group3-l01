import { Prisma } from "@prisma/client";
import { prisma } from "../../../infrastructure/database";
import { escapeRegex } from "../../../core/utils/escape-regex";
import { rscErrors } from "../errors";
import { ROOT_KEY } from "../entities/folder.interface";
import type {
  PreviewStatusValue,
  Resource,
  ResourceCreateInput,
  ResourceListParams,
  ResourcePatchInput,
  ResourceTypeUsage,
  ResourceTypeValue,
  TrashListParams,
} from "../entities/resource.interface";
import type { AffectedResource, IResourceRepository } from "./resource.repository.interface";
import type { TxHandle } from "./tx";

type ResourceRecord = Awaited<ReturnType<typeof prisma.resource.findFirstOrThrow>>;

function toEntity(r: ResourceRecord): Resource {
  return {
    id: r.id,
    workspaceId: r.workspaceId,
    folderId: r.folderId,
    folderKey: r.folderKey,
    assetId: r.assetId,
    name: r.name,
    normalizedName: r.normalizedName,
    extension: r.extension,
    type: r.type as ResourceTypeValue,
    language: r.language,
    mime: r.mime,
    size: r.size,
    description: r.description,
    tags: r.tags,
    previewAssetId: r.previewAssetId,
    previewStatus: r.previewStatus as PreviewStatusValue,
    uploadedBy: r.uploadedBy,
    version: r.version,
    deletedAt: r.deletedAt,
    deletedBy: r.deletedBy,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

export class PrismaResourceRepository implements IResourceRepository {
  async findById(id: string, tx?: TxHandle): Promise<Resource | null> {
    const record = await (tx ?? prisma).resource.findUnique({ where: { id } });
    return record ? toEntity(record) : null;
  }

  async findByIds(ids: string[]): Promise<Resource[]> {
    if (ids.length === 0) return [];
    return (await prisma.resource.findMany({ where: { id: { in: ids } } })).map(toEntity);
  }

  async create(input: ResourceCreateInput, tx: TxHandle): Promise<Resource> {
    try {
      const record = await tx.resource.create({
        data: {
          id: input.id,
          workspaceId: input.workspaceId,
          folderId: input.folderId,
          folderKey: input.folderId ?? ROOT_KEY,
          assetId: input.assetId,
          name: input.name,
          normalizedName: input.normalizedName,
          extension: input.extension,
          type: input.type,
          language: input.language,
          mime: input.mime,
          size: input.size,
          description: input.description,
          tags: input.tags,
          previewAssetId: null,
          previewStatus: input.previewStatus,
          uploadedBy: input.uploadedBy,
          // Quy ước Mongo: trường về sau lọc bằng `{ field: null }` phải ghi `null` TƯỜNG MINH lúc tạo.
          deletedAt: null,
          deletedBy: null,
          version: 1,
        },
      });
      return toEntity(record);
    } catch (err) {
      // Lỗi ném RA KHỎI transaction (đã abort) — không tiếp tục dùng `tx` sau P2002.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") throw rscErrors.assetNotAttachable();
      throw err;
    }
  }

  async list(params: ResourceListParams): Promise<Resource[]> {
    const sortField = params.sort === "name" ? "normalizedName" : params.sort;
    const op = params.order === "desc" ? "lt" : "gt";
    // Prisma+Mongo dịch `contains` thành `$regex` KHÔNG thoát ký tự đặc biệt (đã kiểm: `a.b` khớp `aXb`) → tự escape để
    // chuỗi người dùng chỉ khớp LITERAL (chống ReDoS/regex injection).
    const and: Prisma.ResourceWhereInput[] = (params.terms ?? []).map((t) => ({ normalizedName: { contains: escapeRegex(t) } }));
    if (params.after) {
      const value = params.after.value;
      and.push({
        OR: [{ [sortField]: { [op]: value } }, { [sortField]: value, id: { [op]: params.after.id } }],
      });
    }
    const records = await prisma.resource.findMany({
      where: {
        workspaceId: params.workspaceId,
        deletedAt: null,
        ...(params.folderKey !== undefined && { folderKey: params.folderKey }),
        ...(params.type && { type: params.type }),
        ...(and.length > 0 && { AND: and }),
      },
      orderBy: [{ [sortField]: params.order }, { id: params.order }],
      take: params.limit,
    });
    return records.map(toEntity);
  }

  countActiveInFolder(folderId: string, tx?: TxHandle): Promise<number> {
    return (tx ?? prisma).resource.count({ where: { folderId, deletedAt: null } });
  }

  countInFolders(folderIds: string[]): Promise<number> {
    if (folderIds.length === 0) return Promise.resolve(0);
    return prisma.resource.count({ where: { folderId: { in: folderIds } } });
  }

  async updateWithVersion(
    id: string,
    expectedVersion: number,
    patch: ResourcePatchInput,
    tx: TxHandle
  ): Promise<Resource | null> {
    const result = await tx.resource.updateMany({
      where: { id, version: expectedVersion, deletedAt: null },
      data: {
        ...(patch.name !== undefined && { name: patch.name }),
        ...(patch.normalizedName !== undefined && { normalizedName: patch.normalizedName }),
        ...(patch.extension !== undefined && { extension: patch.extension }),
        ...(patch.type !== undefined && { type: patch.type }),
        ...(patch.language !== undefined && { language: patch.language }),
        ...(patch.description !== undefined && { description: patch.description }),
        ...(patch.tags !== undefined && { tags: patch.tags }),
        ...(patch.folderId !== undefined && { folderId: patch.folderId, folderKey: patch.folderId ?? ROOT_KEY }),
        version: { increment: 1 },
      },
    });
    return result.count === 0 ? null : this.findById(id, tx);
  }

  async softDelete(id: string, at: Date, by: string, tx: TxHandle): Promise<Resource | null> {
    const result = await tx.resource.updateMany({
      where: { id, deletedAt: null },
      data: { deletedAt: at, deletedBy: by, version: { increment: 1 } },
    });
    return result.count === 0 ? null : this.findById(id, tx);
  }

  async restore(id: string, folderId: string | null, tx: TxHandle): Promise<Resource | null> {
    const result = await tx.resource.updateMany({
      where: { id, deletedAt: { not: null } },
      data: { deletedAt: null, deletedBy: null, folderId, folderKey: folderId ?? ROOT_KEY, version: { increment: 1 } },
    });
    return result.count === 0 ? null : this.findById(id, tx);
  }

  async softDeleteInFolders(
    tx: TxHandle,
    args: { workspaceId: string; folderIds: string[]; at: Date; by: string }
  ): Promise<AffectedResource[]> {
    const where = { workspaceId: args.workspaceId, folderId: { in: args.folderIds }, deletedAt: null };
    const rows = await tx.resource.findMany({ where, select: { id: true, folderId: true, version: true } });
    if (rows.length === 0) return [];
    await tx.resource.updateMany({
      where: { id: { in: rows.map((r) => r.id) }, deletedAt: null },
      data: { deletedAt: args.at, deletedBy: args.by, version: { increment: 1 } },
    });
    return rows.map((r) => ({ id: r.id, folderId: r.folderId, version: r.version + 1 }));
  }

  async restoreInFolders(
    tx: TxHandle,
    args: { workspaceId: string; folderIds: string[]; deletedAt: Date }
  ): Promise<AffectedResource[]> {
    const where = { workspaceId: args.workspaceId, folderId: { in: args.folderIds }, deletedAt: args.deletedAt };
    const rows = await tx.resource.findMany({ where, select: { id: true, folderId: true, version: true } });
    if (rows.length === 0) return [];
    await tx.resource.updateMany({
      where: { id: { in: rows.map((r) => r.id) }, deletedAt: args.deletedAt },
      data: { deletedAt: null, deletedBy: null, version: { increment: 1 } },
    });
    return rows.map((r) => ({ id: r.id, folderId: r.folderId, version: r.version + 1 }));
  }

  async listTrash(params: TrashListParams): Promise<Resource[]> {
    const records = await prisma.resource.findMany({
      where: {
        workspaceId: params.workspaceId,
        deletedAt: { gt: params.deletedAfter },
        ...(params.deletedBy && { deletedBy: params.deletedBy }),
        ...(params.before && {
          OR: [
            { deletedAt: { lt: params.before.at } },
            { deletedAt: params.before.at, id: { lt: params.before.id } },
          ],
        }),
      },
      orderBy: [{ deletedAt: "desc" }, { id: "desc" }],
      take: params.limit,
    });
    return records.map(toEntity);
  }

  async findPurgeCandidates(before: Date, limit: number): Promise<Resource[]> {
    const records = await prisma.resource.findMany({
      where: { deletedAt: { lt: before } },
      orderBy: { deletedAt: "asc" },
      take: limit,
    });
    return records.map(toEntity);
  }

  async deleteById(id: string, tx: TxHandle): Promise<boolean> {
    const result = await tx.resource.deleteMany({ where: { id, deletedAt: { not: null } } });
    return result.count > 0;
  }

  async usageByType(workspaceId: string): Promise<ResourceTypeUsage[]> {
    const groups = await prisma.resource.groupBy({
      by: ["type"],
      where: { workspaceId, deletedAt: null },
      _count: { _all: true },
      _sum: { size: true },
      orderBy: { type: "asc" },
    });
    return groups.map((g) => ({
      type: g.type as ResourceTypeValue,
      count: g._count._all,
      bytes: g._sum?.size ?? 0,
    }));
  }

  async trashBytes(workspaceId: string): Promise<number> {
    const agg = await prisma.resource.aggregate({
      where: { workspaceId, deletedAt: { not: null } },
      _sum: { size: true },
    });
    return agg._sum.size ?? 0;
  }
}
