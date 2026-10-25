import { LIMITS } from "../../../../core/constants/limits";
import {
  type CursorPoint,
  type MongoFilter,
  computeSearchBounds,
  iterateWindows,
  monthsAgo,
  oid,
  withWindow,
} from "../../../../core/utils/search-query";
import type { ReadableScopes } from "../../entities/search.interface";
import type { IMessageSearchRepository, SearchMessageRow } from "../../repositories/search.repository.interface";

export interface MessageFilterInput {
  scopes: ReadableScopes;
  regexes: readonly string[];
  authorId?: string;
  hasFile?: boolean;
}

/**
 * Filter nền của tìm tin toàn workspace (Extended JSON cho `findRaw`): tin người dùng chưa thu hồi, thuộc tập scope đọc được,
 * mỗi từ khoá → 1 regex neo đầu từ ĐÃ escape trên `normalizedContent`. Nếu tập rỗng trả `null` (không truy vấn).
 */
export function buildMessageFilter(input: MessageFilterInput): MongoFilter | null {
  const or: MongoFilter[] = [];
  if (input.scopes.channels.size > 0) {
    or.push({ scopeType: "CHANNEL", scopeId: { $in: [...input.scopes.channels.keys()].map(oid) } });
  }
  if (input.scopes.conversations.size > 0) {
    or.push({ scopeType: "CONVERSATION", scopeId: { $in: [...input.scopes.conversations.keys()].map(oid) } });
  }
  if (or.length === 0) return null;

  const filter: MongoFilter = { kind: { $in: ["USER", "POLL"] }, deletedAt: null, $or: or };
  // Mongo từ chối `$and: []` — tìm tệp không lọc theo nội dung.
  if (input.regexes.length > 0) filter.$and = input.regexes.map((r) => ({ normalizedContent: { $regex: r } }));
  if (input.authorId) filter.authorId = oid(input.authorId);
  if (input.hasFile) filter["attachments.0"] = { $exists: true };
  return filter;
}

export interface ScanResult {
  rows: SearchMessageRow[];
  /** Hết ngân sách giữa chừng nhưng đã có kết quả mới hơn. */
  partial: boolean;
  /** Hết ngân sách mà CHƯA có kết quả nào — người gọi trả `SRCH_104`. */
  timedOutEmpty: boolean;
}

export interface ScanInput {
  filter: MongoFilter;
  cursor?: CursorPoint;
  needed: number;
  deadline: number;
  from?: Date;
  to?: Date;
}

/**
 * Quét cửa sổ thời gian mới → cũ (7 ngày × 8…) tới khi đủ `needed` dòng hoặc hết ngân sách `deadline` (epoch ms). Khoảng lùi mặc định
 * `LIMITS.search.defaultLookbackMonths` khi không có `from`. Điều kiện tie-break `(createdAt,_id)` của cursor chỉ cần ở cửa sổ đầu.
 */
export async function scanMessages(repo: IMessageSearchRepository, clock: () => number, input: ScanInput): Promise<ScanResult> {
  const now = new Date(clock());
  const { upper, lower } = computeSearchBounds({
    from: input.from,
    to: input.to,
    cursor: input.cursor,
    now,
    fallbackLower: monthsAgo(now, LIMITS.search.defaultLookbackMonths),
  });

  const rows: SearchMessageRow[] = [];
  let first = true;
  for (const window of iterateWindows(upper, lower)) {
    const remaining = Math.floor(input.deadline - clock());
    if (remaining <= 0) return { rows, partial: rows.length > 0, timedOutEmpty: rows.length === 0 };
    const result = await repo.search(withWindow(input.filter, window, first ? input.cursor : undefined), input.needed - rows.length, remaining);
    first = false;
    if (result.timedOut) return { rows, partial: rows.length > 0, timedOutEmpty: rows.length === 0 };
    rows.push(...result.rows);
    if (rows.length >= input.needed) break;
  }
  return { rows, partial: false, timedOutEmpty: false };
}
