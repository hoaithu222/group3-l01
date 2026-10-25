/**
 * Integration — `AdminPushService` (be.md §4/§8 PUSH-13) trên Prisma thật
 * (Mongo memory replset) cho `DeviceToken`; `infrastructure/push` mock để
 * kiểm soát kết quả gửi FCM/VoIP tất định (không phụ thuộc Firebase/Apple thật).
 */
const mockSendMulticast = jest.fn();
const mockVoipSend = jest.fn();
jest.mock("../../../../infrastructure/push", () => ({
  getPushSender: () => ({ sendMulticast: mockSendMulticast }),
  getVoipSender: () => ({ send: mockVoipSend }),
  isPushConfigured: () => true,
  isVoipConfigured: () => true,
}));

const mockAuditRecord = jest.fn().mockResolvedValue(undefined);
jest.mock("../../../audit-log/audit-log.service", () => ({
  AuditService: jest.fn().mockImplementation(() => ({ record: mockAuditRecord })),
}));

// Cờ `push` không cần bật thật trong test integration (biến môi trường đọc
// 1 lần lúc import `core/config`, quá muộn để set trong `beforeAll`) — mock
// thẳng `isModuleEnabled` để luôn coi như đã bật, giống cách các test khác
// né đặc thù "đọc env 1 lần lúc module load".
jest.mock("../../../../core/constants/modules", () => ({
  ...jest.requireActual("../../../../core/constants/modules"),
  isModuleEnabled: () => true,
}));

import { prisma } from "../../../../infrastructure/database";
import { newObjectId } from "../../../../core/utils/object-id";
import { AdminPushService } from "../../admin-push.service";
import { DeviceService } from "../../../devices/services/device.service";
import { PrismaDeviceRepository } from "../../../devices/repositories/device.repository.prisma";
import { adminPushTestSchema } from "../../admin-push.validators";
import { PushNoDeviceError } from "../../../../core/exceptions";

describe("AdminPushService (integration — Mongo memory replset)", () => {
  const devices = new DeviceService(new PrismaDeviceRepository());
  const service = new AdminPushService(devices);
  const admin = newObjectId();
  const target = newObjectId();

  afterEach(async () => {
    await prisma.deviceToken.deleteMany({ where: { userId: { in: [admin, target] } } });
    mockSendMulticast.mockReset();
    mockVoipSend.mockReset();
    mockAuditRecord.mockClear();
  });

  it("PUSH-13: thiếu lý do → Zod từ chối (400)", () => {
    const result = adminPushTestSchema.safeParse({ userId: target, type: "message.new" });
    expect(result.success).toBe(false);
  });

  it("PUSH-13: có lý do hợp lệ + có thiết bị → gửi FCM, có audit", async () => {
    await devices.register({ userId: target, deviceId: "d1", platform: "ANDROID", kind: "FCM", token: `tok-${newObjectId()}` });
    mockSendMulticast.mockResolvedValue({ successCount: 1, invalidTokens: [] });

    const result = await service.sendTest({
      actorId: admin,
      actorRole: "admin",
      targetUserId: target,
      type: "message.new",
      reason: "Kiểm tra push đầu năm cho toàn bộ hệ thống",
    });

    expect(result.fcm).toEqual({ sent: 1, failed: 0 });
    expect(mockAuditRecord).toHaveBeenCalledWith(
      expect.objectContaining({ action: "push.test", targetId: target, actorId: admin })
    );
  });

  it("user không có thiết bị nào → PUSH_002 (PushNoDeviceError)", async () => {
    await expect(
      service.sendTest({ actorId: admin, targetUserId: target, type: "message.new", reason: "Không có thiết bị nào cả" })
    ).rejects.toBeInstanceOf(PushNoDeviceError);
  });

  it("type=call.incoming + có APNs VoIP token → gửi cả FCM lẫn VoIP", async () => {
    await devices.register({ userId: target, deviceId: "d1", platform: "IOS", kind: "FCM", token: `tok-fcm-${newObjectId()}` });
    await devices.register({
      userId: target,
      deviceId: "d1",
      platform: "IOS",
      kind: "APNS_VOIP",
      token: `tok-voip-${newObjectId()}`,
      environment: "SANDBOX",
    });
    mockSendMulticast.mockResolvedValue({ successCount: 1, invalidTokens: [] });
    mockVoipSend.mockResolvedValue({ ok: true, status: 200, shouldRevoke: false, retriable: false });

    const result = await service.sendTest({
      actorId: admin,
      targetUserId: target,
      type: "call.incoming",
      reason: "Kiểm tra chuông VoIP trước khi phát hành bản mới",
    });

    expect(result.fcm.sent).toBe(1);
    expect(result.voip.sent).toBe(1);
    expect(mockVoipSend).toHaveBeenCalledTimes(1);
  });

  it("FCM trả token chết → revoke token đó", async () => {
    const token = `tok-dead-${newObjectId()}`;
    await devices.register({ userId: target, deviceId: "d1", platform: "ANDROID", kind: "FCM", token });
    mockSendMulticast.mockResolvedValue({ successCount: 0, invalidTokens: [token] });

    await service.sendTest({ actorId: admin, targetUserId: target, type: "message.new", reason: "Kiểm tra token chết có bị thu hồi" });

    const record = await prisma.deviceToken.findUnique({ where: { token } });
    expect(record!.revokedAt).not.toBeNull();
    expect(record!.revokeReason).toBe("FCM_UNREGISTERED");
  });
});
