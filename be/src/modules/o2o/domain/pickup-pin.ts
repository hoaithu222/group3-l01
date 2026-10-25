import { randomInt } from "crypto";
import { hmacSha256Hex, timingSafeEqualHex } from "../../../core/utils/crypto";

/**
 * PIN nhận hàng 6 số (p6-05 README §2 "PIN"): sinh bằng CSPRNG, chỉ lưu `pinHash = HMAC-SHA256(ENCRYPTION_KEY, "<orderId>:<pin>")`
 * (gắn orderId ⇒ cùng PIN ở hai đơn cho hai hash khác nhau), so khớp bằng thời gian hằng. PIN thô chỉ trả cho chủ đơn đúng MỘT
 * lần (submit / tạo PIN mới) — không log, không lưu, không có trong socket/thông báo.
 */
export const PIN_PATTERN = /^\d{6}$/;

export function generatePin(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function hashPin(orderId: string, pin: string): string {
  return hmacSha256Hex(`${orderId}:${pin}`);
}

export function verifyPin(orderId: string, pin: string, pinHash: string | null): boolean {
  if (!pinHash || !PIN_PATTERN.test(pin)) return false;
  return timingSafeEqualHex(hashPin(orderId, pin), pinHash);
}

/** Bảng chữ không gây nhầm (bỏ 0/O, 1/I/L) cho mã đơn đọc to tại quầy. */
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/** Mã đơn "PO-7K2M9Q" (unique ở DB — đụng thì sinh lại). */
export function generateOrderCode(): string {
  let s = "";
  for (let i = 0; i < 6; i += 1) s += CODE_ALPHABET[randomInt(0, CODE_ALPHABET.length)];
  return `PO-${s}`;
}
