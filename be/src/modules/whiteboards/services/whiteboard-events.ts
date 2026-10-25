import type { WhiteboardEntity } from "../entities/whiteboard.interface";
import type { IOutboxPort, TxHandle } from "../repositories/tx";

/** Tên job của module (queue kèm theo), cả hai ở `notifications`. Cron chụp AUTO dùng chung `collab.snapshot-hourly` (`shared/collab/collab-snapshot-runners.ts`). */
export const WHITEBOARD_JOBS = {
  events: { queue: "notifications", name: "whiteboard.events" },
  accessRevoked: { queue: "notifications", name: "whiteboard.access-revoked" },
} as const;

export interface WhiteboardEventPayload {
  whiteboardId: string;
  version: number;
}

export type KickReason = "revoked" | "archived" | "forbidden";

/** Yêu cầu đóng kết nối collab: theo bảng (mọi người / một số người). Mất quyền ở cấp nhóm do `documents.collab-kick` đóng theo `workspaceId` (mọi loại) — xem `whiteboard-revoke.service.ts`. */
export interface AccessRevokedPayload {
  whiteboardId: string;
  userIds?: string[];
  reason: KickReason;
}

/**
 * Ghi sự kiện `whiteboard:updated` (socket) — consumer tính khán giả theo trạng thái HIỆN TẠI nên không lộ bảng PRIVATE cho ai khác.
 * `discriminator` (tuỳ chọn) làm khoá dedupe duy nhất khi sự kiện KHÔNG đổi `version` metadata (đổi người cộng tác) — trùng khoá làm vỡ transaction (unique index).
 */
export function writeWhiteboardUpdated(outbox: IOutboxPort, tx: TxHandle, board: Pick<WhiteboardEntity, "id" | "version">, discriminator?: string): Promise<void> {
  return outbox.add(tx, {
    type: "whiteboard.updated",
    aggregateType: "Whiteboard",
    aggregateId: board.id,
    queue: WHITEBOARD_JOBS.events.queue,
    jobName: WHITEBOARD_JOBS.events.name,
    dedupeKey: `whiteboard.updated:${board.id}:v${board.version}${discriminator ? `:${discriminator}` : ""}`,
    payload: { whiteboardId: board.id, version: board.version } satisfies WhiteboardEventPayload,
  });
}

/** `discriminator` làm dedupeKey duy nhất theo sự kiện (vd `archived:v5`). */
export function writeAccessRevoked(outbox: IOutboxPort, tx: TxHandle, payload: AccessRevokedPayload, discriminator: string): Promise<void> {
  return outbox.add(tx, {
    type: "whiteboard.access-revoked",
    aggregateType: "Whiteboard",
    aggregateId: payload.whiteboardId,
    queue: WHITEBOARD_JOBS.accessRevoked.queue,
    jobName: WHITEBOARD_JOBS.accessRevoked.name,
    dedupeKey: `whiteboard.access-revoked:${payload.whiteboardId}:${discriminator}`,
    payload: { ...payload },
  });
}
