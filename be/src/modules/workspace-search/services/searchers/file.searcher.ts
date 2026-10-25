import { LIMITS } from "../../../../core/constants/limits";
import { AppError } from "../../../../core/exceptions";
import { encodeCursor } from "../../../../core/utils/cursor";
import { ErrorCode, ErrorMessages } from "../../../../core/utils/error.codes";
import { normalizeSearch } from "../../../../core/utils/normalize";
import { diacriticInsensitivePattern, matchesAllTokens, parseCursorPoint, type CursorPoint } from "../../../../core/utils/search-query";
import type { WorkspaceSearchQueryDto } from "../../dtos";
import type { FileHit, MessageScopeInfo, ReadableScopes, SearchContext, SearchPage, SearchScopeRef } from "../../entities/search.interface";
import type { ICatalogSearchRepository, IMessageSearchRepository, SearchMessageRow } from "../../repositories/search.repository.interface";
import type { ReadableScopesService } from "../readable-scopes.service";
import { buildMessageFilter, scanMessages } from "./message-scan";
import { filterVisibleMessages, scopeRefsOf } from "./message-visibility";
import { emptyPage, type Searcher } from "./searcher.types";

const MAX_ROUNDS = 3;

/** Kho tài liệu chỉ tìm được khi người tìm có `workspace.resource.read` VÀ phân hệ dự án bật — quyết định ở nơi ghép. */
export type ResourceGate = (ctx: SearchContext) => Promise<boolean>;

interface Row {
  at: Date;
  id: string;
  items: FileHit[];
}

/** Thứ tự MỚI → CŨ theo `(at, id)` — cùng thứ tự `createdAt desc, _id desc` của truy vấn (id hex nên so chuỗi thường). */
const newerFirst = (a: Row, b: Row): number => b.at.getTime() - a.at.getTime() || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);

const scopeInfoOf = (row: SearchMessageRow, scopes: ReadableScopes, peerName: (id: string | null) => string | null): MessageScopeInfo => {
  if (row.scopeType === "CHANNEL") {
    const c = scopes.channels.get(row.scopeId);
    return { type: "CHANNEL", id: row.scopeId, name: c?.name ?? null, isPrivate: c?.visibility === "PRIVATE" };
  }
  const conv = scopes.conversations.get(row.scopeId);
  return { type: "CONVERSATION", id: row.scopeId, name: conv?.kind === "DIRECT" ? peerName(conv.peerUserId) : conv?.title ?? null, isPrivate: true };
};

/**
 * Tìm TỆP theo tên (`type=files`): tệp đính kèm tin ở scope đọc được (`Message.attachments[].name`) ∪ tệp kho tài liệu (`Resource`,
 * khi `resourceGate` cho phép). Không tìm nội dung tệp. Lọc thô trong Mongo bằng regex không phân biệt dấu trên TÊN GỐC rồi kiểm lại
 * bằng `normalizeSearch` + neo đầu từ; phân trang theo DÒNG NGUỒN (tin/tài liệu) — một trang gồm trọn các dòng tới khi đủ `limit`
 * tệp nên có thể vượt `limit` tối đa `attachmentsMax − 1` tệp, nhưng không lặp/sót giữa các trang.
 */
export class FileSearcher implements Searcher<FileHit> {
  constructor(
    private readonly scopes: ReadableScopesService,
    private readonly messages: IMessageSearchRepository,
    private readonly catalog: ICatalogSearchRepository,
    private readonly resourceGate: ResourceGate,
    private readonly clock: () => number = Date.now
  ) {}

