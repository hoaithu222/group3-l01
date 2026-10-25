import { prisma } from "../../infrastructure/database";
import { isCoveredByAnyRole } from "../constants/role-coverage";

/**
 * Phạm vi chung của KHÁCH (p3-04 README §2, D-16): khách chỉ nhắn 1-1 / được nhắn với người CÙNG ÍT NHẤT MỘT kênh chỉ
 * định hoặc MỘT nhóm chat với họ — khách không thể dò cả workspace qua tin nhắn riêng.
 *
 * Đặt ở `core/permission` (cùng chỗ `sharesActiveWorkspace`) vì là helper cross-cutting của điều kiện nhắn 1-1, không phải
 * logic riêng của `modules/conversations`. Đọc thẳng model dùng chung qua Prisma, không import module.
 */
interface WsRow {
  workspaceId: string;
  userId: string;
  role: string;
  expiresAt: Date | null;
}

function isLive(row: WsRow, now: number): boolean {
  return !(row.role === "GUEST" && row.expiresAt && row.expiresAt.getTime() <= now);
}

/** `guest` đọc được kênh nào mà `other` cũng đọc được (kênh chỉ định của khách ∩ kênh `other` đọc được). */
async function shareDesignatedChannel(workspaceId: string, guestId: string, other: WsRow): Promise<boolean> {
  const grants = await prisma.channelGrant.findMany({
    where: { workspaceId, userId: guestId, source: "DIRECT" },
    select: { channelId: true },
  });
  if (grants.length === 0) return false;
  const channels = await prisma.channel.findMany({
    where: { id: { in: grants.map((g) => g.channelId) }, workspaceId, status: "ACTIVE" },
    select: { id: true, visibility: true },
  });
  if (channels.length === 0) return false;
  const ids = channels.map((c) => c.id);

  if (other.role !== "GUEST") {
    // Thành viên đọc được mọi kênh PUBLIC còn hoạt động của nhóm.
    if (channels.some((c) => c.visibility === "PUBLIC")) return true;
    const roleGrants = await prisma.channelGrant.findMany({
      where: { channelId: { in: ids }, source: "ROLE" },
      select: { roleRef: true },
    });
    if (isCoveredByAnyRole(other.role, roleGrants.flatMap((g) => (g.roleRef ? [g.roleRef] : [])))) return true;
  }
  // Grant DIRECT hoặc đã tham gia (membership kênh) — cả hai phía đều là khách hoặc kênh riêng tư cấp trực tiếp.
  const [grant, membership] = await Promise.all([
    prisma.channelGrant.findFirst({ where: { channelId: { in: ids }, userId: other.userId, source: "DIRECT" }, select: { id: true } }),
    prisma.channelMembership.findFirst({ where: { channelId: { in: ids }, userId: other.userId }, select: { id: true } }),
  ]);
  return grant !== null || membership !== null;
}

/** Hai người cùng là thành viên ACTIVE của một nhóm chat (GROUP) thuộc workspace này. */
async function shareGroupConversation(workspaceId: string, a: string, b: string): Promise<boolean> {
  const mine = await prisma.conversationMember.findMany({
    where: { userId: a, workspaceId, kind: "GROUP", status: "ACTIVE" },
    select: { conversationId: true },
  });
  if (mine.length === 0) return false;
  const both = await prisma.conversationMember.findFirst({
    where: { userId: b, status: "ACTIVE", conversationId: { in: mine.map((m) => m.conversationId) } },
    select: { id: true },
  });
  return both !== null;
}

/**
 * Điều kiện nhắn 1-1 xét theo KHÁCH — gọi SAU KHI `sharesActiveWorkspace(a, b)` đã đúng. `true` khi tồn tại một workspace mà cả
 * hai cùng ACTIVE và: không ai là khách, HOẶC (có khách và) cùng kênh chỉ định, HOẶC cùng nhóm chat. Không ai là khách ở bất kỳ
 * workspace nào → `true` ngay (một truy vấn đếm có chỉ mục).
 */
export async function guestDirectAllowed(a: string, b: string): Promise<boolean> {
  const guests = await prisma.workspaceMembership.count({ where: { userId: { in: [a, b] }, role: "GUEST", status: "ACTIVE" } });
  if (guests === 0) return true;

  const now = Date.now();
  const rows = (
    await prisma.workspaceMembership.findMany({
      where: { userId: { in: [a, b] }, status: "ACTIVE" },
      select: { workspaceId: true, userId: true, role: true, expiresAt: true },
    })
  ).filter((r) => isLive(r, now));

  const byWorkspace = new Map<string, { a?: WsRow; b?: WsRow }>();
  for (const row of rows) {
    const entry = byWorkspace.get(row.workspaceId) ?? {};
    if (row.userId === a) entry.a = row;
    else entry.b = row;
    byWorkspace.set(row.workspaceId, entry);
  }

  for (const [workspaceId, { a: rowA, b: rowB }] of byWorkspace) {
    if (!rowA || !rowB) continue;
    if (rowA.role !== "GUEST" && rowB.role !== "GUEST") return true;
    for (const [guest, other] of [[rowA, rowB], [rowB, rowA]] as const) {
      if (guest.role !== "GUEST") continue;
      if (await shareDesignatedChannel(workspaceId, guest.userId, other)) return true;
    }
    if (await shareGroupConversation(workspaceId, a, b)) return true;
  }
  return false;
}
