import type { Prisma } from "@prisma/client";

/**
 * `select` của `Call` cho admin — CỐ Ý thiếu `initiatorId`, `hostId`, `endedBy`, `livekitRoom`, `clientCallId`, `activeKey`: cuộc gọi 1-1 là dữ liệu riêng tư,
 * admin chỉ đo chất lượng/vận hành (p2-07 README §2). `scopeId` được giữ ở BẢN GHI ĐỌC để tra ngữ cảnh, nhưng `AdminMediaRedactor` không bao giờ đưa ra ngoài.
 */
export const CALL_SELECT = {
  id: true, scopeType: true, scopeId: true, workspaceId: true, mode: true, mediaKind: true, status: true, endReason: true,
  startedAt: true, endedAt: true, durationSec: true, peakParticipants: true, invitedCount: true, version: true,
} satisfies Prisma.CallSelect;

export function byIdMap<T extends { id: string }, V>(rows: T[], pick: (r: T) => V): Map<string, V> {
  return new Map(rows.map((r) => [r.id, pick(r)]));
}
