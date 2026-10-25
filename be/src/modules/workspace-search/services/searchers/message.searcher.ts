import { LIMITS } from "../../../../core/constants/limits";
import { AppError } from "../../../../core/exceptions";
import { encodeCursor } from "../../../../core/utils/cursor";
import { ErrorCode, ErrorMessages } from "../../../../core/utils/error.codes";
import { parseCursorPoint } from "../../../../core/utils/search-query";
import { searchRequestsTotal } from "../../../../infrastructure/metrics";
import { avatarUrlOf } from "../../../../shared/media";
import { buildSnippet } from "../../../discovery/public";
import type { WorkspaceSearchQueryDto } from "../../dtos";
import type {
  MessageHit,
  MessageScopeInfo,
  ReadableScopes,
  SearchContext,
  SearchPage,
  SearchScopeRef,
} from "../../entities/search.interface";
import type {
  ICatalogSearchRepository,
  IMessageSearchRepository,
  SearchMessageRow,
  SearchUserBrief,
} from "../../repositories/search.repository.interface";
import type { ReadableScopesService } from "../readable-scopes.service";
import { buildMessageFilter, scanMessages } from "./message-scan";
import { filterVisibleMessages, scopeRefsOf } from "./message-visibility";
import { emptyPage, unique, type Searcher } from "./searcher.types";

/** Vòng lấy thêm tối đa khi lọc quyền/ẩn làm trang hụt (be.md p5-04 §5 "tối đa 2 vòng lấy tiếp" ⇒ 1 + 2 vòng). */
const MAX_ROUNDS = 3;

interface Collected {
  row: SearchMessageRow;
  scopes: ReadableScopes;
}

/**
 * Tìm TIN toàn workspace (`type=messages`): kênh đọc được + nhóm chat là thành viên (+ 1-1 khi `includeDirect`). Quyền tính TRƯỚC
 * truy vấn; MỖI vòng kiểm LẠI quyền hiện tại của các scope trong kết quả (DU-02: thu hồi giữa các trang) và loại tin thu hồi, tin
 * "xoá phía tôi", tin trước mốc `hiddenBeforeSeq`, reply mất tin gốc. Không bao giờ log từ khoá (riêng tư).
 */
export class MessageSearcher implements Searcher<MessageHit> {
  constructor(
    private readonly scopes: ReadableScopesService,
    private readonly messages: IMessageSearchRepository,
    private readonly catalog: ICatalogSearchRepository,
    private readonly clock: () => number = Date.now
  ) {}

  async search(ctx: SearchContext, query: WorkspaceSearchQueryDto): Promise<SearchPage<MessageHit>> {
    const cursor = parseCursorPoint(query.cursor);
    const only: SearchScopeRef[] | undefined = query.scopeType && query.scopeId ? [{ type: query.scopeType, id: query.scopeId }] : undefined;
    const includeDirect = query.includeDirect && !ctx.isGuest;
    const scopeInput = { userId: ctx.userId, workspaceId: ctx.workspaceId, role: ctx.role, includeDirect };

    const readable = await this.scopes.compute({ ...scopeInput, only });
    if (only && readable.channels.size + readable.conversations.size === 0) {
      throw new AppError(ErrorMessages[ErrorCode.SRCH_102], 404, ErrorCode.SRCH_102);
    }
    const filter = buildMessageFilter({ scopes: readable, regexes: ctx.regexes, authorId: query.authorId, hasFile: query.hasFile });
    if (!filter) return emptyPage(query.limit, readable.truncated);

    const deadline = this.clock() + LIMITS.search.workspaceMaxTimeMs;
    const collected: Collected[] = [];
    let point = cursor;
    let hasMore = false;
    let partial = false;
    let last: SearchMessageRow | undefined;

    for (let round = 0; round < MAX_ROUNDS; round += 1) {
      const need = query.limit - collected.length;
      const scan = await scanMessages(this.messages, this.clock, { filter, cursor: point, needed: need + 1, deadline, from: query.from, to: query.to });
      if (scan.timedOutEmpty && collected.length === 0 && round === 0) {
        throw new AppError(ErrorMessages[ErrorCode.SRCH_104], 422, ErrorCode.SRCH_104);
      }
      partial ||= scan.partial || scan.timedOutEmpty;

      const page = scan.rows.slice(0, need);
      hasMore = scan.rows.length > need;
      if (page.length > 0) last = page[page.length - 1];

      const fresh = await this.scopes.compute({ ...scopeInput, only: scopeRefsOf(page) });
      const visible = await filterVisibleMessages(this.messages, ctx.userId, page, fresh, { requireContent: true, checkParents: true });
      for (const row of visible) collected.push({ row, scopes: fresh });

      if (!hasMore || collected.length >= query.limit || !last) break;
      point = { at: last.createdAt, id: last.id };
    }

    const nextCursor = hasMore && last ? encodeCursor(last.createdAt, last.id) : null;
    const data = await this.toHits(collected, ctx.tokens);
    searchRequestsTotal.inc({ scopeType: "WORKSPACE", partial: String(partial) });
    return { data, meta: { nextCursor, hasMore, limit: query.limit, partial, truncated: readable.truncated } };
  }

  private async toHits(collected: Collected[], tokens: readonly string[]): Promise<MessageHit[]> {
    if (collected.length === 0) return [];
    const peerIds = collected.flatMap(({ row, scopes }) => {
      const peer = row.scopeType === "CONVERSATION" ? scopes.conversations.get(row.scopeId)?.peerUserId : null;
      return peer ? [peer] : [];
    });
    const authorIds = collected.flatMap(({ row }) => (row.authorId ? [row.authorId] : []));
    // Tên + ảnh tác giả/người đối diện 1-1: MỘT truy vấn cho cả trang.
    const users = await this.catalog.userBriefs(unique([...authorIds, ...peerIds]));

    return collected.map(({ row, scopes }) => {
      const { snippet, highlights } = buildSnippet(row.content, row.mentions, tokens, LIMITS.search.snippetChars, { wordStart: true });
      const author = row.authorId ? users.get(row.authorId) : undefined;
      return {
        messageId: row.id,
        seq: row.seq,
        scope: this.scopeInfo(row, scopes, users),
        threadId: row.threadId,
        parentMessageId: row.threadId,
        inThread: row.threadId !== null,
        author: { id: row.authorId, name: author?.name ?? null, avatarUrl: avatarUrlOf(author?.avatarAssetId) },
        snippet,
        highlights,
        createdAt: row.createdAt,
        hasAttachments: row.attachments.length > 0,
      };
    });
  }

  private scopeInfo(row: SearchMessageRow, scopes: ReadableScopes, users: ReadonlyMap<string, SearchUserBrief>): MessageScopeInfo {
    if (row.scopeType === "CHANNEL") {
      const c = scopes.channels.get(row.scopeId);
      return { type: "CHANNEL", id: row.scopeId, name: c?.name ?? null, isPrivate: c?.visibility === "PRIVATE" };
    }
    const conv = scopes.conversations.get(row.scopeId);
    const name = conv?.kind === "DIRECT" ? (conv.peerUserId ? users.get(conv.peerUserId)?.name ?? null : null) : conv?.title ?? null;
    return { type: "CONVERSATION", id: row.scopeId, name, isPrivate: true };
  }
}
