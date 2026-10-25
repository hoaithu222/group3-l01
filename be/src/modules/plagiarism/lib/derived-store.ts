import { gunzipSync, gzipSync } from "zlib";
import { storage } from "../../../infrastructure/storage";
import type { DocKind, Posting } from "./types";

/**
 * Tệp dẫn xuất (be.md §2 mô hình dữ liệu, bảng "Tệp dẫn xuất"): văn bản đã trích (giữ dấu để hiển thị — offset của
 * `tokenOffsets`/`postings` tính trên CHÍNH chuỗi này, xem `lib/types.ts` `Token`), bản đồ token → ký tự (để dựng
 * `SpanRange` khi gộp đoạn trùng) và danh sách posting (hash, vị trí token) để đọc lại khi so khớp một cặp ứng viên.
 * KHÔNG lưu trong Mongo (README §2 "chỉ nạp cho cặp ứng viên") — ghi/đọc qua `StorageService` như asset kỹ thuật, không
 * tạo bản ghi `Asset`.
 *
 * Lệch nhỏ so với câu chữ literal của be.md ("tokenOffsets: [startChar][]"): lưu CẶP `[startChar, endChar]` mỗi token
 * (không chỉ startChar) — cần cả hai đầu để dựng `SpanRange.endChar` chính xác khi token cuối một đoạn trùng không liền
 * token kế (dấu câu/khoảng trắng đã bị bỏ lúc chuẩn hoá). `lineBreaks` = offset ký tự của mọi "\n" trong `text`, tăng dần —
 * dùng để tra số dòng bằng tìm nhị phân (`lineOfChar`).
 */
export interface DerivedDocument {
  algoVersion: number;
  kind: DocKind;
  /** Văn bản đã trích (đã cắt `charsMax`, PDF đã bỏ header/footer lặp) — offset mọi token tính trên chuỗi này. */
  text: string;
  /** `[startChar, endChar)` theo thứ tự token — cùng độ dài/thứ tự với `postings` tham chiếu qua `pos`. */
  tokenOffsets: Array<[number, number]>;
  /** Offset ký tự của từng "\n" trong `text`, tăng dần. */
  lineBreaks: number[];
  /** `[hash, tokenPos]` — toàn bộ posting trước khi cắt `hashes` (dùng để dựng đoạn trùng chi tiết cho một cặp ứng viên). */
  postings: Array<[number, number]>;
}

const GZIP_CONTENT_TYPE = "application/gzip";

export function derivedStoreKey(workspaceId: string, resourceId: string, resourceVersion: number, algoVersion: number): string {
  return `derived/plagiarism/${workspaceId}/${resourceId}/v${resourceVersion}-a${algoVersion}.json.gz`;
}

export async function writeDerivedDocument(key: string, doc: DerivedDocument): Promise<void> {
  const json = JSON.stringify(doc);
  const gz = gzipSync(Buffer.from(json, "utf8"));
  await storage.putObject(key, gz, GZIP_CONTENT_TYPE);
}

/** `null` khi tệp không còn tồn tại (nguồn đã purge, hoặc chưa từng lập chỉ mục). */
export async function readDerivedDocument(key: string): Promise<DerivedDocument | null> {
  const head = await storage.head(key);
  if (!head || head.size <= 0) return null;
  const buf = await storage.readRange(key, 0, head.size - 1);
  try {
    const json = gunzipSync(buf).toString("utf8");
    return JSON.parse(json) as DerivedDocument;
  } catch {
    return null;
  }
}

/** Xoá tệp dẫn xuất — an toàn khi gọi lặp (đã xoá/không tồn tại không phải lỗi, be.md PLAG-07/job purge). */
export async function deleteDerivedDocument(key: string): Promise<void> {
  await storage.deleteMany([key]).catch(() => undefined);
}

/** Số dòng (1-based) chứa offset ký tự `charAt` — tìm nhị phân trong `lineBreaks` (offset của mọi "\n", tăng dần). */
export function lineOfChar(lineBreaks: readonly number[], charAt: number): number {
  let lo = 0;
  let hi = lineBreaks.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (lineBreaks[mid] < charAt) lo = mid + 1;
    else hi = mid;
  }
  return lo + 1;
}

/** Đổi `Posting[]` (dạng `lib/pipeline.ts`) sang cặp tuple gọn để lưu tệp dẫn xuất. */
export function postingsToTuples(postings: readonly Posting[]): Array<[number, number]> {
  return postings.map((p): [number, number] => [p.hash, p.pos]);
}
