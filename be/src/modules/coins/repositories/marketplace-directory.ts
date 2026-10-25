import { prisma } from "../../../infrastructure/database";

export interface SellerBrief {
  name: string;
}

/**
 * Tra cứu phụ trợ cho chợ tài liệu (P1) — CHỈ tên người bán (hiển thị thẻ/chi tiết listing) và cấp độ gamification (điều kiện bỏ qua kiểm duyệt, be.md §5 "Listing create"). Đọc TRỰC TIẾP
 * bảng `User`/`UserGamification` (module khác), theo ĐÚNG tiền lệ `PrismaCoinsDirectory` (đọc `User` cho múi giờ/trạng thái) — module `gamification` chưa xuất khẩu qua `public.ts` một cổng
 * đọc cấp độ hàng loạt cho module khác, nên đặt cổng RIÊNG ở đây (không sửa `directory.ts`/`ICoinsDirectory` đang dùng chung cho P0, tránh phá kiểu của test có sẵn).
 */
export interface IMarketplaceDirectory {
  getUsersBrief(userIds: readonly string[]): Promise<Map<string, SellerBrief>>;
  /** Cấp độ hiện tại (mặc định 1 nếu chưa có `UserGamification`). */
  getLevel(userId: string): Promise<number>;
}

export class PrismaMarketplaceDirectory implements IMarketplaceDirectory {
  async getUsersBrief(userIds: readonly string[]): Promise<Map<string, SellerBrief>> {
    const ids = [...new Set(userIds)];
    if (ids.length === 0) return new Map();
    const rows = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
    return new Map(rows.map((r) => [r.id, { name: r.name }]));
  }

  async getLevel(userId: string): Promise<number> {
    const row = await prisma.userGamification.findUnique({ where: { userId }, select: { level: true } });
    return row?.level ?? 1;
  }
}
