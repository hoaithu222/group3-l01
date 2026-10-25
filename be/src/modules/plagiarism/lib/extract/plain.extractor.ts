import type { TextExtractionInput, TextExtractionResult, TextExtractor } from "./extractor.types";

/** Ký tự điều khiển (trừ tab và xuống dòng) → dấu cách; viết bằng `\p{Cc}` để không phải đặt ký tự điều khiển vào regex. */
const CONTROL_EXCEPT_TAB_LF = /(?![\t\n])\p{Cc}/gu;

/**
 * Giải mã tệp văn bản/mã nguồn thành chuỗi chuẩn cho mọi bước sau: UTF-8 (mặc định), UTF-16 LE/BE khi có BOM (Notepad
 * "Unicode" trên Windows hay lưu .txt kiểu này — tiếng Việt sẽ thành rác nếu đọc như UTF-8); bỏ BOM; "\r\n" và "\r" → "\n"
 * (offset/số dòng chỉ dựa trên "\n"); ký tự điều khiển → dấu cách. Byte UTF-8 hỏng thành U+FFFD, không ném lỗi.
 */
export function decodeTextBuffer(buffer: Buffer): string {
  let text: string;
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    text = buffer.subarray(2, 2 + ((buffer.length - 2) & ~1)).toString("utf16le");
  } else if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    text = Buffer.from(buffer.subarray(2, 2 + ((buffer.length - 2) & ~1))).swap16().toString("utf16le");
  } else {
    text = buffer.toString("utf8");
  }
  return text.replace(/^\u{FEFF}/u, "").replace(/\r\n?/g, "\n").replace(CONTROL_EXCEPT_TAB_LF, " ");
}

/** Cắt về tối đa `charsMax` đơn vị UTF-16 (không cắt đôi cặp thay thế/emoji); `truncated` báo có cắt (be.md §5.1 bước 3). */
export function capText(text: string, charsMax: number): { text: string; truncated: boolean } {
  if (text.length <= charsMax) return { text, truncated: false };
  let end = Math.max(0, charsMax);
  const last = end > 0 ? text.charCodeAt(end - 1) : 0;
  if (last >= 0xd800 && last <= 0xdbff) end--;
  return { text: text.slice(0, end), truncated: true };
}

/** Trình trích cho TXT và mã nguồn: giải mã + cắt trần. Không có ký tự nào ngoài khoảng trắng → `NO_TEXT`. */
export function extractPlainText(input: TextExtractionInput): TextExtractionResult {
  const { text, truncated } = capText(decodeTextBuffer(input.buffer), input.charsMax);
  return text.trim() === "" ? { ok: false, reason: "NO_TEXT" } : { ok: true, text, truncated };
}

export const plainExtractor: TextExtractor = {
  id: "plain",
  extract: (input) => Promise.resolve(extractPlainText(input)),
};
