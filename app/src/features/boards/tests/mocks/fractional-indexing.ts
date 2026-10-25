/**
 * Bản THAY THẾ `fractional-indexing` cho Jest — chỉ dùng qua `jest.mock(...)`.
 *
 * ⚠️ Vì sao cần: gói thật là ESM thuần (`"type": "module"`, `export const …`) và
 * `jest.config.js` không có ngoại lệ `transformIgnorePatterns` cho nó ⇒ nạp thẳng
 * là `SyntaxError: Unexpected token 'export'`. Sửa `jest.config.js` nằm ngoài
 * phạm vi của module này (đã báo điều phối viên) — khi thêm ngoại lệ đó thì bỏ
 * mock này và để test chạy với thư viện thật.
 *
 * Hợp đồng được giữ: `generateKeyBetween(a, b)` trả khoá NẰM GIỮA `a` và `b` theo
 * so sánh chuỗi thô, ném lỗi khi `a >= b`, và `(null, null)` cho khoá đầu tiên.
 * Thuật toán là phần "midpoint" của thư viện gốc (CC0, `src/index.js`); KHÔNG
 * có phần số nguyên đầu khoá nên ⚠️ khoá vào hàm này không được kết thúc bằng
 * chữ số `0` (thư viện thật cho phép — `a0` là khoá hợp lệ của nó).
 */
const DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

function midpoint(a: string, b: string | null): string {
  const zero = DIGITS.charAt(0);
  if (b !== null && a >= b) throw new Error(`${a} >= ${b}`);
  if (a.slice(-1) === zero || (b && b.slice(-1) === zero)) throw new Error('trailing zero');

  if (b) {
    let n = 0;
    while ((a[n] ?? zero) === b[n]) n += 1;
    if (n > 0) return b.slice(0, n) + midpoint(a.slice(n), b.slice(n));
  }

  const digitA = a ? DIGITS.indexOf(a.charAt(0)) : 0;
  const digitB = b !== null ? DIGITS.indexOf(b.charAt(0)) : DIGITS.length;
  if (digitB - digitA > 1) return DIGITS.charAt(Math.round(0.5 * (digitA + digitB)));
  if (b && b.length > 1) return b.slice(0, 1);
  return DIGITS.charAt(digitA) + midpoint(a.slice(1), null);
}

export function generateKeyBetween(a: string | null, b: string | null): string {
  if (a === null && b === null) return 'aV';
  if (a !== null && b !== null && a >= b) throw new Error(`${a} >= ${b}`);
  return midpoint(a ?? '', b);
}
