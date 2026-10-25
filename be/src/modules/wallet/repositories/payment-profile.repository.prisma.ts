import type { UserPaymentProfile } from "@prisma/client";
import { prisma } from "../../../infrastructure/database";
import type { PaymentProfile } from "../entities/wallet.interface";
import type { IPaymentProfileRepository, NewPaymentProfile } from "./payment-profile.repository.interface";

function toProfile(row: UserPaymentProfile): PaymentProfile {
  return {
    id: row.id,
    userId: row.userId,
    bankBin: row.bankBin,
    accountNumberEnc: row.accountNumberEnc,
    accountLast4: row.accountLast4,
    accountName: row.accountName,
    isDefault: row.isDefault,
    createdAt: row.createdAt,
  };
}

export class PrismaPaymentProfileRepository implements IPaymentProfileRepository {
  async listByUser(userId: string): Promise<PaymentProfile[]> {
    const rows = await prisma.userPaymentProfile.findMany({
      where: { userId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    });
    return rows.map(toProfile);
  }

  async findById(userId: string, id: string): Promise<PaymentProfile | null> {
    const row = await prisma.userPaymentProfile.findFirst({ where: { id, userId } });
    return row ? toProfile(row) : null;
  }

  async findDefault(userId: string): Promise<PaymentProfile | null> {
    const row = await prisma.userPaymentProfile.findFirst({
      where: { userId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    });
    return row ? toProfile(row) : null;
  }

  async count(userId: string): Promise<number> {
    return prisma.userPaymentProfile.count({ where: { userId } });
  }

  async create(data: NewPaymentProfile): Promise<PaymentProfile> {
    return toProfile(await prisma.userPaymentProfile.create({ data }));
  }

  async setDefault(userId: string, id: string): Promise<void> {
    await prisma.$transaction([
      prisma.userPaymentProfile.updateMany({ where: { userId, id: { not: id } }, data: { isDefault: false } }),
      prisma.userPaymentProfile.updateMany({ where: { userId, id }, data: { isDefault: true } }),
    ]);
  }

  async delete(userId: string, id: string): Promise<boolean> {
    const result = await prisma.userPaymentProfile.deleteMany({ where: { id, userId } });
    return result.count > 0;
  }
}
