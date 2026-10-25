import { prisma } from "../../infrastructure/database";

/** Trần số credential đọc mỗi lượt thu hồi — chỉ để không quét vô hạn khi dữ liệu bất thường. */
const REVOKE_ALL_MAX = 200;

/**
 * Lý do thu hồi — chuỗi tự do (không enum) như `DeviceToken.revokeReason`,
 * thêm lý do mới không cần `prisma db push`.
 */
export type BiometricRevokeReason =
  | "REPLACED"
  | "USER_DISABLED"
  | "ACCOUNT_SWITCHED"
  | "PASSWORD_CHANGED"
  | "PASSWORD_RESET"
  | "SESSIONS_REVOKED"
  | "REUSE_DETECTED"
  | "ACCOUNT_LOCKED"
  | "DELETION_REQUESTED"
  | "TOO_MANY_ATTEMPTS"
  | "EXPIRED"
  | "DEVICE_LIMIT"
  | "ADMIN";

export interface AdminBiometricCredentialDto {
  id: string;
  deviceName: string | null;
  deviceIdMasked: string;
  platform: string;
  biometryKind: string;
  status: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date;
  revokedAt: Date | null;
  revokeReason: string | null;
}

/** Rút gọn deviceId cho response admin — chỉ hiện 6 ký tự cuối. */
function maskDeviceId(deviceId: string): string {
  return deviceId.length <= 6 ? `••••${deviceId}` : `••••${deviceId.slice(-6)}`;
}

/**
 * Cổng dùng chung để thu hồi/đọc `BiometricCredential` từ NGOÀI
 * `modules/auth` — vd đổi mật khẩu, khoá tài khoản, yêu cầu xoá tài khoản
 * (`modules/users`) — mà không phải import trực tiếp module `auth`
 * (⛔ modules/users không import modules/auth). Truy vấn thẳng Prisma, cùng lý
 * do `core/permission/user-status.ts` đọc thẳng `prisma.user` thay vì qua
 * repository của module `users`.
 */
export class BiometricCredentialRevoker {
  /**
   * Thu hồi mọi credential ACTIVE của 1 user.
   *
   * MongoDB không cho `updateMany` gán giá trị khác nhau theo từng bản ghi
   * (`activeKey` phải đổi thành `"revoked:<id>"` — duy nhất theo id từng bản)
   * nên phải đọc id ACTIVE trước rồi cập nhật từng bản trong 1 transaction.
   */
  static async revokeAllForUser(
    userId: string,
    reason: BiometricRevokeReason,
    revokedBy?: string
  ): Promise<number> {
    // Trần `perUserMax` chỉ được ép lúc enroll (đọc-rồi-ghi, không nguyên tử) nên hai lượt bật đồng thời có thể để lại
    // NHIỀU hơn `perUserMax` credential ACTIVE — thu hồi HẾT (trần an toàn 200), không cắt ở `perUserMax + 1` bỏ sót.
    const active = await prisma.biometricCredential.findMany({
      where: { userId, status: "ACTIVE" },
      select: { id: true },
      take: REVOKE_ALL_MAX,
    });
    if (active.length === 0) return 0;

    const now = new Date();
    await prisma.$transaction(
      active.map((c) =>
        prisma.biometricCredential.update({
          where: { id: c.id },
          data: {
            status: "REVOKED",
            activeKey: `revoked:${c.id}`,
            revokeReason: reason,
            revokedAt: now,
            ...(revokedBy && { revokedBy }),
          },
        })
      )
    );
    return active.length;
  }

  /** Danh sách credential của 1 user cho admin — không bao giờ trả `secretHash`/deviceId đầy đủ. */
  static async adminListForUser(
    userId: string,
    status: "ACTIVE" | "REVOKED" | "ALL" = "ACTIVE"
  ): Promise<AdminBiometricCredentialDto[]> {
    const records = await prisma.biometricCredential.findMany({
      where: { userId, ...(status !== "ALL" && { status }) },
      orderBy: { createdAt: "desc" },
    });
    return records.map((r) => ({
      id: r.id,
      deviceName: r.deviceName,
      deviceIdMasked: maskDeviceId(r.deviceId),
      platform: r.platform,
      biometryKind: r.biometryKind,
      status: r.status,
      createdAt: r.createdAt,
      lastUsedAt: r.lastUsedAt,
      expiresAt: r.expiresAt,
      revokedAt: r.revokedAt,
      revokeReason: r.revokeReason,
    }));
  }

  /**
   * Thu hồi 1 credential cụ thể (admin) — idempotent: đã REVOKED vẫn coi là
   * thành công. Trả `false` nếu không tìm thấy hoặc không thuộc `userId`.
   */
  static async revokeOneForUser(
    userId: string,
    credentialId: string,
    reason: BiometricRevokeReason,
    revokedBy: string
  ): Promise<boolean> {
    const record = await prisma.biometricCredential.findFirst({
      where: { id: credentialId, userId },
    });
    if (!record) return false;
    if (record.status === "REVOKED") return true;

    await prisma.biometricCredential.update({
      where: { id: record.id },
      data: {
        status: "REVOKED",
        activeKey: `revoked:${record.id}`,
        revokeReason: reason,
        revokedAt: new Date(),
        revokedBy,
      },
    });
    return true;
  }
}
