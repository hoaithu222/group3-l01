/**
 * Chỉ mục phân số (fractional index) cho `Task.position` — cài đặt TỰ VIẾT, TƯƠNG THÍCH KHOÁ với gói
 * `fractional-indexing@3.2.0` (rocicorp, CC0) mà app dùng: cùng bảng chữ số base62 mặc định, cùng phép
 * `generateKeyBetween`/`generateNKeysBetween` ⇒ khoá BE sinh ra app so sánh/chèn tiếp được và ngược lại.
 *
 * LÝ DO tự cài: gói npm là ESM-only (`"type": "module"`) còn BE là CommonJS + ts-jest ⇒ không import được
 * trong build/test. Thuật toán (midpoint + tăng/giảm phần nguyên) chép nguyên logic của gói; vector đối chiếu
 * sinh từ chính gói 3.2.0 nằm ở `tests/fixtures/fractional-indexing-vectors.json`.
 *
 * Thứ tự so sánh là so sánh chuỗi theo mã ký tự (`<`/`>`; Mongo so sánh nhị phân) — KHÔNG dùng localeCompare.
 */
import { LIMITS } from "../../../core/constants/limits";

export const BASE_62_DIGITS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

const SMALLEST_INTEGER_ZEROS = 26;

/** `a` có thể rỗng, `b` null hoặc khác rỗng; `a < b` khi `b` khác null; không có số 0 ở cuối. */
function midpoint(a: string, b: string | null, digits: string): string {
  const zero = digits[0];
  if (b !== null && a >= b) throw new Error(`${a} >= ${b}`);
  if (a.slice(-1) === zero || (b && b.slice(-1) === zero)) throw new Error("trailing zero");
  if (b) {
    // Bỏ tiền tố chung dài nhất (đệm `a` bằng 0 khi đi qua).
    let n = 0;
    while ((a[n] || zero) === b[n]) n++;
    if (n > 0) return b.slice(0, n) + midpoint(a.slice(n), b.slice(n), digits);
  }
  const digitA = a ? digits.indexOf(a[0]) : 0;
  const digitB = b !== null ? digits.indexOf(b[0]) : digits.length;
  if (digitB - digitA > 1) return digits[Math.round(0.5 * (digitA + digitB))];
  // Hai chữ số đầu liền kề.
  if (b && b.length > 1) return b.slice(0, 1);
  return digits[digitA] + midpoint(a.slice(1), null, digits);
}

function getIntegerLength(head: string): number {
  if (head >= "a" && head <= "z") return head.charCodeAt(0) - "a".charCodeAt(0) + 2;
  if (head >= "A" && head <= "Z") return "Z".charCodeAt(0) - head.charCodeAt(0) + 2;
  throw new Error(`invalid order key head: ${head}`);
}

function validateInteger(int: string): void {
  if (int.length !== getIntegerLength(int[0])) throw new Error(`invalid integer part of order key: ${int}`);
}

function getIntegerPart(key: string): string {
  const length = getIntegerLength(key[0]);
  if (length > key.length) throw new Error(`invalid order key: ${key}`);
  return key.slice(0, length);
}

function validateOrderKey(key: string, digits: string): void {
  if (key === "A" + digits[0].repeat(SMALLEST_INTEGER_ZEROS)) throw new Error(`invalid order key: ${key}`);
  const integer = getIntegerPart(key);
  if (key.slice(integer.length).slice(-1) === digits[0]) throw new Error(`invalid order key: ${key}`);
}

/** Có thể trả `null` khi đã là số nguyên lớn nhất. */
function incrementInteger(x: string, digits: string): string | null {
  validateInteger(x);
  const [head, ...digs] = x.split("");
  let carry = true;
  for (let i = digs.length - 1; carry && i >= 0; i--) {
    const d = digits.indexOf(digs[i]) + 1;
    if (d === digits.length) {
      digs[i] = digits[0];
    } else {
      digs[i] = digits[d];
      carry = false;
    }
  }
  if (!carry) return head + digs.join("");
  if (head === "Z") return "a" + digits[0];
  if (head === "z") return null;
  const h = String.fromCharCode(head.charCodeAt(0) + 1);
  if (h > "a") digs.push(digits[0]);
  else digs.pop();
  return h + digs.join("");
}

