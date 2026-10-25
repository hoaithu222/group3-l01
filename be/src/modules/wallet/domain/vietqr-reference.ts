import { randomInt } from "crypto";

/**
 * Bảng chữ cái bỏ ký tự dễ nhầm (`I`, `O`, `0`, `1`) — người dùng gõ tay mã này
 * vào nội dung chuyển khoản nên tránh nhầm khi đọc.
 */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const SETTLEMENT_CODE_LENGTH = 8;
export const SETTLEMENT_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{8}$/;

/** Mã tham chiếu 8 ký tự cho nội dung chuyển khoản `SA <mã>` (README §2 "VietQR"). */
export function generateSettlementCode(): string {
  let out = "";
  for (let i = 0; i < SETTLEMENT_CODE_LENGTH; i += 1) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

export function isValidSettlementCode(code: string): boolean {
  return SETTLEMENT_CODE_PATTERN.test(code);
}
