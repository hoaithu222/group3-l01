import { prisma } from "../../../infrastructure/database";
import { DEFAULT_TIME_ZONE, safeTimeZone } from "../services/local-date";

export interface StudyUserRef {
  id: string;
  name: string;
}

/** Người dùng ĐANG HOẠT ĐỘNG kèm múi giờ — cho job nhắc ôn (`sr.daily-reminder`) chọn người có giờ địa phương = giờ nhắc. */
export interface StudyUserZone {
  id: string;
  timezone: string;
}

/**
 * Tra cứu người dùng cho `study`: tên hiển thị tác giả (batch, không N+1 — chỉ id + tên, không lộ email/điện thoại) và
 * múi giờ (p4-02: "ngày ôn" theo `User.timezone`).
 */
export interface IStudyUserDirectory {
  findMany(ids: string[]): Promise<Map<string, StudyUserRef>>;
  /** Múi giờ hợp lệ của người dùng (rỗng/lạ/không tìm thấy → `Asia/Ho_Chi_Minh`). */
  getTimezone(userId: string): Promise<string>;
  /** Mọi múi giờ đang có ở người dùng ACTIVE (không trùng). */
  listTimezones(): Promise<string[]>;
  /** Trong `userIds`, người ACTIVE có múi giờ thuộc `timezones`. */
  findActiveByTimezones(userIds: string[], timezones: readonly string[]): Promise<StudyUserZone[]>;
}

export class PrismaStudyUserDirectory implements IStudyUserDirectory {
  async findMany(ids: string[]): Promise<Map<string, StudyUserRef>> {
    const unique = Array.from(new Set(ids));
    if (unique.length === 0) return new Map();
    const rows = await prisma.user.findMany({ where: { id: { in: unique } }, select: { id: true, name: true } });
    return new Map(rows.map((u) => [u.id, { id: u.id, name: u.name }]));
  }

  async getTimezone(userId: string): Promise<string> {
    const row = await prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } });
    return safeTimeZone(row?.timezone);
  }

  async listTimezones(): Promise<string[]> {
    const rows = await prisma.user.findMany({ where: { status: "ACTIVE" }, distinct: ["timezone"], select: { timezone: true } });
    return rows.map((r) => r.timezone);
  }

  async findActiveByTimezones(userIds: string[], timezones: readonly string[]): Promise<StudyUserZone[]> {
    if (userIds.length === 0 || timezones.length === 0) return [];
    const rows = await prisma.user.findMany({
      where: { id: { in: userIds }, status: "ACTIVE", timezone: { in: [...timezones] } },
      select: { id: true, timezone: true },
    });
    return rows.map((r) => ({ id: r.id, timezone: safeTimeZone(r.timezone) }));
  }
}

export class InMemoryStudyUserDirectory implements IStudyUserDirectory {
  readonly users = new Map<string, StudyUserRef>();
  readonly timezones = new Map<string, string>();
  readonly inactive = new Set<string>();

  findMany(ids: string[]): Promise<Map<string, StudyUserRef>> {
    return Promise.resolve(new Map(ids.flatMap((id) => (this.users.has(id) ? [[id, this.users.get(id) as StudyUserRef] as const] : []))));
  }

  getTimezone(userId: string): Promise<string> {
    return Promise.resolve(safeTimeZone(this.timezones.get(userId) ?? DEFAULT_TIME_ZONE));
  }

  listTimezones(): Promise<string[]> {
    const all = new Set<string>();
    for (const id of new Set([...this.users.keys(), ...this.timezones.keys()])) {
      if (!this.inactive.has(id)) all.add(this.timezones.get(id) ?? DEFAULT_TIME_ZONE);
    }
    return Promise.resolve([...all]);
  }

  findActiveByTimezones(userIds: string[], timezones: readonly string[]): Promise<StudyUserZone[]> {
    const wanted = new Set(timezones);
    return Promise.resolve(
      userIds.flatMap((id) => {
        const tz = this.timezones.get(id) ?? DEFAULT_TIME_ZONE;
        return this.inactive.has(id) || !wanted.has(tz) ? [] : [{ id, timezone: safeTimeZone(tz) }];
      })
    );
  }
}
