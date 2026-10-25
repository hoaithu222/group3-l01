import type { Posting } from "../types";

/**
 * Winnowing (Schleimer–Wilkerson–Aiken, "MOSS"): trong mỗi cửa sổ `window` băm liên tiếp chọn băm NHỎ NHẤT (bằng nhau →
 * lấy vị trí PHẢI NHẤT), rồi ghi mỗi vị trí được chọn đúng một lần.
 *
 * Bảo đảm: hai tài liệu chung một đoạn dài ≥ `window + k − 1` token (k = độ dài k-gram) LUÔN có ít nhất một fingerprint
 * chung — vì có một cửa sổ nằm trọn trong đoạn chung, nội dung cửa sổ giống hệt ở cả hai nên băm nhỏ nhất được chọn
 * giống hệt. Mật độ ≈ 2/(window + 1) băm, nên chỉ mục nhỏ hơn nhiều so với lưu mọi k-gram.
 *
 * Chạy O(n) bằng hàng đợi đơn điệu (chỉ số có băm tăng dần từ đầu đến cuối; pop `>=` để giữ vị trí phải nhất khi bằng).
 * Đầu vào rỗng → `[]`. Ít băm hơn `window` (tài liệu chỉ vừa qua k token) → dùng MỘT cửa sổ trọn tài liệu, để mọi tài
 * liệu đủ k token đều có ít nhất một fingerprint (không bảo đảm bắt đoạn trùng ở quy mô này).
 */
export function winnow(hashes: ArrayLike<number>, window: number): Posting[] {
  if (!Number.isInteger(window) || window < 1) throw new RangeError(`window phải là số nguyên ≥ 1 (nhận ${window})`);
  const n = hashes.length;
  if (n === 0) return [];
  const w = Math.min(window, n);
  const out: Posting[] = [];
  const deque = new Int32Array(n);
  let head = 0;
  let tail = 0;
  let last = -1;
  for (let j = 0; j < n; j++) {
    const h = hashes[j];
    while (tail > head && hashes[deque[tail - 1]] >= h) tail--;
    deque[tail++] = j;
    if (deque[head] <= j - w) head++;
    if (j >= w - 1) {
      const p = deque[head];
      if (p !== last) {
        out.push({ hash: hashes[p], pos: p });
        last = p;
      }
    }
  }
  return out;
}

/**
 * Tập hash khác nhau của một tài liệu, sắp tăng dần (theo giá trị int32 có dấu) — đúng thứ Prisma `hashes Int[]` cần
 * (be.md §5.1 bước 6). Vượt `max` thì GIỮ CÁC HASH NHỎ NHẤT (tất định: hai lần lập chỉ mục cho cùng kết quả) và đặt
 * `truncated = true` để UI ghi "chỉ so một phần tài liệu".
 */
export function distinctSortedHashes(postings: readonly Posting[], max: number): { hashes: number[]; truncated: boolean } {
  const unique = Array.from(new Set(postings.map((p) => p.hash))).sort((a, b) => a - b);
  if (unique.length <= max) return { hashes: unique, truncated: false };
  return { hashes: unique.slice(0, max), truncated: true };
}
