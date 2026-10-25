import { prisma } from "../../../infrastructure/database";
import { maskEmail, type ContactQuery } from "../../../core/utils/contact-query";
import { maskPhone } from "../../../core/utils/phone";
import {
  MAX_CONTACT_MATCHES,
  type ContactMatch,
  type UserContactLookupPort,
} from "../../../shared/ports/user-contact-lookup.port";
import type { UserPrivacy } from "../entities/user.interface";
import { avatarUrlOf } from "../../../shared/media";

interface CandidateRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  privacy: UserPrivacy | null;
  avatarAssetId: string | null;
}

/** Vắng/`null` ≡ cho phép (tài liệu `privacy` cũ chưa có hai cờ này). */
function findable(privacy: UserPrivacy | null, flag: "findableByEmail" | "findableByPhone"): boolean {
  return privacy?.[flag] !== false;
}

/**
 * `UserContactLookupPort` cài bằng Prisma — xem hợp đồng và lý do các luật (khớp chính xác, ACTIVE, tôn trọng riêng tư, trung tính)
 * ở `shared/ports/user-contact-lookup.port.ts`. Bộ lọc riêng tư làm bằng JS SAU truy vấn (kết quả tối đa vài dòng) thay vì điều kiện
 * Mongo trên kiểu nhúng `privacy`: tài liệu cũ vắng cả object `privacy` nên điều kiện phủ định dễ sai một cách âm thầm.
 */
export class UserContactLookupService implements UserContactLookupPort {
  async findByContact(query: ContactQuery, viewerId: string): Promise<ContactMatch[]> {
    if (query.kind === "TEXT") return [];

    const rows = (await prisma.user.findMany({
      where: {
        ...(query.kind === "EMAIL" ? { email: query.email } : { phone: query.phone }),
        status: "ACTIVE",
        id: { not: viewerId },
      },
      select: { id: true, name: true, email: true, phone: true, privacy: true, avatarAssetId: true },
      take: MAX_CONTACT_MATCHES,
      orderBy: { createdAt: "asc" },
    })) as CandidateRow[];

    const flag = query.kind === "EMAIL" ? "findableByEmail" : "findableByPhone";
    return rows
      .filter((row) => findable(row.privacy, flag))
      .map((row) => ({
        userId: row.id,
        name: row.name,
        avatarUrl: avatarUrlOf(row.avatarAssetId),
        matchedBy: query.kind,
        hint: this.hintFor(row, query.kind),
      }));
  }

  async findActiveUser(userId: string): Promise<{ id: string; name: string } | null> {
    const user = await prisma.user.findFirst({ where: { id: userId, status: "ACTIVE" }, select: { id: true, name: true } });
    return user ?? null;
  }

  /** Che liên hệ CÒN LẠI — chỉ khi chủ tài khoản cũng cho tìm bằng kênh đó (không lộ gián tiếp qua gợi ý). */
  private hintFor(row: CandidateRow, matchedBy: ContactMatch["matchedBy"]): string | null {
    if (matchedBy === "PHONE") return findable(row.privacy, "findableByEmail") ? maskEmail(row.email) : null;
    return row.phone && findable(row.privacy, "findableByPhone") ? maskPhone(row.phone) : null;
  }
}
