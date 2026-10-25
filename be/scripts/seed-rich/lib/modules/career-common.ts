/**
 * Tiện ích dùng chung cho các bộ seed phân hệ nghề nghiệp/học tập (career, portfolio, recruiter, roadmap, study-progress):
 * đọc người dùng kèm mốc tạo tài khoản, kẹp thời gian, đọc `SystemConfig`, ghi thông báo trực tiếp (không push), chia lô truy vấn.
 */
import type { Prisma } from "@prisma/client";
import { DAY_MS, prisma } from "../core";
import type { ModuleCtx } from "../module-ctx";

export interface UserInfo {
  key: string;
  id: string;
  name: string;
  email: string;
  status: string;
  avatarAssetId: string | null;
  createdAt: Date;
}

/** Nạp thông tin người dùng theo khoá `people.ts` (+ `thu`). Khoá không có trong `Directory` bị bỏ qua. */
export async function loadUsers(c: ModuleCtx, keys: readonly string[]): Promise<Map<string, UserInfo>> {
  const byId = new Map<string, string>();
  for (const key of new Set(keys)) {
    try {
      byId.set(c.dir.id(key), key);
    } catch {
      // khoá không có trong bảng người → bỏ qua
    }
  }
  const rows = byId.size === 0 ? [] : await prisma.user.findMany({ where: { id: { in: [...byId.keys()] } }, select: { id: true, name: true, email: true, status: true, avatarAssetId: true, createdAt: true } });
  const out = new Map<string, UserInfo>();
  for (const r of rows) {
    const key = byId.get(r.id) as string;
    out.set(key, { key, id: r.id, name: r.name, email: r.email, status: r.status, avatarAssetId: r.avatarAssetId ?? null, createdAt: r.createdAt });
  }
  return out;
}

export const maxDate = (...ds: Date[]): Date => new Date(Math.max(...ds.map((d) => d.getTime())));
export const minDate = (...ds: Date[]): Date => new Date(Math.min(...ds.map((d) => d.getTime())));

/** Kẹp thời điểm vào [from, to]. */
export function clampTime(t: Date, from: Date, to: Date): Date {
  return new Date(Math.min(Math.max(t.getTime(), from.getTime()), to.getTime()));
}

/** Giờ địa phương VN (UTC+7) → thời điểm UTC của ngày `day` (đối tượng Date) lúc `hour:minute`. */
export function vnTimeOf(day: Date, hour: number, minute = 0): Date {
  const vn = new Date(day.getTime() + 7 * 3_600_000);
  return new Date(Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate(), hour, minute) - 7 * 3_600_000);
}

/**
 * Đưa thời điểm về khung sinh hoạt 7:30-23:00 giờ Việt Nam (người thật không gửi lời mời/đăng ký lúc 3 giờ sáng): trước 7:30 thì về 8:00-9:30 cùng ngày,
 * từ 23:00 thì về 8:00-9:30 hôm sau. Tất định theo phút của đầu vào; trong khung thì giữ nguyên.
 */
export function snapActive(t: Date): Date {
  const vn = new Date(t.getTime() + 7 * 3_600_000);
  const minutes = vn.getUTCHours() * 60 + vn.getUTCMinutes();
  if (minutes >= 450 && minutes < 1380) return t;
  const dayStart = Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate()) - 7 * 3_600_000;
  const target = 8 * 60 + ((vn.getUTCMinutes() * 7 + vn.getUTCSeconds()) % 90);
  return new Date(dayStart + (minutes >= 1380 ? 86_400_000 : 0) + target * 60_000);
}

/** "YYYY-MM-DD" theo giờ Việt Nam. */
export function vnDateKey(d: Date): string {
  return new Date(d.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
}

/** Phần ghi đè `SystemConfig` (chỉ phần override, không phải bản hợp nhất). Không có → `{}`. */
export async function readSystemConfig(key: string): Promise<Record<string, unknown>> {
  const row = await prisma.systemConfig.findUnique({ where: { key }, select: { value: true } });
  const v = row?.value;
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

export function chunk<T>(list: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

export interface DirectNotification {
  type: string;
  recipientId: string;
  actorId?: string | null;
  /** Cũng là `dedupeKey` của người nhận (đúng như `notify()` dùng `source.id`). */
  sourceType: string;
  sourceId: string;
  refs: Prisma.InputJsonObject;
  /** `Notification.dedupeKey` (unique toàn cục). */
  dedupeKey: string;
  createdAt: Date;
  /** `true` = chưa đọc. */
  unread: boolean;
}

/**
 * Ghi `Notification` + `NotificationRecipient` trực tiếp, không phát push/socket/outbox (`pushStatus: SKIPPED`, `NO_DEVICE`) — cùng hình dạng
 * `notify()` ghi cho thông báo không gắn scope. Idempotent theo `dedupeKey`. Trả số thông báo MỚI.
 */
export async function notifyDirect(list: readonly DirectNotification[], now: Date): Promise<number> {
  if (list.length === 0) return 0;
  const have = new Set<string>();
  for (const part of chunk(list.map((n) => n.dedupeKey), 200)) {
    for (const r of await prisma.notification.findMany({ where: { dedupeKey: { in: part } }, select: { dedupeKey: true } })) have.add(r.dedupeKey);
  }
  let created = 0;
  for (const n of list) {
    if (have.has(n.dedupeKey)) continue;
    await prisma.notification.create({
      data: {
        type: n.type,
        scopeType: "NONE",
        actorId: n.actorId ?? undefined,
        sourceType: n.sourceType,
        sourceId: n.sourceId,
        refs: n.refs,
        dedupeKey: n.dedupeKey,
        createdAt: n.createdAt,
        recipients: {
          create: {
            recipientId: n.recipientId,
            kind: "DEFAULT",
            inInbox: true,
            dedupeKey: n.sourceId,
            scopeType: "NONE",
            readAt: n.unread ? null : new Date(Math.min(n.createdAt.getTime() + 40 * 60_000, now.getTime())),
            seenAt: null,
            pushStatus: "SKIPPED",
            skipReason: "NO_DEVICE",
            deliveredPushAt: null,
            createdAt: new Date(n.createdAt.getTime() + 500),
            kindRank: 0,
            streamKey: null,
            streamSeq: null,
            filterBucket: "all",
            cancelledAt: null,
          },
        },
      },
    });
    created += 1;
  }
  return created;
}

export { DAY_MS };
