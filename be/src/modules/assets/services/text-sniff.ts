/**
 * Kiểm "trông có phải văn bản thuần không" cho MIME không có magic bytes (`text/plain`, `text/csv`,
 * `text/markdown`, `application/json`) — `file-type` trả `undefined` cho các loại này nên `asset-processor`
 * không thể dựa vào chữ ký nhị phân như ảnh/PDF. Tiêu chí: không có byte NUL và là UTF-8 hợp lệ.
 */

/** Cắt phần đuôi là 1 ký tự UTF-8 bị chặn giữa chừng (mẫu chỉ là 4 KiB đầu của tệp lớn hơn). */
function trimIncompleteUtf8Tail(buf: Buffer): Buffer {
  const lowest = Math.max(0, buf.length - 4);
  for (let i = buf.length - 1; i >= lowest; i -= 1) {
    const byte = buf.readUInt8(i);
    if ((byte & 0xc0) === 0x80) continue; // byte nối tiếp — tìm tiếp byte dẫn
    if (byte < 0xc0) return buf; // ASCII — không có ký tự dở
    const needed = byte >= 0xf0 ? 4 : byte >= 0xe0 ? 3 : 2;
    return buf.length - i < needed ? buf.subarray(0, i) : buf;
  }
  return buf;
}

/**
 * @param truncated `true` khi `sample` chỉ là phần đầu của tệp (có thể cắt giữa 1 ký tự nhiều byte) — bỏ qua
 * ký tự dở ở cuối thay vì coi là UTF-8 sai.
 */
export function looksLikePlainText(sample: Buffer, truncated: boolean): boolean {
  if (sample.includes(0)) return false;
  const body = truncated ? trimIncompleteUtf8Tail(sample) : sample;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(body);
    return true;
  } catch {
    return false;
  }
}
