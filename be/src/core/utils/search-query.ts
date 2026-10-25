import { ValidationError } from "../exceptions";
import { decodeCursor } from "./cursor";
import { escapeRegex } from "./escape-regex";
import { graphemeLength, normalizeSearch } from "./normalize";

/**
 * Bộ dựng truy vấn tìm dùng chung (p5-04 be.md §1 việc 2, nâng từ p1-09) — TOÀN BỘ là hàm thuần, không I/O:
 * tách từ, biểu thức chính quy neo đầu từ, cửa sổ thời gian mới → cũ, filter dạng Extended JSON cho `findRaw`.
 * Lỗi nghiệp vụ (`SRCH_*`) do module gọi ném — ở đây chỉ trả `valid`/kết quả.
 */

export type MongoFilter = Record<string, unknown>;

export const oid = (id: string): { $oid: string } => ({ $oid: id });
export const ejsonDate = (d: Date): { $date: string } => ({ $date: d.toISOString() });

// ── Từ khoá ──────────────────────────────────────────────────────────────────

export interface TokenizeOptions {
  /** Độ dài tối thiểu/tối đa của `q` (đã trim) tính bằng grapheme. */
  min: number;
  max: number;
  /** Số từ tối đa giữ lại sau chuẩn hoá (thừa → cắt, không lỗi). */
  maxTokens: number;
}

export interface Tokenized {
  /** `q` đã trim. */
  query: string;
  /** Độ dài `query` theo grapheme. */
  length: number;
  /** `false` khi ngoài `[min, max]` grapheme hoặc không còn từ nào sau chuẩn hoá. */
  valid: boolean;
  /** Từ đã `normalizeSearch` (thường, không dấu), bỏ trùng, giữ thứ tự, ≤ `maxTokens`. */
  tokens: string[];
  /** Mẫu neo đầu từ tương ứng từng token — dùng thẳng làm `$regex` (đã escape) hoặc `new RegExp`. */
  regexes: string[];
}

/** Ranh giới đầu từ trên chuỗi đã chuẩn hoá (`a-z0-9`): đầu chuỗi hoặc ký tự không phải chữ/số. */
const WORD_START = "(^|[^a-z0-9])";

/** Mẫu khớp `token` (đã chuẩn hoá) ở ĐẦU một từ; mọi ký tự đặc biệt của token bị escape (chống ReDoS). */
export function wordStartPattern(token: string): string {
  return `${WORD_START}${escapeRegex(token)}`;
}

export function tokenize(q: string, opts: TokenizeOptions): Tokenized {
  const query = q.trim();
  const length = graphemeLength(query);
  const all = Array.from(new Set(normalizeSearch(query).split(" ").filter((t) => t.length > 0)));
  const tokens = all.slice(0, opts.maxTokens);
  return {
    query,
    length,
    valid: length >= opts.min && length <= opts.max && tokens.length > 0,
    tokens,
    regexes: tokens.map(wordStartPattern),
  };
}

/** Kiểm cùng ngữ nghĩa với `$regex` ở trên trên một chuỗi ĐÃ chuẩn hoá — dùng để lọc lại / tô đậm phía server. */
export function matchesAllTokens(normalizedText: string, tokens: readonly string[]): boolean {
  return tokens.every((t) => new RegExp(wordStartPattern(t)).test(normalizedText));
}

const VN_VARIANTS: Record<string, string> = {
  a: "àáảãạăằắẳẵặâầấẩẫậ",
  e: "èéẻẽẹêềếểễệ",
  i: "ìíỉĩị",
  o: "òóỏõọôồốổỗộơờớởỡợ",
  u: "ùúủũụưừứửữự",
  y: "ỳýỷỹỵ",
  d: "đ",
};
/** Dải dấu tổ hợp U+0300–U+036F (khớp `normalizeSearch`) — tên tệp NFD của macOS tách dấu khỏi chữ cái. */
const COMBINING_MARKS = "[̀-ͯ]*";

/**
 * Mẫu `$regex` (dùng kèm `$options: "i"`) khớp `token` (đã chuẩn hoá, không dấu) TRÊN TÊN GỐC còn dấu: mỗi chữ cái a/e/i/o/u/y/d
 * mở rộng thành lớp gồm mọi biến thể có dấu (cả HOA) + dấu tổ hợp tuỳ chọn; ký tự khác được escape. Chỉ dùng để LỌC THÔ trong Mongo —
 * kết quả luôn được kiểm lại bằng `matchesAllTokens(normalizeSearch(name), tokens)`.
 */
