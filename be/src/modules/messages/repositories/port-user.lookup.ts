import { prisma } from "../../../infrastructure/database";
import type { AuthUser } from "../../../core/types/express";

/**
 * Tra người dùng cho cổng `IMessageSendPort` (p7-04): module khác gửi/đọc tin THAY một `userId` nên engine phải dựng lại `AuthUser` (id, email, tên, vai hệ thống) để dùng đúng đường
 * kiểm quyền của request thường (`MessageScope.canWrite/canRead` → `permissionService`). Chỉ tài khoản `ACTIVE` — khoá/xoá/ẩn danh không gửi/đọc thay được.
 */
export interface IPortUserLookup {
  findActive(userId: string): Promise<AuthUser | null>;
}

export class PrismaPortUserLookup implements IPortUserLookup {
  async findActive(userId: string): Promise<AuthUser | null> {
    const u = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, name: true, role: true, status: true } });
    if (!u || u.status !== "ACTIVE") return null;
    return { id: u.id, email: u.email, name: u.name, role: u.role, permissions: [] };
  }
}