/** Có thể trả `null` khi đã là số nguyên nhỏ nhất. */
function decrementInteger(x: string, digits: string): string | null {
  validateInteger(x);
  const [head, ...digs] = x.split("");
  let borrow = true;
  for (let i = digs.length - 1; borrow && i >= 0; i--) {
    const d = digits.indexOf(digs[i]) - 1;
    if (d === -1) {
      digs[i] = digits.slice(-1);
    } else {
      digs[i] = digits[d];
      borrow = false;
    }
  }
  if (!borrow) return head + digs.join("");
  if (head === "a") return "Z" + digits.slice(-1);
  if (head === "A") return null;
  const h = String.fromCharCode(head.charCodeAt(0) - 1);
  if (h < "Z") digs.push(digits.slice(-1));
  else digs.pop();
  return h + digs.join("");
}

/** Khoá nằm giữa `a` (null = đầu) và `b` (null = cuối); ném lỗi nếu `a >= b` hoặc khoá sai định dạng. */
export function generateKeyBetween(a: string | null, b: string | null, digits: string = BASE_62_DIGITS): string {
  if (a !== null) validateOrderKey(a, digits);
  if (b !== null) validateOrderKey(b, digits);
  if (a !== null && b !== null && a >= b) throw new Error(`${a} >= ${b}`);

  if (a === null) {
    if (b === null) return "a" + digits[0];
    const ib = getIntegerPart(b);
    const fb = b.slice(ib.length);
    if (ib === "A" + digits[0].repeat(SMALLEST_INTEGER_ZEROS)) return ib + midpoint("", fb, digits);
    if (ib < b) return ib;
    const res = decrementInteger(ib, digits);
    if (res === null) throw new Error("cannot decrement any more");
    return res;
  }

  if (b === null) {
    const ia = getIntegerPart(a);
    const fa = a.slice(ia.length);
    const i = incrementInteger(ia, digits);
    return i === null ? ia + midpoint(fa, null, digits) : i;
  }

  const ia = getIntegerPart(a);
  const fa = a.slice(ia.length);
  const ib = getIntegerPart(b);
  const fb = b.slice(ib.length);
  if (ia === ib) return ia + midpoint(fa, fb, digits);
  const i = incrementInteger(ia, digits);
  if (i === null) throw new Error("cannot increment any more");
  if (i < b) return i;
  return ia + midpoint(fa, null, digits);
}

/** `n` khoá phân biệt, đã sắp xếp, nằm giữa `a` và `b`. `(null, null, n)` → `a0, a1, …`. */
export function generateNKeysBetween(
  a: string | null,
  b: string | null,
  n: number,
  digits: string = BASE_62_DIGITS
): string[] {
  if (n === 0) return [];
  if (n === 1) return [generateKeyBetween(a, b, digits)];
  if (b === null) {
    let c = generateKeyBetween(a, b, digits);
    const result = [c];
    for (let i = 0; i < n - 1; i++) {
      c = generateKeyBetween(c, b, digits);
      result.push(c);
    }
    return result;
  }
  if (a === null) {
    let c = generateKeyBetween(a, b, digits);
    const result = [c];
    for (let i = 0; i < n - 1; i++) {
      c = generateKeyBetween(a, c, digits);
      result.push(c);
    }
    return result.reverse();
  }
  const mid = Math.floor(n / 2);
  const c = generateKeyBetween(a, b, digits);
  return [...generateNKeysBetween(a, c, mid, digits), c, ...generateNKeysBetween(c, b, n - mid - 1, digits)];
}

/** Wrapper theo be.md p3-02: khoá giữa hai hàng xóm hiện tại (null = biên cột). */
export function between(a: string | null, b: string | null): string {
  return generateKeyBetween(a, b);
}

/** `n` khoá đều cho cả cột (job rebalance): `a0, a1, …` — ngắn, giữ nguyên thứ tự. */
export function evenKeys(n: number): string[] {
  return generateNKeysBetween(null, null, n);
}

/** Khoá vượt `LIMITS.board.positionKeyMaxLength` (50) → xếp job `board.rebalance-column`. */
export function needsRebalance(key: string, maxLength: number = LIMITS.board.positionKeyMaxLength): boolean {
  return key.length > maxLength;
}

/** Khoá hợp lệ theo thuật toán (dùng để gác dữ liệu lạ trước khi tính khoá giữa). */
export function isValidPositionKey(key: string): boolean {
  try {
    validateOrderKey(key, BASE_62_DIGITS);
    return true;
  } catch {
    return false;
  }
}
