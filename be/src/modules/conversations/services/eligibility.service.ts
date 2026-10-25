import { prisma } from "../../../infrastructure/database";
import { sharesActiveWorkspace, guestDirectAllowed } from "../../../core/permission";

export type DirectEligibilityReason = "SELF" | "BLOCKED" | "NO_SHARED_WORKSPACE";

export interface DirectEligibility {
  canMessage: boolean;
  reason: DirectEligibilityReason | null;
}

/**
 * be.md §5.1 — dùng bởi `direct-conversation.service.ts` (endpoint DIRECT),
 * `permission/conversation.scope-resolver.ts` (action `conversation.message.send`
 * của DIRECT) và `conversation-list.service.ts` (readOnly/readOnlyReason).
 * MỘT nguồn sự thật duy nhất cho quy tắc "chung workspace ACTIVE + không bị
 * chặn hai chiều" — tránh 3 nơi tự suy luận lệch nhau.
 */
export async function checkDirectEligibility(meId: string, otherId: string): Promise<DirectEligibility> {
  if (meId === otherId) return { canMessage: false, reason: "SELF" };

  const [blocked, shared] = await Promise.all([
    isBlockedEitherWay(meId, otherId),
    sharesActiveWorkspace(meId, otherId),
  ]);
  if (blocked) return { canMessage: false, reason: "BLOCKED" };
  if (!shared) return { canMessage: false, reason: "NO_SHARED_WORKSPACE" };
  // p3-04: khách chỉ nhắn/được nhắn với người cùng kênh chỉ định hoặc nhóm chat. Trả cùng `reason` với "chưa chung nhóm"
  // (client không phân biệt được — không lộ "đối phương là khách"); `direct-conversation.service` phân biệt mã lỗi (CONV_014).
  if (!(await guestDirectAllowed(meId, otherId))) return { canMessage: false, reason: "NO_SHARED_WORKSPACE" };
  return { canMessage: true, reason: null };
}

/**
 * item 1 báo cáo tác vụ p1-05 — `UserBlock` thuộc p1-08 nhưng model đã tạo
 * SỚM ở schema chung (mirror be.md p1-08 §2). Đọc trực tiếp qua Prisma (giống
 * `prisma.workspace`/`prisma.channel` ở module khác đã được xác nhận) thay
 * vì `shared/ports/block.port.ts` (`BlockPort` + cache Redis `block:{userId}`)
 * — port đó là sở hữu của `modules/blocks` (p1-08, CHƯA build), KHÔNG dựng ở
 * đây để tránh xung đột khi p1-08 build port thật. Export riêng để
 * `conversation-member.service.ts#add()` dùng cho quy tắc "chặn actor↔target
 * → skipped BLOCKED" (be.md §5.4) mà không lặp lại query.
 */
export async function isBlockedEitherWay(a: string, b: string): Promise<boolean> {
  const block = await prisma.userBlock.findFirst({
    where: { OR: [{ blockerId: a, blockedId: b }, { blockerId: b, blockedId: a }] },
    select: { id: true },
  });
  return block !== null;
}
