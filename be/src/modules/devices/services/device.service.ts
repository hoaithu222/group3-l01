import { logger } from "../../../infrastructure/logger";
import { LIMITS } from "../../../core/constants/limits";
import { DeviceInvalidError } from "../../../core/exceptions";
import type { IDeviceRepository } from "../repositories/device.repository.interface";
import type {
  ActiveDeviceSummary,
  ApnsEnvironmentValue,
  RegisterDeviceInput,
  RegisterDeviceResult,
  RevokeReason,
} from "../entities/device.interface";

export interface VoipTokenRow {
  token: string;
  environment: ApnsEnvironmentValue;
  bundleId: string | null;
}

/**
 * Devices — module Full (be.md §5.1). `register()` bao gồm cả reassign token
 * (đổi tài khoản trên cùng máy — NT-07) và tự thu hồi thiết bị cũ nhất khi
 * vượt `LIMITS.notification.maxDevicesPerUser` (KHÔNG lỗi — chỉ lỗi khi input
 * không hợp lệ, đã được Zod chặn phần lớn).
 */
export class DeviceService {
  constructor(private readonly repo: IDeviceRepository) {}

  async register(input: RegisterDeviceInput): Promise<RegisterDeviceResult> {
    if (!input.token.trim()) throw new DeviceInvalidError("Token thiết bị rỗng");

    const device = await this.repo.upsertByToken(input);

    // Token xoay (thiết bị đăng ký lại token FCM mới) — thu hồi bản ghi cũ
    // cùng (userId, deviceId, kind) còn tham chiếu token trước đó.
    await this.repo.revokeOtherTokensForDevice(input.userId, input.deviceId, input.kind, input.token, "TOKEN_ROTATED");

    await this.enforceDeviceLimit(input.userId, input.deviceId);

    return { id: device.id, deviceId: device.deviceId, kind: device.kind, platform: device.platform };
  }

  /** Vượt `maxDevicesPerUser` (theo `deviceId` distinct) → revoke thiết bị có `lastSeenAt` cũ nhất, KHÔNG lỗi (be.md §5.1 bước 3). */
  private async enforceDeviceLimit(userId: string, justRegisteredDeviceId: string): Promise<void> {
    const active = await this.repo.listActiveDeviceIds(userId);
    if (active.length <= LIMITS.notification.maxDevicesPerUser) return;

    const oldest = active
      .filter((d) => d.deviceId !== justRegisteredDeviceId)
      .sort((a, b) => a.lastSeenAt.getTime() - b.lastSeenAt.getTime())[0];
    if (!oldest) return;

    await this.repo.revokeByDeviceId(userId, oldest.deviceId, "DEVICE_LIMIT");
    logger.info("[devices] Vượt giới hạn thiết bị — đã thu hồi thiết bị cũ nhất", {
      userId,
      revokedDeviceId: oldest.deviceId,
    });
  }

  /** Logout (`X-Device-Id`) — revoke mọi token (mọi kind) của thiết bị đó. */
  async unregister(userId: string, deviceId: string): Promise<number> {
    return this.repo.revokeByDeviceId(userId, deviceId, "LOGOUT");
  }

  async listActive(userId: string, currentDeviceId?: string): Promise<ActiveDeviceSummary[]> {
    const tokens = await this.repo.listActive(userId);
    const byDevice = new Map<string, ActiveDeviceSummary>();
    for (const t of tokens) {
      const existing = byDevice.get(t.deviceId);
      if (existing) {
        if (!existing.kinds.includes(t.kind)) existing.kinds.push(t.kind);
        if (t.lastSeenAt > existing.lastSeenAt) existing.lastSeenAt = t.lastSeenAt;
        continue;
      }
      byDevice.set(t.deviceId, {
        deviceId: t.deviceId,
        platform: t.platform,
        kinds: [t.kind],
        appVersion: t.appVersion,
        lastSeenAt: t.lastSeenAt,
        current: t.deviceId === currentDeviceId,
      });
    }
    return [...byDevice.values()].sort((a, b) => b.lastSeenAt.getTime() - a.lastSeenAt.getTime());
  }

  async revokeTokens(tokens: string[], reason: RevokeReason): Promise<number> {
    return this.repo.revokeByTokens(tokens, reason);
  }

  async touch(userId: string, deviceId: string): Promise<void> {
    await this.repo.touch(userId, deviceId);
  }

  // ── Dùng bởi notify pipeline (push.jobs.ts, admin-push) — port structural typing ──

  async getActiveFcmTokens(userId: string): Promise<string[]> {
    const rows = await this.repo.getActiveTokensByKind(userId, "FCM");
    return rows.map((r) => r.token);
  }

  async getActiveVoipTokens(userId: string): Promise<VoipTokenRow[]> {
    const rows = await this.repo.getActiveTokensByKind(userId, "APNS_VOIP");
    return rows
      .filter((r): r is typeof r & { environment: ApnsEnvironmentValue } => r.environment !== null)
      .map((r) => ({ token: r.token, environment: r.environment, bundleId: r.bundleId }));
  }

  async hasActiveDevice(userId: string): Promise<boolean> {
    return this.repo.hasActiveToken(userId);
  }

  // ── `push.token-cleanup` (be.md §5.7) ──

  async purgeRevokedBefore(olderThan: Date): Promise<number> {
    return this.repo.purgeRevokedBefore(olderThan);
  }

  async revokeStaleBefore(olderThan: Date): Promise<number> {
    return this.repo.revokeStaleBefore(olderThan, "STALE");
  }
}
