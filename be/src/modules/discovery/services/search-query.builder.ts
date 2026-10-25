import { LIMITS } from "../../../core/constants/limits";
import { AppError } from "../../../core/exceptions";
import { ErrorCode, ErrorMessages } from "../../../core/utils/error.codes";
import { escapeRegex } from "../../../core/utils/escape-regex";
import { graphemeLength, normalizeSearch } from "../../../core/utils/normalize";
import type { DiscoveryScopeType } from "../entities/discovery.interface";
import { type MongoFilter, oid } from "../../../core/utils/search-query";

// p5-04: các hàm thuần dùng chung (cửa sổ thời gian, Extended JSON) đã nâng lên `core/utils/search-query.ts` — re-export để giữ import cũ.
export {
  type MongoFilter,
  type TimeWindow,
  oid,
  ejsonDate,
  withWindow,
  computeSearchBounds,
  iterateWindows,
} from "../../../core/utils/search-query";

/**
 * Dựng truy vấn tìm (be.md p1-09 §5.4) — TOÀN BỘ là hàm thuần, không I/O, để test
 * escape/tách từ/cửa sổ thời gian mà không cần Mongo.
 *
 * Filter là JSON kiểu Extended JSON (ObjectId → `{ $oid }`, ngày → `{ $date }`) vì
 * chạy qua `prisma.message.findRaw` (cần `maxTimeMS`, Prisma Client thường không có).
 */

const searchError = (code: typeof ErrorCode.SRCH_001 | typeof ErrorCode.SRCH_002): AppError =>
  new AppError(ErrorMessages[code], 400, code);

/**
 * `q` → danh sách từ đã chuẩn hoá (không dấu, chữ thường), bỏ trùng, giữ thứ tự.
 * `SRCH_001` khi `q` (đã trim) ngoài 2–100 grapheme hoặc rỗng sau chuẩn hoá;
 * `SRCH_002` khi vượt `LIMITS.search.maxTerms` từ.
 */
export function parseSearchTerms(q: string): string[] {
  const trimmed = q.trim();
  const length = graphemeLength(trimmed);
  if (length < LIMITS.search.queryMin || length > LIMITS.search.queryMax) throw searchError(ErrorCode.SRCH_001);

  const terms = Array.from(new Set(normalizeSearch(trimmed).split(" ").filter((t) => t.length > 0)));
  if (terms.length === 0) throw searchError(ErrorCode.SRCH_001);
  if (terms.length > LIMITS.search.maxTerms) throw searchError(ErrorCode.SRCH_002);
  return terms;
}

export interface SearchFilterInput {
  scopeType: DiscoveryScopeType;
  scopeId: string;
  terms: readonly string[];
  authorId?: string;
  hasFile?: boolean;
  fileKind?: string;
  /** Chỉ `false` mới lọc: bỏ reply thread (`threadId: null`). */
  includeThreads: boolean;
  /** `ConversationMember.hiddenBeforeSeq` (D-23) — chỉ tin `seq > floor`; `0` → không lọc. */
  floorSeq: number;
}

/**
 * Filter nền (chưa có cửa sổ thời gian/cursor). Luôn kèm `scopeType+scopeId`,
 * `kind ∈ {USER, POLL}`, `deletedAt: null`; mỗi từ → 1 regex ĐÃ escape trên `normalizedContent`
 * (không cờ `i` — nội dung đã lowercase). KHÔNG bao giờ đưa chuỗi người dùng vào
 * regex chưa escape (SAV-04).
 */
export function buildBaseFilter(input: SearchFilterInput): MongoFilter {
  const filter: MongoFilter = {
    scopeType: input.scopeType,
    scopeId: oid(input.scopeId),
    kind: { $in: ["USER", "POLL"] }, // p7-04: khảo sát (`POLL`, content = câu hỏi) tìm được như tin thường; tin hệ thống thì không
    deletedAt: null,
    $and: input.terms.map((t) => ({ normalizedContent: { $regex: escapeRegex(t) } })),
  };
  if (input.authorId) filter.authorId = oid(input.authorId);
  if (input.hasFile) filter["attachments.0"] = { $exists: true };
  if (input.fileKind) filter["attachments.kind"] = input.fileKind;
  if (!input.includeThreads) filter.threadId = null;
  if (input.floorSeq > 0) filter.seq = { $gt: input.floorSeq };
  return filter;
}
