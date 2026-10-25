import { randomUUID } from "node:crypto";
import { registerRevokeListener } from "../../../core/permission";
import { enqueue, toSafeJobId } from "../../../infrastructure/queue";
import { logger } from "../../../infrastructure/logger";
import { getCollabClient, type ICollabClient } from "../../../shared/collab";
import { WHITEBOARD_JOBS, type AccessRevokedPayload } from "./whiteboard-events";

const ENQUEUE_TIMEOUT_MS = 1000;

/**
 * Job `whiteboard.access-revoked` (queue `notifications`): đóng kết nối collab của người vừa mất quyền vào bảng (`POST collab /internal/kick` với `kind: "whiteboard"` — thiếu `kind` collab
 * hiểu là tài liệu). Không có `userIds` = đóng MỌI kết nối của bảng (lưu trữ/khôi phục). Kick lặp vô hại (idempotent). Collab chưa cấu hình → bỏ qua; collab lỗi → ném để BullMQ thử lại
 * (tối đa 3 lần; ngoài ra vòng kiểm lại quyền của collab vẫn đóng kết nối trong ≤ 30 s).
 */
export class WhiteboardAccessRevokedService {
  constructor(private readonly collab: ICollabClient = getCollabClient()) {}

  async process(payload: AccessRevokedPayload): Promise<{ kicked: number }> {
    if (!this.collab.enabled()) return { kicked: 0 };
    const targets: Array<Parameters<ICollabClient["kick"]>[0]> =
      payload.userIds && payload.userIds.length > 0
        ? payload.userIds.map((userId) => ({ kind: "whiteboard" as const, docId: payload.whiteboardId, userId, reason: payload.reason }))
        : [{ kind: "whiteboard" as const, docId: payload.whiteboardId, reason: payload.reason }];
    let kicked = 0;
    let failed: string | null = null;
    for (const target of targets) {
      const res = await this.collab.kick(target);
      if (res.ok) kicked += res.data.closed;
      else failed = res.error;
    }
    if (failed) throw new Error(`Không gọi được collab /internal/kick: ${failed}`);
    return { kicked };
  }
}

/**
 * Gắn `whiteboards` vào đường thu hồi quyền ở scope WHITEBOARD (`revokeScope`: gỡ cộng tác viên, đổi sang PRIVATE) → xếp job bền thay vì xử lý trong request. Đăng ký ở CẢ API lẫn
 * worker (idempotent theo tên). CỐ Ý không nghe scope WORKSPACE: khi người dùng rời/bị xoá/cấm khỏi nhóm, listener `documents.collab-kick` đã xếp lệnh kick THEO `workspaceId` + `userId`
 * và collab đóng MỌI loại kết nối (tài liệu lẫn bảng) của người đó trong nhóm — thêm một lệnh nữa chỉ trùng lặp; nếu lệnh đó lỡ thì vòng kiểm lại quyền của collab (≤ 30 s) vẫn đóng.
 */
export function registerWhiteboardRevokeListener(): void {
  registerRevokeListener("whiteboards.collab-kick", async (input) => {
    if (input.userIds.length === 0) return;
    const scope = input.scope;
    if (scope.type !== "WHITEBOARD") return;
    if (!getCollabClient().enabled()) return;
    const payload: AccessRevokedPayload = { whiteboardId: scope.id, userIds: input.userIds, reason: "revoked" };
    try {
      await Promise.race([
        enqueue(WHITEBOARD_JOBS.accessRevoked.queue, WHITEBOARD_JOBS.accessRevoked.name, payload, {
          jobId: toSafeJobId(`whiteboard.access-revoked:${scope.type}:${scope.id}:${randomUUID()}`),
        }),
        new Promise<never>((_r, reject) => setTimeout(() => reject(new Error("enqueue whiteboard.access-revoked quá hạn")), ENQUEUE_TIMEOUT_MS).unref()),
      ]);
    } catch (err) {
      logger.warn("[whiteboards] Không xếp được whiteboard.access-revoked", { scope, error: err instanceof Error ? err.message : String(err) });
    }
  });
}
