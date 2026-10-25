/**
 * @file jwt.utils.ts
 * @description Decode payload (base64url) của JWT phía client — KHÔNG verify chữ ký.
 * Dùng để đọc claim (vd account id) khi `user` object chưa được set lúc mới đăng nhập.
 */

/** Decode payload JWT → object claims. Trả null nếu token rỗng/hỏng. */
export function decodeJwtPayload<T = Record<string, unknown>>(
  token: string | null | undefined,
): T | null {
  if (!token) return null;
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const binary = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    /**
     * ⛔ KHÔNG `JSON.parse(atob(...))` thẳng.
     *
     * `atob` trả chuỗi latin1 (mỗi ký tự = MỘT byte), nên claim tiếng Việt bị
     * đọc sai từng byte: "Nguyễn Văn A" ra "Nguyá»…n VÄƒn A". Tệ nhất là
     * `JSON.parse` KHÔNG ném lỗi — chuỗi vẫn hợp lệ về cú pháp, chỉ sai nội
     * dung, nên hỏng hoàn toàn im lặng.
     *
     * Dựng lại mảng byte rồi để `TextDecoder` giải UTF-8 cho đúng.
     */
    const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
    return JSON.parse(new TextDecoder('utf-8').decode(bytes)) as T;
  } catch {
    return null;
  }
}

/** Các claim thường chứa account id (GUID) trong IdentityServer. */
const USER_ID_CLAIMS = [
  'sub',
  'nameid',
  'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier',
] as const;

/** Lấy account id từ JWT — thử lần lượt các claim phổ biến. */
export function getUserIdFromToken(token: string | null | undefined): string | null {
  const payload = decodeJwtPayload<Record<string, unknown>>(token);
  if (!payload) return null;
  for (const claim of USER_ID_CLAIMS) {
    const value = payload[claim];
    if (typeof value === 'string' && value) return value;
  }
  return null;
}
