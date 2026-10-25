import { Prisma } from "@prisma/client";
import { prisma } from "../../../infrastructure/database";
import { ConflictError } from "../../../core/exceptions";
import type {
  BiometricCredential,
  BiometricCredentialCreateInput,
  BiometricCredentialUpdateInput,
  IBiometricCredentialRepository,
} from "./biometric-credential.repository.interface";

type Record_ = Awaited<ReturnType<typeof prisma.biometricCredential.findFirst>>;

export class PrismaBiometricCredentialRepository implements IBiometricCredentialRepository {
  private static mapEntity(record: NonNullable<Record_>): BiometricCredential {
    return {
      id: record.id,
      userId: record.userId,
      deviceId: record.deviceId,
      platform: record.platform,
      deviceName: record.deviceName,
      biometryKind: record.biometryKind,
      secretHash: record.secretHash,
      activeKey: record.activeKey,
      status: record.status,
      failedAttempts: record.failedAttempts,
      expiresAt: record.expiresAt,
      lastUsedAt: record.lastUsedAt,
      revokedAt: record.revokedAt,
      revokeReason: record.revokeReason,
      revokedBy: record.revokedBy,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  async findById(id: string): Promise<BiometricCredential | null> {
    const record = await prisma.biometricCredential.findUnique({ where: { id } });
    return record ? PrismaBiometricCredentialRepository.mapEntity(record) : null;
  }

  async findActiveByKey(activeKey: string): Promise<BiometricCredential | null> {
    const record = await prisma.biometricCredential.findUnique({ where: { activeKey } });
    return record ? PrismaBiometricCredentialRepository.mapEntity(record) : null;
  }

  async findActiveByUser(userId: string): Promise<BiometricCredential[]> {
    const records = await prisma.biometricCredential.findMany({
      where: { userId, status: "ACTIVE" },
      orderBy: { createdAt: "asc" },
    });
    return records.map(PrismaBiometricCredentialRepository.mapEntity);
  }

  async findActiveByUserAndId(userId: string, id: string): Promise<BiometricCredential | null> {
    const record = await prisma.biometricCredential.findFirst({
      where: { id, userId, status: "ACTIVE" },
    });
    return record ? PrismaBiometricCredentialRepository.mapEntity(record) : null;
  }

  async create(input: BiometricCredentialCreateInput): Promise<BiometricCredential> {
    try {
      const record = await prisma.biometricCredential.create({
        data: {
          userId: input.userId,
          deviceId: input.deviceId,
          platform: input.platform,
          deviceName: input.deviceName ?? null,
          biometryKind: input.biometryKind,
          secretHash: input.secretHash,
          activeKey: input.activeKey,
          expiresAt: input.expiresAt,
          // Ghi null TƯỜNG MINH cho trường về sau có thể bị lọc `{ field: null }` (Prisma+Mongo
          // không khớp trường vắng mặt với `null`).
          lastUsedAt: null,
          revokedAt: null,
          revokeReason: null,
          revokedBy: null,
        },
      });
      return PrismaBiometricCredentialRepository.mapEntity(record);
    } catch (err) {
      // `activeKey` unique: hai lượt bật sinh trắc học đồng thời cho cùng (người dùng, thiết bị).
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new ConflictError("Thiết bị đang được đăng ký sinh trắc học, vui lòng thử lại");
      }
      throw err;
    }
  }

  async incrementFailedAttempts(id: string): Promise<number | null> {
    try {
      const record = await prisma.biometricCredential.update({
        where: { id },
        data: { failedAttempts: { increment: 1 } },
        select: { failedAttempts: true },
      });
      return record.failedAttempts;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") return null;
      throw err;
    }
  }

  async update(
    id: string,
    input: BiometricCredentialUpdateInput
  ): Promise<BiometricCredential | null> {
    try {
      const record = await prisma.biometricCredential.update({
        where: { id },
        data: {
          ...(input.status !== undefined && { status: input.status }),
          ...(input.activeKey !== undefined && { activeKey: input.activeKey }),
          ...(input.failedAttempts !== undefined && { failedAttempts: input.failedAttempts }),
          ...(input.lastUsedAt !== undefined && { lastUsedAt: input.lastUsedAt }),
          ...(input.revokedAt !== undefined && { revokedAt: input.revokedAt }),
          ...(input.revokeReason !== undefined && { revokeReason: input.revokeReason }),
          ...(input.revokedBy !== undefined && { revokedBy: input.revokedBy }),
        },
      });
      return PrismaBiometricCredentialRepository.mapEntity(record);
    } catch (err) {
      // P2025 = không có bản ghi để cập nhật → null; lỗi khác (mất kết nối DB…) phải nổi lên.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") return null;
      throw err;
    }
  }

  async updateIfStatus(
    id: string,
    expectedStatus: "ACTIVE" | "REVOKED",
    input: BiometricCredentialUpdateInput
  ): Promise<boolean> {
    const result = await prisma.biometricCredential.updateMany({
      where: { id, status: expectedStatus },
      data: {
        ...(input.status !== undefined && { status: input.status }),
        ...(input.activeKey !== undefined && { activeKey: input.activeKey }),
        ...(input.failedAttempts !== undefined && { failedAttempts: input.failedAttempts }),
        ...(input.lastUsedAt !== undefined && { lastUsedAt: input.lastUsedAt }),
        ...(input.revokedAt !== undefined && { revokedAt: input.revokedAt }),
        ...(input.revokeReason !== undefined && { revokeReason: input.revokeReason }),
        ...(input.revokedBy !== undefined && { revokedBy: input.revokedBy }),
      },
    });
    return result.count > 0;
  }

  async findExpiredActive(now: Date, limit: number): Promise<BiometricCredential[]> {
    const records = await prisma.biometricCredential.findMany({
      where: { status: "ACTIVE", expiresAt: { lte: now } },
      take: limit,
    });
    return records.map(PrismaBiometricCredentialRepository.mapEntity);
  }

  async deleteRevokedOlderThan(cutoff: Date): Promise<number> {
    const result = await prisma.biometricCredential.deleteMany({
      where: { status: "REVOKED", revokedAt: { lt: cutoff } },
    });
    return result.count;
  }
}
