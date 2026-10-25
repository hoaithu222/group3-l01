import type { Prisma } from "@prisma/client";
import { prisma } from "../../../infrastructure/database";
import type { PreferredBreak, SettingPatch, WellbeingSettingEntity } from "../entities/burnout.interface";
import type { IWellbeingSettingRepository } from "./setting.repository.interface";
import { isPrismaUniqueViolation, type TxHandle } from "./tx";

type SettingRecord = Awaited<ReturnType<typeof prisma.wellbeingSetting.findFirstOrThrow>>;

/** `preferredBreak` là JSON tự do trong Mongo — dữ liệu lạ/cũ hỏng thì coi như chưa đặt, không làm hỏng cả cài đặt. */
function parseBreak(raw: unknown): PreferredBreak | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { workMinutes, breakMinutes } = raw as Record<string, unknown>;
  return typeof workMinutes === "number" && typeof breakMinutes === "number" ? { workMinutes, breakMinutes } : null;
}

const toEntity = (r: SettingRecord): WellbeingSettingEntity => ({
  id: r.id,
  userId: r.userId,
  optedInAt: r.optedInAt,
  optedOutAt: r.optedOutAt,
  alertsEnabled: r.alertsEnabled,
  preferredBreak: parseBreak(r.preferredBreak),
  lastAlertAt: r.lastAlertAt,
  snoozedUntil: r.snoozedUntil,
  updatedAt: r.updatedAt,
});

/** `Json?` với MongoDB nhận `null` JS trực tiếp (cùng cách `coins/shop.repository.prisma.ts`); ép kiểu MỘT chỗ. */
const jsonBreak = (value: PreferredBreak | null): Prisma.InputJsonObject | null => value as Prisma.InputJsonObject | null;

export class PrismaWellbeingSettingRepository implements IWellbeingSettingRepository {
  async findByUserId(userId: string): Promise<WellbeingSettingEntity | null> {
    const r = await prisma.wellbeingSetting.findUnique({ where: { userId } });
    return r ? toEntity(r) : null;
  }

  async enable(userId: string, now: Date, patch: SettingPatch): Promise<WellbeingSettingEntity> {
    const fields = {
      optedInAt: now,
      optedOutAt: null,
      lastAlertAt: null,
      snoozedUntil: null,
      alertsEnabled: patch.alertsEnabled ?? true,
      preferredBreak: jsonBreak(patch.preferredBreak ?? null),
    };
    try {
      return toEntity(await prisma.wellbeingSetting.upsert({ where: { userId }, create: { userId, ...fields }, update: fields }));
    } catch (err) {
      // Hai yêu cầu "bật" đồng thời cùng tạo dòng: bên thua đã thấy dòng tồn tại → chỉ cần cập nhật.
      if (!isPrismaUniqueViolation(err)) throw err;
      return toEntity(await prisma.wellbeingSetting.update({ where: { userId }, data: fields }));
    }
  }

  async patch(userId: string, patch: SettingPatch): Promise<WellbeingSettingEntity | null> {
    const data: Prisma.WellbeingSettingUpdateInput = {
      ...(patch.alertsEnabled !== undefined && { alertsEnabled: patch.alertsEnabled }),
      ...(patch.preferredBreak !== undefined && { preferredBreak: jsonBreak(patch.preferredBreak) }),
    };
    const existing = await prisma.wellbeingSetting.findUnique({ where: { userId } });
    if (!existing) return null;
    if (Object.keys(data).length === 0) return toEntity(existing);
    return toEntity(await prisma.wellbeingSetting.update({ where: { userId }, data }));
  }

  async disable(userId: string, now: Date, tx?: TxHandle): Promise<boolean> {
    const res = await (tx ?? prisma).wellbeingSetting.updateMany({
      where: { userId },
      data: { optedInAt: null, optedOutAt: now, lastAlertAt: null, snoozedUntil: null, alertsEnabled: true, preferredBreak: jsonBreak(null) },
    });
    return res.count > 0;
  }

  async claimAlert(userId: string, notAfter: Date, now: Date, tx?: TxHandle): Promise<boolean> {
    const res = await (tx ?? prisma).wellbeingSetting.updateMany({
      where: { userId, optedInAt: { not: null }, optedOutAt: null, OR: [{ lastAlertAt: null }, { lastAlertAt: { lte: notAfter } }] },
      data: { lastAlertAt: now },
    });
    return res.count === 1;
  }

  async setSnooze(userId: string, until: Date, tx?: TxHandle): Promise<void> {
    await (tx ?? prisma).wellbeingSetting.updateMany({ where: { userId }, data: { snoozedUntil: until } });
  }

  async resetAlertState(userId: string): Promise<void> {
    await prisma.wellbeingSetting.updateMany({ where: { userId }, data: { lastAlertAt: null, snoozedUntil: null } });
  }

  async deleteByUser(userId: string): Promise<number> {
    return (await prisma.wellbeingSetting.deleteMany({ where: { userId } })).count;
  }

  async listEnabledPage(afterId: string | null, limit: number): Promise<WellbeingSettingEntity[]> {
    const rows = await prisma.wellbeingSetting.findMany({
      where: { optedInAt: { not: null }, optedOutAt: null, ...(afterId !== null && { id: { gt: afterId } }) },
      orderBy: { id: "asc" },
      take: limit,
    });
    return rows.map(toEntity);
  }
}
