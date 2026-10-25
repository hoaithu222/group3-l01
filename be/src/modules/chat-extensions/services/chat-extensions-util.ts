/** Lỗi trùng khoá unique của Prisma/Mongo (`P2002`) — nhận diện bằng `code` (service không import Prisma). Dùng cho đua tạo `PollVote` lần đầu → thử lại. */
export function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: unknown }).code === "P2002";
}

/** So hai tập id (bỏ qua thứ tự) — khảo sát: bầu lại đúng lựa chọn cũ không phải thay đổi. */
export function sameIdSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((id) => set.has(id));
}

/** Kiểm thời điểm nằm trong `[now + minLeadSeconds, now + maxDays ngày]` — dùng cho hẹn tin, đặt nhắc, hạn khảo sát. */
export function isWithinWindow(at: Date, now: Date, minLeadSeconds: number, maxDays: number): boolean {
  const t = at.getTime();
  if (Number.isNaN(t)) return false;
  return t >= now.getTime() + minLeadSeconds * 1000 && t <= now.getTime() + maxDays * 24 * 60 * 60 * 1000;
}