export function diacriticInsensitivePattern(token: string): string {
  let out = "";
  for (const ch of token) {
    const variants = VN_VARIANTS[ch];
    if (variants) {
      const chars = `${ch}${ch.toUpperCase()}${variants}${variants.toUpperCase()}`;
      out += `[${chars}]${COMBINING_MARKS}`;
    } else {
      out += escapeRegex(ch);
    }
  }
  return out;
}

// ── Cursor ───────────────────────────────────────────────────────────────────

export interface CursorPoint {
  at: Date;
  id: string;
}

/**
 * Giải mã tham số `cursor` (`encodeCursor(at, id)`); `undefined` khi vắng. Hỏng / `id` không phải ObjectId → 400 `VAL_001`
 * (id đi vào truy vấn `$oid`/Prisma nên phải là ObjectId hợp lệ).
 */
export function parseCursorPoint(raw: string | undefined): CursorPoint | undefined {
  if (raw === undefined || raw === "") return undefined;
  const decoded = decodeCursor(raw);
  if (!decoded || !/^[0-9a-fA-F]{24}$/.test(decoded.id)) throw new ValidationError("Cursor không hợp lệ");
  return decoded;
}

// ── Cửa sổ thời gian mới → cũ ────────────────────────────────────────────────

export interface TimeWindow {
  /** Bao gồm. */
  gte: Date;
  /** Không bao gồm. */
  lt: Date;
}

/** Điều kiện "cũ hơn cursor" theo `(field, _id)` giảm dần — `field` mặc định `createdAt` (cuộc họp dùng `startAt`). */
export function beforeCursor(cursor: CursorPoint, field = "createdAt"): MongoFilter {
  return {
    $or: [{ [field]: { $lt: ejsonDate(cursor.at) } }, { [field]: ejsonDate(cursor.at), _id: { $lt: oid(cursor.id) } }],
  };
}

/** Ghép cửa sổ `[gte, lt)` (+ điều kiện tie-break `(createdAt, _id)` của cursor nếu có) vào filter nền. */
export function withWindow(base: MongoFilter, window: TimeWindow, cursor?: CursorPoint): MongoFilter {
  const and = [...((base.$and as MongoFilter[] | undefined) ?? [])];
  if (cursor) and.push(beforeCursor(cursor));
  const next: MongoFilter = { ...base, createdAt: { $gte: ejsonDate(window.gte), $lt: ejsonDate(window.lt) } };
  // Mongo từ chối `$and: []` — chỉ ghép khi có điều kiện.
  if (and.length > 0) next.$and = and;
  else delete next.$and;
  return next;
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** Độ lệch đồng hồ cho phép giữa app server và DB khi chặn trên bằng "bây giờ". */
const CLOCK_SKEW_MS = 5 * 60 * 1000;

/**
 * Khoảng quét `[lower, upper)`: `upper` = min(bây giờ + lệch đồng hồ, `to` + 1ms, `cursor.at` + 1ms — 1ms để còn lấy các bản ghi
 * CÙNG mili-giây với cursor, việc chọn đúng bản ghi nào do điều kiện `_id` trong `withWindow` lo); `lower` = `from` hoặc `fallbackLower`
 * (mặc định epoch).
 */
export function computeSearchBounds(opts: {
  from?: Date;
  to?: Date;
  cursor?: CursorPoint;
  now: Date;
  fallbackLower?: Date;
}): { upper: Date; lower: Date } {
  let upper = opts.now.getTime() + CLOCK_SKEW_MS;
  if (opts.to) upper = Math.min(upper, opts.to.getTime() + 1);
  if (opts.cursor) upper = Math.min(upper, opts.cursor.at.getTime() + 1);
  return { upper: new Date(upper), lower: opts.from ?? opts.fallbackLower ?? new Date(0) };
}

/**
 * Cửa sổ thời gian liên tiếp MỚI → CŨ, nhỏ trước (7 ngày) rồi nhân `factor` mỗi bước: từ khoá phổ biến dừng ngay ở cửa sổ đầu,
 * từ khoá hiếm quét dần lịch sử; hết ngân sách thời gian giữa chừng thì các cửa sổ mới hơn đã có kết quả (`partial: true`).
 */
export function* iterateWindows(upper: Date, lower: Date, firstWindowMs: number = 7 * DAY_MS, factor = 8): Generator<TimeWindow> {
  const floor = lower.getTime();
  let end = upper.getTime();
  let size = firstWindowMs;
  while (end > floor) {
    const start = Math.max(floor, end - size);
    yield { gte: new Date(start), lt: new Date(end) };
    end = start;
    size *= factor;
  }
}

/** Lùi `months` tháng lịch từ `now` (kẹp ngày cuối tháng) — mốc "lookback" mặc định của tìm toàn workspace. */
export function monthsAgo(now: Date, months: number): Date {
  const d = new Date(now.getTime());
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d;
}
