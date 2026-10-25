import { murmur3Hash32, murmur3Hash32Words } from "./murmur3";

/**
 * Seed băm cố định THEO `algoVersion` (be.md §5.1 bước 5): cùng phiên bản → cùng hash ở mọi máy/mọi lần; đổi phiên bản →
 * hash đổi hẳn (fingerprint cũ không lẫn với mới). Công thức chỉ dùng phép nguyên nên tất định; v1 = một hằng cố định
 * (khoá bằng test) — KHÔNG đổi công thức mà không tăng `PLAGIARISM_ALGO_VERSION`.
 */
export function hashSeedForAlgo(algoVersion: number): number {
  return (0x9747b28c ^ Math.imul(algoVersion, 0x9e3779b1)) >>> 0;
}

function assertK(k: number): void {
  if (!Number.isInteger(k) || k < 1) throw new RangeError(`k phải là số nguyên ≥ 1 (nhận ${k})`);
}

/**
 * Băm từng token (UTF-8 của giá trị đã chuẩn hoá) → uint32, có nhớ đệm theo giá trị vì văn bản/mã lặp từ cực nhiều
 * ("the", "I", "(") — tránh băm lại và tránh cấp phát `Buffer` cho từng token.
 */
export function hashTokenValues(values: readonly string[], seed: number): Uint32Array {
  const out = new Uint32Array(values.length);
  const cache = new Map<string, number>();
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    let h = cache.get(v);
    if (h === undefined) {
      h = murmur3Hash32(v, seed);
      cache.set(v, h);
    }
    out[i] = h;
  }
  return out;
}

/**
 * Băm mọi k-gram (cửa sổ k token liên tiếp) → mảng int32 độ dài `max(0, n − k + 1)`; phần tử `i` là băm của token
 * `i … i+k−1`. Băm k-gram = murmur3 trên k băm token theo thứ tự → ĐỔI THỨ TỰ token là ra hash khác (đảo câu không
 * trùng k-gram). Kết quả là int32 CÓ DẤU để nhét thẳng vào `DocumentFingerprint.hashes Int[]`.
 */
export function kgramHashes(values: readonly string[], k: number, seed: number): Int32Array {
  assertK(k);
  const count = Math.max(0, values.length - k + 1);
  const out = new Int32Array(count);
  if (count === 0) return out;
  const tokenHashes = hashTokenValues(values, seed);
  for (let i = 0; i < count; i++) out[i] = murmur3Hash32Words(tokenHashes, i, k, seed) | 0;
  return out;
}
