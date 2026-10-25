import { Prisma, type UserIntegration } from "@prisma/client";
import { isSealedSecret, type SealedSecret } from "../../../core/utils/crypto";
import type { IntegrationProviderValue } from "../../../core/constants/integration";
import { prisma, withTransaction } from "../../../infrastructure/database";
import { outbox } from "../../../infrastructure/queue";
import type { IntegrationStatusValue, UserIntegrationEntity } from "../entities/integration.interface";
import type { IUserIntegrationRepository, UpsertUserIntegrationInput } from "./user-integration.repository.interface";

export function toUserIntegrationEntity(row: UserIntegration): UserIntegrationEntity {
  return {
    id: row.id,
    userId: row.userId,
    provider: row.provider,
    externalAccountId: row.externalAccountId,
    credentials: isSealedSecret(row.credentials) ? row.credentials : null,
    tokenExpiresAt: row.tokenExpiresAt,
    calendarId: row.calendarId,
    status: row.status,
    statusReason: row.statusReason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const sealed = (v: SealedSecret | null): Prisma.InputJsonValue | null => (v ? (v as unknown as Prisma.InputJsonValue) : null);

export class PrismaUserIntegrationRepository implements IUserIntegrationRepository {
  async findById(id: string): Promise<UserIntegrationEntity | null> {
    const row = await prisma.userIntegration.findUnique({ where: { id } });
    return row ? toUserIntegrationEntity(row) : null;
  }

  async listByUser(userId: string): Promise<UserIntegrationEntity[]> {
    const rows = await prisma.userIntegration.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });
    return rows.map(toUserIntegrationEntity);
  }

  async findByUserProvider(userId: string, provider: IntegrationProviderValue): Promise<UserIntegrationEntity | null> {
    const row = await prisma.userIntegration.findFirst({ where: { userId, provider } });
    return row ? toUserIntegrationEntity(row) : null;
  }

  async upsert(input: UpsertUserIntegrationInput): Promise<UserIntegrationEntity> {
    try {
      return await this.upsertOnce(input);
    } catch (err) {
      // Hai lần nối đồng thời: bên thua gặp P2002 (transaction đã abort) → chạy lại và cập nhật hàng vừa được tạo.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return this.upsertOnce(input);
      throw err;
    }
  }

  private upsertOnce(input: UpsertUserIntegrationInput): Promise<UserIntegrationEntity> {
    return withTransaction(async (tx) => {
      const existing = await tx.userIntegration.findFirst({ where: { userId: input.userId, provider: input.provider } });
      const data = {
        externalAccountId: input.externalAccountId,
        credentials: sealed(input.credentials),
        tokenExpiresAt: input.tokenExpiresAt,
        status: "ACTIVE" as const,
        statusReason: null,
      };
      const row = existing
        ? await tx.userIntegration.update({ where: { id: existing.id }, data })
        : await tx.userIntegration.create({ data: { userId: input.userId, provider: input.provider, calendarId: "primary", ...data } });
      for (const event of input.outbox?.(row.id) ?? []) await outbox.add(tx, event);
      return toUserIntegrationEntity(row);
    });
  }

  async saveCredentials(id: string, credentials: SealedSecret | null, tokenExpiresAt: Date | null): Promise<void> {
    await prisma.userIntegration.updateMany({ where: { id }, data: { credentials: sealed(credentials), tokenExpiresAt } });
  }

  async setStatus(id: string, status: IntegrationStatusValue, reason: string | null, clearCredentials = false): Promise<UserIntegrationEntity | null> {
    const res = await prisma.userIntegration.updateMany({
      where: { id },
      data: { status, statusReason: reason, ...(clearCredentials && { credentials: null, tokenExpiresAt: null }) },
    });
    return res.count === 0 ? null : this.findById(id);
  }

  async delete(id: string): Promise<void> {
    await prisma.userIntegration.deleteMany({ where: { id } });
  }

  async findActiveByUserIds(userIds: string[], provider: IntegrationProviderValue): Promise<UserIntegrationEntity[]> {
    if (userIds.length === 0) return [];
    const rows = await prisma.userIntegration.findMany({ where: { userId: { in: userIds }, provider, status: "ACTIVE" } });
    return rows.map(toUserIntegrationEntity);
  }
}
