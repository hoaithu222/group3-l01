/**
 * Đọc phần payload của JWT — KHÔNG kiểm chữ ký.
 *
 * ⛔ Đây KHÔNG phải kiểm tra bảo mật. Bất kỳ ai cũng tự ký được một token có
 * `"roles": ["admin"]` và hàm này sẽ đọc ra đúng như vậy. Quyết định sống/chết
 * của phiên và quyền hạn thật là việc của MÁY CHỦ.
 *
 * Chỉ dùng cho việc hiển thị và cho các quyết định "đoán trước" mà đoán sai
 * cũng không sao — vd biết token sắp hết hạn để chủ động refresh thay vì đợi
 * ăn 401.
 *
 * ── Vì sao tự giải mã base64 thay vì dùng `atob` ─────────────────────────────
 * Hermes (máy JS của React Native) KHÔNG có `atob`/`btoa` — chúng là API của
 * trình duyệt. Code chép từ web sang chạy được trên Expo Go (bản web) rồi nổ
 * `ReferenceError: atob is not defined` trên máy thật. Nên ở đây giải mã bằng
 * tay, không phụ thuộc gì cả (cũng không cần thêm gói `base-64`).
 */

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Giải base64url (`-`/`_`, không đệm `=`) thành chuỗi byte. */
function decodeBase64Url(input: string): string {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  let output = '';
  let buffer = 0;
  let bits = 0;

  for (const char of normalized) {
    if (char === '=') break;
    const value = BASE64_ALPHABET.indexOf(char);
    if (value === -1) continue; // ký tự lạ (xuống dòng…) — bỏ qua
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      output += String.fromCharCode((buffer >> bits) & 0xff);
    }
  }
  return output;
}

/**
 * Chuỗi byte → chuỗi UTF-8.
 *
 * Bắt buộc phải có: tên người dùng trong token gần như luôn có dấu tiếng Việt,
 * mà mỗi ký tự có dấu chiếm 2–3 byte trong UTF-8. Bỏ bước này thì "Nguyễn" đọc
 * ra "NguyÃªn".
 */
function bytesToUtf8(bytes: string): string {
  let result = '';
  for (let i = 0; i < bytes.length; i += 1) {
    const byte = bytes.charCodeAt(i);

    if (byte < 0x80) {
      result += String.fromCharCode(byte);
    } else if (byte >= 0xc0 && byte < 0xe0) {
      result += String.fromCharCode(((byte & 0x1f) << 6) | (bytes.charCodeAt(i + 1) & 0x3f));
      i += 1;
    } else if (byte >= 0xe0 && byte < 0xf0) {
      result += String.fromCharCode(
        ((byte & 0x0f) << 12) |
          ((bytes.charCodeAt(i + 1) & 0x3f) << 6) |
          (bytes.charCodeAt(i + 2) & 0x3f),
      );
      i += 2;
    } else {
      // 4 byte (ngoài mặt phẳng cơ bản — emoji). Dựng lại thành cặp thay thế.
      const codePoint =
        (((byte & 0x07) << 18) |
          ((bytes.charCodeAt(i + 1) & 0x3f) << 12) |
          ((bytes.charCodeAt(i + 2) & 0x3f) << 6) |
          (bytes.charCodeAt(i + 3) & 0x3f)) -
        0x10000;
      result += String.fromCharCode(0xd800 + (codePoint >> 10), 0xdc00 + (codePoint & 0x3ff));
      i += 3;
    }
  }
  return result;
}

/** Payload của JWT, hoặc `null` khi token không đọc được. */
export function decodeJwtPayload<T = Record<string, unknown>>(token: string): T | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    return JSON.parse(bytesToUtf8(decodeBase64Url(payload))) as T;
  } catch {
    return null;
  }
}

/**
 * Token còn hạn (đã trừ biên an toàn) hay chưa?
 *
 * ⛔ Token KHÔNG giải mã được, hoặc không khai `exp` ⇒ coi là CÒN hạn.
 * Nghe ngược đời, nhưng đúng: quyết định sống/chết của phiên là việc của máy
 * chủ. Đoán sai theo hướng "hết hạn" thì client TỰ đăng xuất một phiên vẫn tốt —
 * người dùng mất việc đang làm dở. Đoán sai theo hướng "còn hạn" thì cùng lắm
 * là một request ăn 401, và luồng refresh xử lý tiếp.
 */
export function isTokenFresh(token: string | null, leewayMs: number): boolean {
  if (!token) return false;
  const payload = decodeJwtPayload<{ exp?: number }>(token);
  if (!payload || typeof payload.exp !== 'number') return true;
  return payload.exp * 1000 - Date.now() > leewayMs;
}
