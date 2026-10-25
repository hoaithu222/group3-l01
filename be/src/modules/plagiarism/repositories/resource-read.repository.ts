import { prisma } from "../../../infrastructure/database";
import { decodeCursor, encodeCursor } from "../../../core/utils/cursor";
import type { CursorResponse } from "../../../core/utils/response";

/**
 * Cổng ĐỌC-CHỈ trên collection `Resource`/`Folder` (module `resources`) — CÙNG MẪU `admin-media-ops` (p2-07):
 * không import file nội bộ của `resources`, chỉ `select` tối thiểu qua Prisma trực tiếp (be.md §1 "Không import module
 * resources"). KHÔNG có hàm ghi nào ở đây.
 */
export interface ResourceInfo {
  id: string;
  workspaceId: string;
  folderId: string | null;
  assetId: string;
  name: string;
  extension: string | null;
  size: number;
  uploadedBy: string;
  version: number;
  deletedAt: Date | null;
}

export interface EligibleResourcesFilter {
  workspaceId: string;
  cursor?: string;
  limit: number;
  q?: string;
  folderId?: string;
}

const SELECT = {
  id: true,
  workspaceId: true,
  folderId: true,
  assetId: true,
  name: true,
  extension: true,
  size: true,
  uploadedBy: true,
  version: true,
  deletedAt: true,
} as const;

export interface IResourceReadRepository {
  findById(id: string): Promise<ResourceInfo | null>;
  findManyByIds(ids: string[]): Promise<ResourceInfo[]>;
  listEligible(filter: EligibleResourcesFilter): Promise<CursorResponse<ResourceInfo>>;
  /** Id mọi tệp (chưa xoá) nằm trong các thư mục cho trước HOẶC bất kỳ thư mục con cháu nào của chúng. */
  listResourceIdsInFolders(workspaceId: string, folderIds: string[]): Promise<string[]>;
}

export class PrismaResourceReadRepository implements IResourceReadRepository {
  async findById(id: string): Promise<ResourceInfo | null> {
    return prisma.resource.findUnique({ where: { id }, select: SELECT });
  }

  async findManyByIds(ids: string[]): Promise<ResourceInfo[]> {
    if (ids.length === 0) return [];
    return prisma.resource.findMany({ where: { id: { in: ids } }, select: SELECT });
  }

  async listEligible(filter: EligibleResourcesFilter): Promise<CursorResponse<ResourceInfo>> {
    const decoded = filter.cursor ? decodeCursor(filter.cursor) : null;
    const rows = await prisma.resource.findMany({
      where: {
        workspaceId: filter.workspaceId,
        deletedAt: null,
        ...(filter.q && { name: { contains: filter.q, mode: "insensitive" } }),
        ...(filter.folderId !== undefined && { folderId: filter.folderId === "root" ? null : filter.folderId }),
        ...(decoded && { OR: [{ createdAt: { lt: decoded.at } }, { createdAt: decoded.at, id: { lt: decoded.id } }] }),
      },
      select: { ...SELECT, createdAt: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: filter.limit + 1,
    });
    const hasMore = rows.length > filter.limit;
    const page = hasMore ? rows.slice(0, filter.limit) : rows;
    const last = page[page.length - 1];
    return {
      data: page.map(({ createdAt: _createdAt, ...r }) => r),
      meta: { nextCursor: hasMore && last ? encodeCursor(last.createdAt, last.id) : null, hasMore, limit: filter.limit },
    };
  }

  async listResourceIdsInFolders(workspaceId: string, folderIds: string[]): Promise<string[]> {
    if (folderIds.length === 0) return [];
    const allFolderIds = new Set(folderIds);
    let frontier = folderIds;
    // BFS trên cây thư mục — vài chục thư mục lồng nhau là hợp lý cho một workspace, không giới hạn vòng lặp cứng.
    for (let depth = 0; depth < 50 && frontier.length > 0; depth += 1) {
      const children = await prisma.folder.findMany({
        where: { workspaceId, parentId: { in: frontier } },
        select: { id: true },
      });
      const next = children.map((c) => c.id).filter((id) => !allFolderIds.has(id));
      next.forEach((id) => allFolderIds.add(id));
      frontier = next;
    }
    const resources = await prisma.resource.findMany({
      where: { workspaceId, deletedAt: null, folderId: { in: [...allFolderIds] } },
      select: { id: true },
    });
    return resources.map((r) => r.id);
  }
}
