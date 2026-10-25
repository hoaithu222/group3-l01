/** base64 ↔ bytes cho môi trường trình duyệt/WebView (không `Buffer`). */

const BASE64_RE = /^[A-Za-z0-9+/]*={0,2}$/;

export function isBase64(value: string): boolean {
  return value.length % 4 === 0 && BASE64_RE.test(value);
}

export function bytesFromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Giải base64url (JWT) → chuỗi UTF-8; lỗi → `null`. */
export function utf8FromBase64Url(value: string): string | null {
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
    return new TextDecoder().decode(bytesFromBase64(padded));
  } catch {
    return null;
  }
}
