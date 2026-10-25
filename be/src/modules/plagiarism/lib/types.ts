/** Kiểu dùng chung của thư viện quét trùng lặp (p7-05) — thuần kiểu, không I/O. */

/** Loại tài liệu khi lập chỉ mục (khớp enum `FingerprintKind` của schema kế hoạch). */
export type DocKind = "TEXT" | "CODE";

/** Họ ngôn ngữ mã nguồn của lexer (khớp `DocumentFingerprint.language`). */
export type CodeLanguage = "c-like" | "python" | "sql" | "markup";

export const CODE_LANGUAGES: readonly CodeLanguage[] = ["c-like", "python", "sql", "markup"];

/** Mức trùng theo ngưỡng (khớp enum `PlagiarismLevel`). */
export type PlagiarismLevel = "LOW" | "MEDIUM" | "HIGH";

/**
 * Một token sau chuẩn hoá. `start`/`end` là offset UTF-16 NỬA KHOẢNG [start, end) trong CHUỖI ĐẦU VÀO NGUYÊN TRẠNG
 * (không phải chuỗi đã chuẩn hoá) — nhờ vậy đổi đoạn trùng → ký tự/dòng để tô sáng luôn khớp văn bản gốc, kể cả khi
 * đầu vào là tiếng Việt dạng tổ hợp (NFD).
 */
export interface Token {
  value: string;
  start: number;
  end: number;
}

/**
 * Một fingerprint của winnowing. `hash` là số nguyên có dấu 32 bit (nhét thẳng vào Prisma `Int[]`, vốn chỉ nhận int32);
 * `pos` là chỉ số token nơi k-gram bắt đầu.
 */
export interface Posting {
  hash: number;
  pos: number;
}

/**
 * Khoảng vị trí của một đoạn trùng trong MỘT tài liệu (khớp composite type `SpanRange` của schema kế hoạch).
 * Token: nửa khoảng [startToken, endToken). Ký tự: nửa khoảng [startChar, endChar). Dòng: đánh số từ 1, đóng cả hai đầu.
 */
export interface SpanRange {
  startToken: number;
  endToken: number;
  startChar: number;
  endChar: number;
  lineStart: number;
  lineEnd: number;
}
