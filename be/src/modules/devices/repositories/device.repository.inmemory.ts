import { randomBytes } from "crypto";
import type { ActiveDeviceRow, IDeviceRepository } from "./device.repository.interface";
import type {
  DeviceToken,
  DeviceTokenKind,
  RegisterDeviceInput,
  RevokeReason,
} from "../entities/device.interface";

const store = new Map<string, DeviceToken>();

function nextId(): string {
  return randomBytes(12).toString("hex");
}

/** In-memory — dùng cho test. */
export class InMemoryDeviceRepository implements IDeviceRepository {
  static clearStore(): void {
    store.clear();
  }

  async findByToken(token: string): Promise<DeviceToken | null> {
    return [...store.values()].find((d) => d.token === token) ?? null;
  }

  async upsertByToken(input: RegisterDeviceInput): Promise<DeviceToken> {
    const existing = await this.findByToken(input.token);
    const now = new Date();
    if (existing) {
      Object.assign(existing, {
        userId: input.userId,
        deviceId: input.deviceId,
        platform: input.platform,
        kind: input.kind,
        bundleId: input.bundleId ?? null,
        environment: input.environment ?? null,
        appVersion: input.appVersion ?? null,
        locale: input.locale ?? null,
        lastSeenAt: now,
        revokedAt: null,
        revokeReason: null,
        failureCount: 0,
        updatedAt: now,
      });
      return existing;
    }
    const entity: DeviceToken = {
      id: nextId(),
      userId: input.userId,
      deviceId: input.deviceId,
      platform: input.platform,
      kind: input.kind,
      token: input.token,
      bundleId: input.bundleId ?? null,
      environment: input.environment ?? null,
      appVersion: input.appVersion ?? null,
      locale: input.locale ?? null,
      failureCount: 0,
      lastSeenAt: now,
      revokedAt: null,
      revokeReason: null,
      createdAt: now,
      updatedAt: now,
    };
    store.set(entity.id, entity);
    return entity;
  }

  async revokeOtherTokensForDevice(
    userId: string,
    deviceId: string,
    kind: DeviceTokenKind,
    excludeToken: string,
    reason: RevokeReason
  ): Promise<void> {
    for (const d of store.values()) {
      if (d.userId === userId && d.deviceId === deviceId && d.kind === kind && d.token !== excludeToken && !d.revokedAt) {
        d.revokedAt = new Date();
        d.revokeReason = reason;
      }
    }
  }

  async listActiveDeviceIds(userId: string): Promise<ActiveDeviceRow[]> {
    const byDevice = new Map<string, Date>();
    for (const d of store.values()) {
      if (d.userId !== userId || d.revokedAt) continue;
      const current = byDevice.get(d.deviceId);
      if (!current || d.lastSeenAt > current) byDevice.set(d.deviceId, d.lastSeenAt);
    }
    return [...byDevice.entries()].map(([deviceId, lastSeenAt]) => ({ deviceId, lastSeenAt }));
  }

  async revokeByDeviceId(userId: string, deviceId: string, reason: RevokeReason): Promise<number> {
    let count = 0;
    for (const d of store.values()) {
      if (d.userId === userId && d.deviceId === deviceId && !d.revokedAt) {
        d.revokedAt = new Date();
        d.revokeReason = reason;
        count++;
      }
    }
    return count;
  }

  async listActive(userId: string): Promise<DeviceToken[]> {
    return [...store.values()]
      .filter((d) => d.userId === userId && !d.revokedAt)
      .sort((a, b) => b.lastSeenAt.getTime() - a.lastSeenAt.getTime());
  }

  async getActiveTokensByKind(userId: string, kind: DeviceTokenKind): Promise<DeviceToken[]> {
    return [...store.values()].filter((d) => d.userId === userId && d.kind === kind && !d.revokedAt);
  }

  async hasActiveToken(userId: string): Promise<boolean> {
    return [...store.values()].some((d) => d.userId === userId && !d.revokedAt);
  }

  async revokeByTokens(tokens: string[], reason: RevokeReason): Promise<number> {
    let count = 0;
    for (const d of store.values()) {
      if (tokens.includes(d.token) && !d.revokedAt) {
        d.revokedAt = new Date();
        d.revokeReason = reason;
        count++;
      }
    }
    return count;
  }

  async touch(userId: string, deviceId: string): Promise<void> {
    const now = new Date();
    for (const d of store.values()) {
      if (d.userId === userId && d.deviceId === deviceId && !d.revokedAt) d.lastSeenAt = now;
    }
  }

  async purgeRevokedBefore(olderThan: Date): Promise<number> {
    let count = 0;
    for (const [id, d] of store.entries()) {
      if (d.revokedAt && d.revokedAt < olderThan) {
        store.delete(id);
        count++;
      }
    }
    return count;
  }

  async revokeStaleBefore(olderThan: Date, reason: RevokeReason): Promise<number> {
    let count = 0;
    for (const d of store.values()) {
      if (!d.revokedAt && d.lastSeenAt < olderThan) {
        d.revokedAt = new Date();
        d.revokeReason = reason;
        count++;
      }
    }
    return count;
  }
}
