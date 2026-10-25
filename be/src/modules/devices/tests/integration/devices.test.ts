/**
 * Integration — `DeviceService` chạy trên Prisma thật (Mongo memory replset,
 * `TEST_DB=memory`) — PUSH-01/PUSH-02 (README §8) + giới hạn thiết bị + logout.
 */
import { prisma } from "../../../../infrastructure/database";
import { newObjectId } from "../../../../core/utils/object-id";
import { DeviceService } from "../../services/device.service";
import { PrismaDeviceRepository } from "../../repositories/device.repository.prisma";
import { LIMITS } from "../../../../core/constants/limits";

describe("DeviceService (integration — Mongo memory replset)", () => {
  const service = new DeviceService(new PrismaDeviceRepository());
  const userA = newObjectId();
  const userB = newObjectId();

  afterEach(async () => {
    await prisma.deviceToken.deleteMany({ where: { userId: { in: [userA, userB] } } });
  });

  it("PUSH-01: đăng ký lại cùng token → 1 bản ghi, lastSeenAt cập nhật", async () => {
    const deviceId = "device-1";
    const token = `tok-${newObjectId()}`;
    await service.register({ userId: userA, deviceId, platform: "ANDROID", kind: "FCM", token });
    const first = await prisma.deviceToken.findUnique({ where: { token } });

    await new Promise((r) => setTimeout(r, 5));
    await service.register({ userId: userA, deviceId, platform: "ANDROID", kind: "FCM", token });
    const second = await prisma.deviceToken.findUnique({ where: { token } });

    const count = await prisma.deviceToken.count({ where: { token } });
    expect(count).toBe(1);
    expect(second!.lastSeenAt.getTime()).toBeGreaterThanOrEqual(first!.lastSeenAt.getTime());
  });

  it("PUSH-02: cùng máy đổi tài khoản → token reassign sang user mới, user cũ không còn active token này", async () => {
    const deviceId = "shared-device";
    const token = `tok-${newObjectId()}`;
    await service.register({ userId: userA, deviceId, platform: "ANDROID", kind: "FCM", token });
    await service.register({ userId: userB, deviceId, platform: "ANDROID", kind: "FCM", token });

    const record = await prisma.deviceToken.findUnique({ where: { token } });
    expect(record!.userId).toBe(userB);

    const activeForA = await service.getActiveFcmTokens(userA);
    expect(activeForA).not.toContain(token);
  });

  it("token xoay (thiết bị đăng ký token FCM mới) → token cũ bị revoke TOKEN_ROTATED", async () => {
    const deviceId = "device-rotate";
    const oldToken = `tok-old-${newObjectId()}`;
    const newToken = `tok-new-${newObjectId()}`;
    await service.register({ userId: userA, deviceId, platform: "ANDROID", kind: "FCM", token: oldToken });
    await service.register({ userId: userA, deviceId, platform: "ANDROID", kind: "FCM", token: newToken });

    const old = await prisma.deviceToken.findUnique({ where: { token: oldToken } });
    expect(old!.revokedAt).not.toBeNull();
    expect(old!.revokeReason).toBe("TOKEN_ROTATED");

    const active = await service.getActiveFcmTokens(userA);
    expect(active).toEqual([newToken]);
  });

  it("vượt maxDevicesPerUser → thu hồi thiết bị cũ nhất, KHÔNG lỗi", async () => {
    const tokens: string[] = [];
    for (let i = 0; i < LIMITS.notification.maxDevicesPerUser; i++) {
      const token = `tok-limit-${i}-${newObjectId()}`;
      tokens.push(token);
      await service.register({ userId: userA, deviceId: `device-${i}`, platform: "ANDROID", kind: "FCM", token });
      await new Promise((r) => setTimeout(r, 2));
    }

    // (maxDevicesPerUser + 1)-th thiết bị → không throw, chỉ evict thiết bị cũ nhất (device-0)
    const extraToken = `tok-limit-extra-${newObjectId()}`;
    await expect(
      service.register({ userId: userA, deviceId: "device-extra", platform: "ANDROID", kind: "FCM", token: extraToken })
    ).resolves.toBeDefined();

    const oldest = await prisma.deviceToken.findUnique({ where: { token: tokens[0] } });
    expect(oldest!.revokedAt).not.toBeNull();
    expect(oldest!.revokeReason).toBe("DEVICE_LIMIT");

    const activeCount = (await service.listActive(userA)).length;
    expect(activeCount).toBeLessThanOrEqual(LIMITS.notification.maxDevicesPerUser);
  });

  it("unregister (logout) → revoke mọi token (mọi kind) của deviceId đó", async () => {
    const deviceId = "device-logout";
    const fcmToken = `tok-fcm-${newObjectId()}`;
    const voipToken = `tok-voip-${newObjectId()}`;
    await service.register({ userId: userA, deviceId, platform: "IOS", kind: "FCM", token: fcmToken });
    await service.register({
      userId: userA,
      deviceId,
      platform: "IOS",
      kind: "APNS_VOIP",
      token: voipToken,
      environment: "SANDBOX",
    });

    const revoked = await service.unregister(userA, deviceId);

    expect(revoked).toBe(2);
    expect(await service.hasActiveDevice(userA)).toBe(false);
  });

  it("listActive gộp theo deviceId, đánh dấu current đúng thiết bị", async () => {
    const deviceId = "device-current";
    await service.register({ userId: userA, deviceId, platform: "IOS", kind: "FCM", token: `t1-${newObjectId()}` });
    await service.register({
      userId: userA,
      deviceId,
      platform: "IOS",
      kind: "APNS_VOIP",
      token: `t2-${newObjectId()}`,
      environment: "SANDBOX",
    });

    const list = await service.listActive(userA, deviceId);
    const row = list.find((d) => d.deviceId === deviceId);
    expect(row?.kinds.sort()).toEqual(["APNS_VOIP", "FCM"]);
    expect(row?.current).toBe(true);
  });
});
