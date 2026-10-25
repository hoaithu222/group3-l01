/**
 * Nền tảng dùng chung của seed "nhóm đông người": Prisma client, bộ sinh số ngẫu nhiên tất định, bảng người (khoá → id),
 * và bộ rải thời gian cho hội thoại. Không có logic nghiệp vụ nào ở đây.
 */
import { PrismaClient } from "@prisma/client";
import type { PersonKey } from "../types";

export const prisma = new PrismaClient();

/** Mulberry32 — số ngẫu nhiên tất định theo chuỗi gốc, để chạy lại seed cho ra cùng thời điểm/độ dài tin. */
export function rngFrom(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const DAY_MS = 86_400_000;
export const MIN_MS = 60_000;

/** Bảng khoá người → id Mongo, nạp một lần ở đầu `main()`. */
export class Directory {
  private readonly ids = new Map<string, string>();
  private readonly names = new Map<string, string>();

  set(key: string, id: string, name: string): void {
    this.ids.set(key, id);
    this.names.set(key, name);
  }

  id(key: PersonKey): string {
    const v = this.ids.get(key);
    if (!v) throw new Error(`Không có người với khoá "${key}"`);
    return v;
  }

  name(key: PersonKey): string {
    const v = this.names.get(key);
    if (!v) throw new Error(`Không có người với khoá "${key}"`);
    return v;
  }

  keyOfId(id: string): string | undefined {
    for (const [k, v] of this.ids) if (v === id) return k;
    return undefined;
  }
}

/**
 * Rải `count` mốc thời gian TĂNG DẦN trong [from, to]: chia thành các "phiên" 3–7 tin liên tiếp, mỗi phiên rơi vào một
 * ngày (7:30–23:00 giờ Việt Nam), trong phiên cách nhau 20 giây–6 phút. Nếu cửa sổ quá chật thì nén lại (tin vẫn tăng dần).
 */
export function spreadTimes(count: number, from: Date, to: Date, rng: () => number): Date[] {
  if (count === 0) return [];
  const span = Math.max(to.getTime() - from.getTime(), count * 30_000);
  const sessions: number[] = [];
  let left = count;
  while (left > 0) {
    const size = Math.min(left, 3 + Math.floor(rng() * 5));
    sessions.push(size);
    left -= size;
  }
  const out: Date[] = [];
  let cursor = from.getTime();
  const slot = span / sessions.length;
  sessions.forEach((size, i) => {
    const windowStart = from.getTime() + slot * i;
    let t = Math.max(cursor, windowStart + rng() * slot * 0.6);
    t = snapToActiveHours(t, rng);
    for (let k = 0; k < size; k++) {
      t = Math.max(t, cursor) + (k === 0 ? 0 : 20_000 + rng() * 340_000);
      out.push(new Date(t));
      cursor = t + 1000;
    }
  });
  const cap = to.getTime();
  // Cửa sổ chật: kéo các mốc vượt `to` về lùi dần, giữ thứ tự tăng.
  for (let i = out.length - 1, limit = cap; i >= 0; i--) {
    if (out[i].getTime() > limit) out[i] = new Date(limit);
    limit = out[i].getTime() - 1000;
  }
  return out;
}

/** Đưa giờ về khung 7:30–23:00 giờ Việt Nam (UTC+7) của cùng ngày; ngoài khung thì dời sang sáng/tối gần nhất. */
function snapToActiveHours(ms: number, rng: () => number): number {
  const vn = new Date(ms + 7 * 3_600_000);
  const minutes = vn.getUTCHours() * 60 + vn.getUTCMinutes();
  if (minutes >= 450 && minutes <= 1380) return ms;
  const targetMin = 450 + Math.floor(rng() * 300);
  const dayStartVn = Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate()) - 7 * 3_600_000;
  return dayStartVn + targetMin * MIN_MS + (minutes > 1380 ? DAY_MS : 0);
}

/** Cắt chuỗi theo số ký tự hiển thị — dùng cho `replyPreview.excerpt`. */
export function excerpt(text: string, max = 120): string {
  const chars = Array.from(text);
  return chars.length <= max ? text : `${chars.slice(0, max - 1).join("")}…`;
}
