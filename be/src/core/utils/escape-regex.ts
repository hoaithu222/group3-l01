/**
 * Escape mọi ký tự đặc biệt của regex (PCRE của MongoDB `$regex` và JS `RegExp`)
 * để chuỗi người dùng nhập CHỈ khớp LITERAL — không có toán tử/nhóm/lặp nào
 * còn hiệu lực (chống ReDoS, be.md p1-09 §5.4: `.*(a+)+$` → khớp đúng chuỗi đó).
 *
 * Không dùng `-`/`/` vì chúng chỉ đặc biệt trong class `[...]`/literal `/.../`,
 * mà đầu vào luôn được đặt NGOÀI class.
 */
export function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
