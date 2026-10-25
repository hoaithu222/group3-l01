import { createContextLogger } from "../../../infrastructure/logger";
import { createDeviceService } from "../../devices/public";

/**
 * Cổng gỡ push token (FCM/APNs VoIP) theo thiết bị — `DeviceService` (module `devices`, barrel công khai
 * `@modules/devices/public`) thoả cấu trúc. Chỉ cần hai thao tác có sẵn: liệt kê thiết bị đang nhận push và gỡ theo `deviceId`.
 */
export interface DeviceTokenPort {
  listActive(userId: string): Promise<Array<{ deviceId: string }>>;
  unregister(userId: string, deviceId: string): Promise<number>;
}

const log = createContextLogger({ service: "SessionDeviceCleanup" });

/**
 * Thu hồi phiên TỪ XA (thu hồi một phiên, đăng xuất mọi thiết bị, đổi/đặt lại mật khẩu, khoá tài khoản, yêu cầu xoá, phát hiện dùng
 * lại refresh token) phải cắt luôn push của các thiết bị đó — trước đây chỉ `POST /auth/logout` (có `X-Device-Id`) gỡ `DeviceToken`,
 * nên máy bị mất/bị đăng xuất từ xa vẫn nhận push (cả xem trước nội dung tin nhắn) cho tới khi token bị dọn (60 ngày) hoặc FCM báo hỏng.
 *
 * BEST-EFFORT: lỗi ở đây chỉ ghi log — không bao giờ làm hỏng việc thu hồi phiên (phần bảo mật quan trọng hơn dọn push).
 */
export class SessionDeviceCleanup {
  /** `null` = tắt (không gỡ gì). Mặc định: `DeviceService` thật (Prisma). */
  constructor(private readonly devices: DeviceTokenPort | null = createDeviceService()) {}

  /** Không còn phiên nào ⇒ gỡ MỌI thiết bị đang nhận push của tài khoản. */
  async unregisterAll(userId: string): Promise<void> {
    if (!this.devices) return;
    try {
      const active = await this.devices.listActive(userId);
      await this.unregisterDeviceIds(userId, active.map((d) => d.deviceId));
    } catch (err) {
      this.warn(userId, err);
    }
  }

  /**
   * Gỡ push của các thiết bị có phiên vừa bị thu hồi, TRỪ thiết bị còn ít nhất một phiên hoạt động khác (`stillActive`: phiên được giữ khi
   * đổi mật khẩu, hoặc hai phiên cùng `deviceId`) — máy còn đăng nhập không được mất push. Phiên không ghi `deviceId` (client không gửi
   * `X-Device-Id`) bỏ qua vì không biết token nào thuộc máy đó.
   */
  async unregisterRevoked(
    userId: string,
    revokedDeviceIds: ReadonlyArray<string | null | undefined>,
    stillActive: ReadonlySet<string>
  ): Promise<void> {
    if (!this.devices) return;
    const targets = revokedDeviceIds.filter((id): id is string => !!id && !stillActive.has(id));
    try {
      await this.unregisterDeviceIds(userId, targets);
    } catch (err) {
      this.warn(userId, err);
    }
  }

  private async unregisterDeviceIds(userId: string, deviceIds: readonly string[]): Promise<void> {
    const devices = this.devices;
    if (!devices) return;
    for (const deviceId of new Set(deviceIds)) {
      try {
        await devices.unregister(userId, deviceId);
      } catch (err) {
        this.warn(userId, err); // một thiết bị lỗi không chặn các thiết bị còn lại
      }
    }
  }

  private warn(userId: string, err: unknown): void {
    log.warn("Không gỡ được push token của thiết bị sau khi thu hồi phiên", {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
