import { randomInt } from "crypto";
import { AppError } from "../../../core/exceptions";
import { ErrorCode } from "../../../core/utils/error.codes";

/** 23 ký tự: chữ thường bỏ `i`, `l`, `o` (dễ nhầm khi đọc qua điện thoại) — khớp regex `resolveParamsSchema`. */
export const MEETING_CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz";
export const MEETING_CODE_REGEX = /^[a-hjkmnp-z]{3}-[a-hjkmnp-z]{4}-[a-hjkmnp-z]{3}$/;

const pick = (n: number): string => Array.from({ length: n }, () => MEETING_CODE_ALPHABET[randomInt(MEETING_CODE_ALPHABET.length)]).join("");

/** `abc-defg-hij` — 10 ký tự ngẫu nhiên an toàn mật mã, KHÔNG suy từ id (chống dò mã). */
export function randomMeetingCode(): string {
  return `${pick(3)}-${pick(4)}-${pick(3)}`;
}

/** Sinh mã chưa dùng, thử lại ≤ 5 lần khi trùng (be.md §5.1 bước 4); hết lượt → `SYS_500`. `unique` cuối cùng vẫn do index Mongo bảo vệ. */
export async function nextMeetingCode(exists: (code: string) => Promise<boolean>, generate: () => string = randomMeetingCode): Promise<string> {
  for (let i = 0; i < 5; i += 1) {
    const code = generate();
    if (!(await exists(code))) return code;
  }
  throw new AppError("Không sinh được mã họp duy nhất", 500, ErrorCode.SYS_500);
}
