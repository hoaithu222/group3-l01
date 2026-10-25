import { prisma } from "../../../infrastructure/database";
import { safeTimeZone } from "../../../core/utils/local-date";
import type { CoinUser } from "../entities/coins.interface";

/** Tra cứu người dùng cho `coins` — CHỈ múi giờ + trạng thái (không email/điện thoại/tên). */
export interface ICoinsDirectory {
  /** Múi giờ hợp lệ (rỗng/lạ → `Asia/Ho_Chi_Minh`) và trạng thái; `null` = không có người dùng. */
  getUser(userId: string): Promise<CoinUser | null>;
}

export class PrismaCoinsDirectory implements ICoinsDirectory {
  async getUser(userId: string): Promise<CoinUser | null> {
    const row = await prisma.user.findUnique({ where: { id: userId }, select: { timezone: true, status: true } });
    return row ? { timezone: safeTimeZone(row.timezone), status: row.status } : null;
  }
}
