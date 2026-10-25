import { prisma } from "../../../infrastructure/database";
import type { DeviceToken as PrismaDeviceToken } from "@prisma/client";
import type {
  ActiveDeviceRow,
  IDeviceRepository,
} from "./device.repository.interface";
import type {
  DeviceToken,
  DeviceTokenKind,
  RegisterDeviceInput,
  RevokeReason,
} from "../entities/device.interface";

function mapToEntity(record: PrismaDeviceToken): DeviceToken {
  return {
    id: record.id,
    userId: record.userId,
    deviceId: record.deviceId,
    platform: record.platform,
    kind: record.kind,
    token: record.token,
    bundleId: record.bundleId,
    environment: record.environment,
    appVersion: record.appVersion,
    locale: record.locale,
    failureCount: record.failureCount,
    lastSeenAt: record.lastSeenAt,
    revokedAt: record.revokedAt,
    revokeReason: record.revokeReason,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export class PrismaDeviceRepository implements IDeviceRepository {
  async findByToken(token: string): Promise<DeviceToken | null> {
    const record = await prisma.deviceToken.findUnique({ where: { token } });
    return record ? mapToEntity(record) : null;
  }

  async upsertByToken(input: RegisterDeviceInput): Promise<DeviceToken> {
    const record = await prisma.deviceToken.upsert({
      where: { token: input.token },
      create: {
        userId: input.userId,
        deviceId: input.deviceId,
        platform: input.platform,
        kind: input.kind,
        token: input.token,
        bundleId: input.bundleId,
        environment: input.environment,
        appVersion: input.appVersion,
        locale: input.locale,
        // Ghi tường minh `null` (không để field "absent") — Prisma+Mongo coi
        // field CHƯA TỪNG set khác với field set = null (`isSet: false` mới
        // khớp field absent, be.md không có ghi chú riêng nhưng cùng đặc thù
        // đã gặp ở `assets`/`admin-storage`); ghi null ngay từ lúc tạo để mọi
        // filter `revokedAt: null` (equality thường) khớp nhất quán về sau.
        revokedAt: null,
        revokeReason: null,
      },
      update: {
        userId: input.userId,
        deviceId: input.deviceId,
        platform: input.platform,
        kind: input.kind,
        bundleId: input.bundleId,
        environment: input.environment,
        appVersion: input.appVersion,
        locale: input.locale,
        lastSeenAt: new Date(),
        revokedAt: null,
        revokeReason: null,
        failureCount: 0,
      },
    });
    return mapToEntity(record);
  }

  async revokeOtherTokensForDevice(
    userId: string,
    deviceId: string,
    kind: DeviceTokenKind,
    excludeToken: string,
    reason: RevokeReason
  ): Promise<void> {
    await prisma.deviceToken.updateMany({
      where: { userId, deviceId, kind, token: { not: excludeToken }, revokedAt: null },
      data: { revokedAt: new Date(), revokeReason: reason },
    });
  }

  async listActiveDeviceIds(userId: string): Promise<ActiveDeviceRow[]> {
    const rows = await prisma.deviceToken.findMany({
      where: { userId, revokedAt: null },
      select: { deviceId: true, lastSeenAt: true },
      orderBy: { lastSeenAt: "desc" },
    });
    const byDevice = new Map<string, Date>();
    for (const row of rows) {
      const current = byDevice.get(row.deviceId);
      if (!current || row.lastSeenAt > current) byDevice.set(row.deviceId, row.lastSeenAt);
    }
    return [...byDevice.entries()].map(([deviceId, lastSeenAt]) => ({ deviceId, lastSeenAt }));
  }

  async revokeByDeviceId(userId: string, deviceId: string, reason: RevokeReason): Promise<number> {
    const result = await prisma.deviceToken.updateMany({
      where: { userId, deviceId, revokedAt: null },
      data: { revokedAt: new Date(), revokeReason: reason },
    });
    return result.count;
  }

  async listActive(userId: string): Promise<DeviceToken[]> {
    const rows = await prisma.deviceToken.findMany({
      where: { userId, revokedAt: null },
      orderBy: { lastSeenAt: "desc" },
    });
    return rows.map(mapToEntity);
  }

  async getActiveTokensByKind(userId: string, kind: DeviceTokenKind): Promise<DeviceToken[]> {
    const rows = await prisma.deviceToken.findMany({ where: { userId, kind, revokedAt: null } });
    return rows.map(mapToEntity);
  }

  async hasActiveToken(userId: string): Promise<boolean> {
    const count = await prisma.deviceToken.count({ where: { userId, revokedAt: null } });
    return count > 0;
  }

  async revokeByTokens(tokens: string[], reason: RevokeReason): Promise<number> {
    if (tokens.length === 0) return 0;
    const result = await prisma.deviceToken.updateMany({
      where: { token: { in: tokens }, revokedAt: null },
      data: { revokedAt: new Date(), revokeReason: reason },
    });
    return result.count;
  }

  async touch(userId: string, deviceId: string): Promise<void> {
    await prisma.deviceToken.updateMany({
      where: { userId, deviceId, revokedAt: null },
      data: { lastSeenAt: new Date() },
    });
  }

  async purgeRevokedBefore(olderThan: Date): Promise<number> {
    const result = await prisma.deviceToken.deleteMany({
      where: { revokedAt: { lt: olderThan } },
    });
    return result.count;
  }

  async revokeStaleBefore(olderThan: Date, reason: RevokeReason): Promise<number> {
    const result = await prisma.deviceToken.updateMany({
      where: { revokedAt: null, lastSeenAt: { lt: olderThan } },
      data: { revokedAt: new Date(), revokeReason: reason },
    });
    return result.count;
  }
}
