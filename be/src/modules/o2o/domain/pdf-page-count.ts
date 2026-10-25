import { inflateSync } from "zlib";

/**
 * Đếm số trang PDF KHÔNG cần thư viện (p6-05 be.md §5 "Job count-pages") — repo chưa có `pdf-lib`/`pdf-parse` và agent
 * không được cài gói mới. Đủ cho PDF thông thường (Word/Google Docs/LibreOffice/trình duyệt xuất ra, kể cả PDF 1.5+ nén
 * object stream): đọc nút gốc `/Type /Pages` và lấy `/Count` LỚN NHẤT (nút gốc chứa tổng số trang); không có thì đếm lá
 * `/Type /Page`. Khi repo thêm `pdf-lib`, thay thân hàm bằng `PDFDocument.load(buf, { updateMetadata: false }).getPageCount()`
 * mà giữ nguyên chữ ký.
 *
 * Giới hạn an toàn: tối đa `MAX_OBJECT_STREAMS` object stream, mỗi stream giải nén ≤ `MAX_INFLATE_BYTES` (chống zip bomb).
 */
export type PdfPageCountResult = { ok: true; pages: number } | { ok: false; reason: "NOT_PDF" | "UNREADABLE" };

const MAX_OBJECT_STREAMS = 500;
const MAX_INFLATE_BYTES = 20 * 1024 * 1024;

export function isPdfHeader(buf: Buffer): boolean {
  return buf.subarray(0, 1024).toString("latin1").includes("%PDF-");
}

/** Các dict cấp ngoài cùng `<< … >>` trong một đoạn văn bản PDF (bỏ qua dict lồng — chúng nằm trong dict cha). */
function topLevelDicts(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = -1;
  for (let i = 0; i < text.length - 1; i += 1) {
    const pair = text[i] + text[i + 1];
    if (pair === "<<") {
      if (depth === 0) start = i;
      depth += 1;
      i += 1;
    } else if (pair === ">>" && depth > 0) {
      depth -= 1;
      i += 1;
      if (depth === 0 && start >= 0) out.push(text.slice(start, i + 1));
    }
  }
  return out;
}

/** Giải nén các object stream (`/Type /ObjStm` + `/FlateDecode`) — PDF 1.5+ giấu cây trang trong đó. */
function inflateObjectStreams(raw: string): string[] {
  const out: string[] = [];
  const re = /stream\r?\n/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(raw)) !== null && out.length < MAX_OBJECT_STREAMS) {
    const objAt = raw.lastIndexOf(" obj", match.index);
    const header = raw.slice(objAt >= 0 && match.index - objAt < 8192 ? objAt : Math.max(0, match.index - 1024), match.index);
    const dataStart = match.index + match[0].length;
    const end = raw.indexOf("endstream", dataStart);
    if (end < 0) break;
    re.lastIndex = end;
    if (!/\/ObjStm\b/.test(header) || !/\/FlateDecode\b/.test(header)) continue;
    try {
      const data = Buffer.from(raw.slice(dataStart, end), "latin1");
      out.push(inflateSync(data, { maxOutputLength: MAX_INFLATE_BYTES }).toString("latin1"));
    } catch {
      // Stream hỏng/không phải Flate thuần — bỏ qua, các nguồn khác vẫn có thể đủ.
    }
  }
  return out;
}

function maxPagesCount(texts: string[]): number {
  let max = 0;
  for (const text of texts) {
    for (const dict of topLevelDicts(text)) {
      if (!/\/Type\s*\/Pages(?![A-Za-z])/.test(dict)) continue;
      for (const m of dict.matchAll(/\/Count\s+(\d{1,7})(?!\s+\d+\s+R)/g)) max = Math.max(max, Number(m[1]));
    }
  }
  return max;
}

function countLeafPages(texts: string[]): number {
  return texts.reduce((sum, text) => sum + (text.match(/\/Type\s*\/Page(?![A-Za-z])/g)?.length ?? 0), 0);
}

export function countPdfPages(buf: Buffer): PdfPageCountResult {
  if (!isPdfHeader(buf)) return { ok: false, reason: "NOT_PDF" };
  const raw = buf.toString("latin1");
  const texts = [raw, ...inflateObjectStreams(raw)];
  const fromTree = maxPagesCount(texts);
  if (fromTree > 0) return { ok: true, pages: fromTree };
  const leaves = countLeafPages(texts);
  return leaves > 0 ? { ok: true, pages: leaves } : { ok: false, reason: "UNREADABLE" };
}
