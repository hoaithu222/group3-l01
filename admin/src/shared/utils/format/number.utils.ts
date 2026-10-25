/**
 * @file number.utils.ts
 * @description Chốt chặn số trước khi ĐEM HIỂN THỊ — không để `NaN`,
 *  `Infinity`, `undefined` lọt ra màn hình.
 *
 *  Vì sao cần: `NaN` không bị bắt bởi bất kỳ phép so sánh quen tay nào —
 *  `NaN == null` là `false`, `NaN === 0` là `false`, `NaN > 0` cũng `false`.
 *  Nên một ô tiền `NaN` đi thẳng qua mọi guard rồi in ra chữ "NaN tỷ" giữa bảng
 *  số. Nguồn phổ biến: `Number(undefined)` khi Recharts gọi tooltip formatter
 *  lúc chưa có payload, phép chia có mẫu số rỗng, và trường số BE trả `null`
 *  trong khi type khai là `number`.
 *
 *  ⛔ Đây là lớp CUỐI (hiển thị), KHÔNG phải chỗ chữa dữ liệu sai. Số hỏng lọt
 *  tới đây thì đọc ra "—" / "0" thay vì "NaN" — vẫn phải sửa nguồn.
 */

/** `true` khi là số thực dùng được (loại `NaN`, `±Infinity`, `null`, chuỗi…). */
export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Số dùng được, hoặc `fallback` (mặc định `0`). */
export function finiteOr(value: number | null | undefined, fallback = 0): number {
  return isFiniteNumber(value) ? value : fallback;
}

/**
 * Phần trăm `part / whole × 100`, làm tròn tới `fractionDigits` chữ số.
 *
 * Trả `null` khi KHÔNG tính được — mẫu số 0 / rỗng / hỏng, hoặc tử số hỏng. Gọi
 * xong nhớ xử `null` thành "—": ép về `0%` là nói dối, "chưa có kế hoạch" và
 * "có kế hoạch nhưng chưa làm được gì" là hai chuyện khác nhau.
 */
export function percentOf(
  part: number | null | undefined,
  whole: number | null | undefined,
  fractionDigits = 0,
): number | null {
  if (!isFiniteNumber(part) || !isFiniteNumber(whole) || whole === 0) return null;
  const factor = 10 ** fractionDigits;
  return Math.round((part / whole) * 100 * factor) / factor;
}
