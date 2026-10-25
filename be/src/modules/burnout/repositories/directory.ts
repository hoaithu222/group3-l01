import { prisma } from "../../../infrastructure/database";
import { safeTimeZone } from "../../../core/utils/local-date";
import type { BurnoutUser } from "../entities/burnout.interface";

/** Tra cứu người dùng cho `burnout` — CHỈ múi giờ + trạng thái (không email/điện thoại/tên). */
export interface IBurnoutDirectory {
  /** Múi giờ hợp lệ (rỗng/lạ → `Asia/Ho_Chi_Minh`) của người dùng ĐANG HOẠT ĐỘNG; `null` = không có/bị khoá/đã ẩn danh hoá. */
  getActiveUser(userId: string): Promise<BurnoutUser | null>;

  /** Múi giờ của các người dùng ĐANG HOẠT ĐỘNG trong `userIds` (người khác vắng khỏi kết quả). */
  activeTimezones(userIds: readonly string[]): Promise<Map<string, string>>;

  /** P1 — tên nhóm theo id (CHỈ id + tên, cho danh sách "chia sẻ với trưởng nhóm"). Id không tồn tại vắng khỏi map. */
  workspaceNames(ids: readonly string[]): Promise<Map<string, string>>;
}

export class PrismaBurnoutDirectory implements IBurnoutDirectory {
  async getActiveUser(userId: string): Promise<BurnoutUser | null> {
    const row = await prisma.user.findUnique({ where: { id: userId }, select: { timezone: true, status: true } });
    return row && row.status === "ACTIVE" ? { timezone: safeTimeZone(row.timezone) } : null;
  }

  async activeTimezones(userIds: readonly string[]): Promise<Map<string, string>> {
    if (userIds.length === 0) return new Map();
    const rows = await prisma.user.findMany({ where: { id: { in: [...userIds] }, status: "ACTIVE" }, select: { id: true, timezone: true } });
    return new Map(rows.map((r) => [r.id, safeTimeZone(r.timezone)]));
  }

  async workspaceNames(ids: readonly string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const rows = await prisma.workspace.findMany({ where: { id: { in: [...ids] } }, select: { id: true, name: true } });
    return new Map(rows.map((r) => [r.id, r.name]));
  }
}
