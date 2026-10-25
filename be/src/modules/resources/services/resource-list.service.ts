import { NotFoundError } from "../../../core/exceptions";
import type { CursorResponse } from "../../../core/utils/response";
import type { AuthUser } from "../../../core/types/express";
import { ROOT_KEY } from "../entities/folder.interface";
import type { Resource, ResourceListParams } from "../entities/resource.interface";
import type { ListResourcesQueryDto } from "../dtos";
import { withClock, type ResolvedDeps, type ResourceDeps } from "./resource.deps";
import { sortValueOf, splitTerms } from "./resource.helpers";
import { toResourceDto, toResourceRow, type ResourceDto, type ResourceRowDto } from "./resource.presenter";
import { decodeListCursor, encodeListCursor } from "./resource-list.cursor";
import { canModify } from "./workspace-access";

/** Mục trong cache: phần dùng chung mọi người xem (không chữ ký URL, không `canModify` — gắn lúc trả lời). */
interface CachedItem {
  row: ResourceRowDto;
  /** Chỉ ảnh — asset để ký thumbnail. */
  thumbAssetId: string | null;
}
interface CachedPage {
  items: CachedItem[];
  nextCursor: string | null;
  hasMore: boolean;
}

/**
 * Danh sách tài liệu: theo thư mục (`folderKey`) hoặc tìm không dấu toàn workspace (`q`, mỗi từ AND trên
 * `normalizedName`); cursor `(trường sắp, id)`; cache Redis TRANG ĐẦU theo phiên bản workspace (p3-01 README §2).
 */
export class ResourceListService {
  private readonly d: ResolvedDeps;

  constructor(deps: ResourceDeps) {
    this.d = withClock(deps);
  }

  async list(user: AuthUser, workspaceId: string, query: ListResourcesQueryDto): Promise<CursorResponse<ResourceDto>> {
    const access = await this.d.access.assert(user, "workspace.resource.read", workspaceId);
    const terms = query.q ? splitTerms(query.q) : undefined;
    const folderKey = terms ? undefined : await this.resolveFolderKey(workspaceId, query.folderId);
    const cacheable = !query.cursor && !terms;

    let page: CachedPage | null = null;
    let cacheKey = "";
    if (cacheable) {
      const version = await this.d.cache.version(workspaceId);
      cacheKey = `rsc:list:${workspaceId}:${version}:${folderKey}:${query.type ?? "all"}:${query.sort}:${query.order}:${query.limit}`;
      page = await this.d.cache.read<CachedPage>(cacheKey);
    }
    if (!page) {
      page = await this.load(workspaceId, query, folderKey, terms);
      if (cacheable) await this.d.cache.write(cacheKey, page);
    }

    const thumbIds = page.items.map((i) => i.thumbAssetId).filter((id): id is string => id !== null);
    const thumbs = thumbIds.length > 0 ? await this.d.assets.signThumbnails(thumbIds) : new Map<string, { url: string }>();
    const data = page.items.map((item) =>
      toResourceDto(item.row, {
        thumbnailUrl: item.thumbAssetId ? (thumbs.get(item.thumbAssetId)?.url ?? null) : null,
        canModify: canModify(access, user, item.row.uploadedBy.id),
      })
    );
    return { data, meta: { nextCursor: page.nextCursor, hasMore: page.hasMore, limit: query.limit } };
  }

  private async resolveFolderKey(workspaceId: string, folderId: string | undefined): Promise<string> {
    if (!folderId || folderId === ROOT_KEY) return ROOT_KEY;
    const folder = await this.d.folders.findById(folderId);
    if (!folder || folder.workspaceId !== workspaceId || folder.deletedAt !== null) {
      throw new NotFoundError("Không tìm thấy thư mục");
    }
    return folder.id;
  }

  /**
   * Đường dẫn chữ `Tổ tiên / … / Thư mục` của các thư mục chứa `rows` — tối đa 2 truy vấn (thư mục chứa, rồi tổ tiên chưa nạp) cho cả trang, không N+1.
   * Khoá kết quả là `folderId` (gốc kho không có mặt trong Map → `""`). Tổ tiên không còn (xoá cứng) thì bỏ đoạn đó thay vì làm hỏng cả trang.
   */
  private async folderPathsOf(rows: Resource[]): Promise<Map<string, string>> {
    const ids = [...new Set(rows.map((r) => r.folderId).filter((id): id is string => id !== null))];
    if (ids.length === 0) return new Map();
    const containing = await this.d.folders.findByIds(ids);
    const byId = new Map(containing.map((f) => [f.id, f]));
    const missing = [...new Set(containing.flatMap((f) => f.path))].filter((id) => !byId.has(id));
    if (missing.length > 0) for (const f of await this.d.folders.findByIds(missing)) byId.set(f.id, f);
    return new Map(
      containing.map((f) => [
        f.id,
        [...f.path, f.id]
          .map((id) => byId.get(id)?.name)
          .filter((name): name is string => name !== undefined)
          .join(" / "),
      ])
    );
  }

  private async load(
    workspaceId: string,
    query: ListResourcesQueryDto,
    folderKey: string | undefined,
    terms: string[] | undefined
  ): Promise<CachedPage> {
    const params: ResourceListParams = {
      workspaceId,
      folderKey,
      terms,
      type: query.type,
      sort: query.sort,
      order: query.order,
      after: query.cursor ? decodeListCursor(query.cursor, query.sort) : undefined,
      limit: query.limit + 1,
    };
    const rows = await this.d.resources.list(params);
    const hasMore = rows.length > query.limit;
    const page = rows.slice(0, query.limit);
    const users = await this.d.users.findMany(page.map((r) => r.uploadedBy));
    // Kết quả TÌM trải mọi thư mục nên kèm đường dẫn chữ (p3-01 app.md §9); liệt kê theo thư mục thì không cần.
    const paths = terms ? await this.folderPathsOf(page) : undefined;
    const last = page[page.length - 1];
    return {
      items: page.map((r) => ({
        row: { ...toResourceRow(r, users.get(r.uploadedBy)), ...(paths ? { folderPath: paths.get(r.folderId ?? ROOT_KEY) ?? "" } : {}) },
        thumbAssetId: r.type === "IMAGE" ? r.assetId : null,
      })),
      hasMore,
      nextCursor: hasMore && last ? encodeListCursor(query.sort, sortValueOf(last, query.sort), last.id) : null,
    };
  }
}
