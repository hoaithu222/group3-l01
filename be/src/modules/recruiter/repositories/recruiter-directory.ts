import { normalizeEmail } from "../../../core/auth/normalize-email";
import { prisma } from "../../../infrastructure/database";
import type { RecruiterUser } from "../entities/recruiter.interface";

/**
 * Tra cứu NGƯỜI DÙNG chỉ đọc cho recruiter (mẫu `o2o/repositories/o2o-directory.ts`): tên hiển thị, trạng thái, ảnh; `email` chỉ để ghép thành viên công ty /
 * lời mời khi sinh viên đã chọn chia sẻ — KHÔNG bao giờ đưa vào TalentCard/TalentProfile. Tài khoản ANONYMIZED có `name = "Tài khoản đã xoá"` (UserAnonymizer ghi đè).
 */
export interface IRecruiterDirectory {
  findUser(id: string): Promise<RecruiterUser | null>;
  findUsers(ids: readonly string[]): Promise<Map<string, RecruiterUser>>;
  /** Khớp CHÍNH XÁC email đã chuẩn hoá. */
  findByEmail(email: string): Promise<RecruiterUser | null>;
  /** Đích (COMPANY | JOB_OFFER) có ≥ 1 báo cáo (bất kỳ trạng thái) — điều kiện vận hành xem nội dung lời mời bị báo cáo (D-06). Đọc CHỈ đếm bảng `Report` của `moderation`. */
  hasReport(targetType: "COMPANY" | "JOB_OFFER", targetId: string): Promise<boolean>;
  /** Tài khoản vận hành ACTIVE (admin/manager) nhận thông báo "có doanh nghiệp chờ duyệt". */
  opsRecipientIds(limit: number): Promise<string[]>;
}

const select = { id: true, name: true, email: true, status: true, role: true, avatarAssetId: true } as const;

const toUser = (r: { id: string; name: string; email: string; status: string; role: string; avatarAssetId: string | null }): RecruiterUser => ({
  id: r.id,
  name: r.name,
  email: r.email,
  status: r.status,
  role: r.role,
  avatarAssetId: r.avatarAssetId ?? null,
});

export class PrismaRecruiterDirectory implements IRecruiterDirectory {
  async findUser(id: string): Promise<RecruiterUser | null> {
    const r = await prisma.user.findUnique({ where: { id }, select });
    return r ? toUser(r) : null;
  }

  async findUsers(ids: readonly string[]): Promise<Map<string, RecruiterUser>> {
    if (ids.length === 0) return new Map();
    const rows = await prisma.user.findMany({ where: { id: { in: [...ids] } }, select });
    return new Map(rows.map((r) => [r.id, toUser(r)]));
  }

  async findByEmail(email: string): Promise<RecruiterUser | null> {
    const r = await prisma.user.findFirst({ where: { email: normalizeEmail(email) }, select });
    return r ? toUser(r) : null;
  }

  async hasReport(targetType: "COMPANY" | "JOB_OFFER", targetId: string): Promise<boolean> {
    return (await prisma.report.count({ where: { targetType, targetId } })) > 0;
  }

  async opsRecipientIds(limit: number): Promise<string[]> {
    const rows = await prisma.user.findMany({ where: { role: { in: ["admin", "manager"] }, status: "ACTIVE" }, select: { id: true }, take: limit });
    return rows.map((r) => r.id);
  }
}
