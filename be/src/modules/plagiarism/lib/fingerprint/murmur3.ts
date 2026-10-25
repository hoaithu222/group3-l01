/**
 * MurmurHash3 x86 32 bit tự viết (không thêm thư viện) — bản gốc của Austin Appleby, kết quả trùng vector chuẩn công bố
 * (xem `tests/murmur3.test.ts`). Không dùng cho mật mã: chỉ để băm k-gram thành fingerprint, nơi cần nhanh + phân bố đều
 * + TẤT ĐỊNH tuyệt đối giữa các lần chạy/máy/phiên bản Node.
 *
 * Toàn bộ số học dùng `Math.imul` và toán tử bit của JS (int32) nên không phụ thuộc số thực; giá trị trả về là uint32.
 */

const C1 = 0xcc9e2d51;
const C2 = 0x1b873593;

function rotl32(x: number, r: number): number {
  return (x << r) | (x >>> (32 - r));
}

/** Trộn một khối 32 bit `k` vào trạng thái `h` (thân vòng lặp của thuật toán gốc). */
function mixBlock(h: number, k: number): number {
  const k1 = Math.imul(rotl32(Math.imul(k, C1), 15), C2);
  return (Math.imul(rotl32(h ^ k1, 13), 5) + 0xe6546b64) | 0;
}

/** Bước cuối "fmix32": khuếch tán bit để một bit đầu vào đổi ~ một nửa bit đầu ra. */
function fmix32(h: number): number {
  let x = h;
  x ^= x >>> 16;
  x = Math.imul(x, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return x >>> 0;
}

/**
 * Băm chuỗi (UTF-8) hoặc mảng byte. Trả uint32 `0…2^32−1`, giống `MurmurHash3_x86_32(key, len, seed)` của bản C.
 * Chuỗi được mã hoá UTF-8 (không dùng UTF-16) để kết quả không phụ thuộc endian/bộ mã của nơi chạy.
 */
export function murmur3Hash32(input: string | Uint8Array, seed = 0): number {
  const bytes = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  const len = bytes.length;
  const blocks = len >>> 2;
  let h = seed | 0;
  for (let i = 0; i < blocks; i++) {
    const o = i << 2;
    h = mixBlock(h, bytes[o] | (bytes[o + 1] << 8) | (bytes[o + 2] << 16) | (bytes[o + 3] << 24));
  }
  // Phần đuôi 1–3 byte: gộp little-endian rồi trộn như một khối thiếu (không xoay h).
  const tail = blocks << 2;
  const rest = len & 3;
  if (rest > 0) {
    let k = 0;
    if (rest === 3) k ^= bytes[tail + 2] << 16;
    if (rest >= 2) k ^= bytes[tail + 1] << 8;
    k ^= bytes[tail];
    h ^= Math.imul(rotl32(Math.imul(k, C1), 15), C2);
  }
  return fmix32(h ^ len);
}

/**
 * Băm một dãy `count` từ 32 bit (`words[start … start+count−1]`) — CHÍNH XÁC bằng `murmur3Hash32` trên dãy byte
 * little-endian của các từ đó (không có phần đuôi, độ dài `4·count`). Dùng để băm k-gram từ các băm token mà không phải
 * dựng chuỗi/`Buffer` cho từng cửa sổ (nút thắt CPU khi tài liệu 1 triệu ký tự).
 */
export function murmur3Hash32Words(words: ArrayLike<number>, start: number, count: number, seed = 0): number {
  let h = seed | 0;
  for (let i = 0; i < count; i++) h = mixBlock(h, words[start + i] | 0);
  return fmix32(h ^ (count << 2));
}
