/**
 * Id do client sinh cho một ý định gửi (`Idempotency-Key` 8–128 ký tự, `clientMessageId` 8–64 ký tự của BE). `crypto.randomUUID` chỉ có ở ngữ cảnh an toàn
 * (HTTPS/localhost) — dự phòng để mở admin qua `http://192.168.x.x` không vỡ luôn nút gửi. KHÔNG phải định danh bảo mật.
 */
export function makeClientId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  }
}
