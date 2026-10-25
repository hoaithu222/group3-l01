/**
 * Tiện ích dùng chung cho ba bộ seed Họp / Pomodoro / Live Quiz (không có logic nghiệp vụ): id tất định theo khoá,
 * mốc giờ theo lịch Việt Nam, và chọn người hợp lệ của một nhóm.
 */
import { createHash } from "crypto";
import { DAY_MS, MIN_MS, rngFrom } from "../core";

const VN_OFFSET_MS = 7 * 3_600_000;

/**
 * ObjectId 24 hex TẤT ĐỊNH theo khoá — nhận diện bản ghi đã seed mà không cần thêm cột/khoá phụ (id do ứng dụng tự sinh bằng
 * `newObjectId()` cũng chỉ là 24 hex ngẫu nhiên nên khuôn dạng giống hệt). Tiền tố `seed-rich:` tránh đụng khoá của bộ seed khác.
 */
export function stableId(key: string): string {
  return createHash("sha1").update(`seed-rich:${key}`).digest("hex").slice(0, 24);
}

/** `hour:minute` giờ Việt Nam của ngày cách hôm nay `dayOffset` ngày (âm = quá khứ), trả về mốc UTC. */
export function atVn(now: Date, dayOffset: number, hour: number, minute = 0): Date {
  const vn = new Date(now.getTime() + VN_OFFSET_MS);
  return new Date(Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate() + dayOffset, hour, minute) - VN_OFFSET_MS);
}

/** `dd/MM` theo giờ Việt Nam của `base` cộng `plusDays` ngày. */
export function dayLabel(base: Date, plusDays: number): string {
  const vn = new Date(base.getTime() + VN_OFFSET_MS + plusDays * DAY_MS);
  return `${String(vn.getUTCDate()).padStart(2, "0")}/${String(vn.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Thứ trong tuần theo giờ Việt Nam: 0 = Chủ nhật … 6 = Thứ bảy. */
export function weekdayVn(at: Date): number {
  return new Date(at.getTime() + VN_OFFSET_MS).getUTCDay();
}

export const minutes = (n: number): number => n * MIN_MS;
export const clampDate = (d: Date, lo: Date, hi: Date): Date => new Date(Math.min(Math.max(d.getTime(), lo.getTime()), hi.getTime()));
export const pick = <T>(rng: () => number, list: readonly T[]): T => list[Math.floor(rng() * list.length)] as T;
export const between = (rng: () => number, lo: number, hi: number): number => lo + rng() * (hi - lo);

/**
 * Bộ số ngẫu nhiên tất định nhưng đã "trộn" băm trước: `rngFrom` với các chuỗi gốc chỉ khác nhau một ký tự (vd `...:0`, `...:1`) cho ra các giá trị
 * đầu rất gần nhau (tương quan), nên mọi chỗ cần nhiều khoá tương tự nhau đều đi qua SHA-1 trước.
 */
export function mixedRng(seed: string): () => number {
  return rngFrom(createHash("sha1").update(seed).digest("hex"));
}