  async search(ctx: SearchContext, query: WorkspaceSearchQueryDto): Promise<SearchPage<FileHit>> {
    const only: SearchScopeRef[] | undefined = query.scopeType && query.scopeId ? [{ type: query.scopeType, id: query.scopeId }] : undefined;
    const includeDirect = query.includeDirect && !ctx.isGuest;
    const scopeInput = { userId: ctx.userId, workspaceId: ctx.workspaceId, role: ctx.role, includeDirect };
    const readable = await this.scopes.compute({ ...scopeInput, only });
    if (only && readable.channels.size + readable.conversations.size === 0) {
      throw new AppError(ErrorMessages[ErrorCode.SRCH_102], 404, ErrorCode.SRCH_102);
    }

    const filter = buildMessageFilter({ scopes: readable, regexes: [], authorId: query.authorId, hasFile: true });
    if (filter) {
      filter.attachments = {
        $elemMatch: { $and: ctx.tokens.map((t) => ({ name: { $regex: diacriticInsensitivePattern(t), $options: "i" } })) },
      };
    }
    // Kho tài liệu không có phạm vi kênh/hội thoại — bỏ khi lọc theo scope; `authorId` ↔ người tải lên, `from/to` ↔ ngày tải lên.
    const withResources = !only && (await this.resourceGate(ctx));
    if (!filter && !withResources) return emptyPage(query.limit, readable.truncated);

    const deadline = this.clock() + LIMITS.search.workspaceMaxTimeMs;
    const items: FileHit[] = [];
    let point: CursorPoint | undefined = parseCursorPoint(query.cursor);
    let hasMore = false;
    let partial = false;
    let lastExamined: Row | undefined;

    for (let round = 0; round < MAX_ROUNDS; round += 1) {
      const fetch = query.limit + 1;
      const [scan, resources] = await Promise.all([
        filter
          ? scanMessages(this.messages, this.clock, { filter, cursor: point, needed: fetch, deadline, from: query.from, to: query.to })
          : { rows: [] as SearchMessageRow[], partial: false, timedOutEmpty: false },
        withResources ? this.catalog.searchResources({
              workspaceId: ctx.workspaceId,
              regexes: ctx.regexes,
              before: point,
              from: query.from,
              to: query.to,
              uploadedBy: query.authorId,
              limit: fetch,
            }) : [],
      ]);
      if (scan.timedOutEmpty && round === 0 && resources.length === 0) throw new AppError(ErrorMessages[ErrorCode.SRCH_104], 422, ErrorCode.SRCH_104);
      partial ||= scan.partial || scan.timedOutEmpty;

      const messageRows = await this.messageRows(ctx, scopeInput, scan.rows);
      const resourceRows: Row[] = resources.map((r) => ({
        at: r.createdAt,
        id: r.id,
        items: matchesAllTokens(normalizeSearch(r.name), ctx.tokens)
          ? [{ assetId: r.assetId, name: r.name, mime: r.mime, size: r.size, kind: r.type, source: { kind: "RESOURCE", resourceId: r.id }, createdAt: r.createdAt }]
          : [],
      }));
      const merged = [...messageRows, ...resourceRows].sort(newerFirst);
      // Hai nguồn bị giới hạn ĐỘC LẬP (`fetch` dòng/nguồn): nguồn đầy chỉ đảm bảo đủ dữ liệu tới dòng CŨ NHẤT của nó. Cắt danh sách
      // gộp ở dòng mới nhất trong các "dòng cũ nhất của nguồn đầy" — nếu không, cursor sẽ nhảy qua các dòng của nguồn kia nằm giữa hai mốc.
      const oldestOfFull = [
        ...(scan.rows.length >= fetch ? messageRows.slice(-1) : []),
        ...(resources.length >= fetch ? resourceRows.slice(-1) : []),
      ].sort(newerFirst);
      const cutoff = oldestOfFull[0];
      const rows = cutoff ? merged.filter((r) => newerFirst(r, cutoff) <= 0) : merged;
      const sourceMayHaveMore = oldestOfFull.length > 0;

      let stoppedEarly = false;
      for (let i = 0; i < rows.length; i += 1) {
        lastExamined = rows[i];
        items.push(...rows[i].items);
        if (items.length >= query.limit) {
          stoppedEarly = i < rows.length - 1;
          break;
        }
      }
      hasMore = stoppedEarly || sourceMayHaveMore;
      if (items.length >= query.limit || !hasMore || !lastExamined) break;
      point = { at: lastExamined.at, id: lastExamined.id };
    }

    const nextCursor = hasMore && lastExamined ? encodeCursor(lastExamined.at, lastExamined.id) : null;
    return { data: items, meta: { nextCursor, hasMore, limit: query.limit, partial, truncated: readable.truncated } };
  }

  /** Dòng nguồn = tin còn hiển thị được (kiểm lại quyền — DU-02); `items` = tệp trong tin khớp từ khoá, rỗng nếu không khớp/ẩn. */
  private async messageRows(
    ctx: SearchContext,
    scopeInput: { userId: string; workspaceId: string; role: string | null; includeDirect: boolean },
    raw: readonly SearchMessageRow[]
  ): Promise<Row[]> {
    if (raw.length === 0) return [];
    const fresh = await this.scopes.compute({ ...scopeInput, only: scopeRefsOf(raw) });
    const visible = new Set((await filterVisibleMessages(this.messages, ctx.userId, raw, fresh, { requireContent: false, checkParents: false })).map((r) => r.id));
    const peerIds = raw.flatMap((r) => {
      const peer = r.scopeType === "CONVERSATION" ? fresh.conversations.get(r.scopeId)?.peerUserId : null;
      return peer ? [peer] : [];
    });
    const names = await this.catalog.userNames(peerIds);
    const peerName = (id: string | null): string | null => (id ? names.get(id) ?? null : null);

    return raw.map((r) => ({
      at: r.createdAt,
      id: r.id,
      items: visible.has(r.id)
        ? r.attachments
            .filter((a) => matchesAllTokens(normalizeSearch(a.name), ctx.tokens))
            .map((a) => ({
              assetId: a.assetId,
              name: a.name,
              mime: a.mime,
              size: a.size,
              kind: a.kind,
              source: { kind: "MESSAGE" as const, messageId: r.id, threadId: r.threadId, scope: scopeInfoOf(r, fresh, peerName) },
              createdAt: r.createdAt,
            }))
        : [],
    }));
  }
}
