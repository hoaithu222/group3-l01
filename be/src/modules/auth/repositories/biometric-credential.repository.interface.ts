export interface BiometricCredential {
  id: string;
  userId: string;
  deviceId: string;
  platform: "ANDROID" | "IOS" | "WEB";
  deviceName: string | null;
  biometryKind: "FACE" | "FINGERPRINT" | "IRIS" | "GENERIC";
  secretHash: string;
  activeKey: string;
  status: "ACTIVE" | "REVOKED";
  failedAttempts: number;
  expiresAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  revokeReason: string | null;
  revokedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface BiometricCredentialCreateInput {
  userId: string;
  deviceId: string;
  platform: "ANDROID" | "IOS" | "WEB";
  deviceName?: string | null;
  biometryKind: "FACE" | "FINGERPRINT" | "IRIS" | "GENERIC";
  secretHash: string;
  activeKey: string;
  expiresAt: Date;
}

export interface BiometricCredentialUpdateInput {
  status?: "ACTIVE" | "REVOKED";
  activeKey?: string;
  failedAttempts?: number;
  lastUsedAt?: Date | null;
  revokedAt?: Date | null;
  revokeReason?: string | null;
  revokedBy?: string | null;
}

/**
 * IBiometricCredentialRepository — interface cho repository credential sinh
 * trắc học. Impl: InMemoryBiometricCredentialRepository (test),
 * PrismaBiometricCredentialRepository (production).
 */
export interface IBiometricCredentialRepository {
  findById(id: string): Promise<BiometricCredential | null>;
  findActiveByKey(activeKey: string): Promise<BiometricCredential | null>;
  findActiveByUser(userId: string): Promise<BiometricCredential[]>;
  findActiveByUserAndId(userId: string, id: string): Promise<BiometricCredential | null>;
  create(input: BiometricCredentialCreateInput): Promise<BiometricCredential>;
  update(id: string, input: BiometricCredentialUpdateInput): Promise<BiometricCredential | null>;
  /**
   * Tăng `failedAttempts` NGUYÊN TỬ (`$inc`) và trả giá trị mới — đọc rồi ghi `cũ + 1`
   * thì các lần thử sai đồng thời cùng ghi lại một giá trị, đếm thiếu và né được ngưỡng khoá.
   * `null` nếu credential không tồn tại.
   */
  incrementFailedAttempts(id: string): Promise<number | null>;
  /**
   * Compare-and-set: chỉ cập nhật nếu `status` hiện tại vẫn khớp `expectedStatus`
   * — tránh race giữa "đăng nhập thành công" và "bị thu hồi" xảy ra đồng thời.
   * Trả `true` nếu cập nhật thành công.
   */
  updateIfStatus(
    id: string,
    expectedStatus: "ACTIVE" | "REVOKED",
    input: BiometricCredentialUpdateInput
  ): Promise<boolean>;
  /** ACTIVE đã quá `expiresAt` — dùng cho `auth.biometric-cleanup` (p0-04), giới hạn theo lô. */
  findExpiredActive(now: Date, limit: number): Promise<BiometricCredential[]>;
  /** Xoá cứng REVOKED có `revokedAt` trước `cutoff` — trả số bản ghi đã xoá. */
  deleteRevokedOlderThan(cutoff: Date): Promise<number>;
}
