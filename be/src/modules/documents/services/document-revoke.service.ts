import { randomUUID } from "node:crypto";
import { registerRevokeListener } from "../../../core/permission";
import { enqueue, toSafeJobId } from "../../../infrastructure/queue";
import { logger } from "../../../infrastructure/logger";
import { getCollabClient, type ICollabClient } from "../../../shared/collab";
import { DOCUMENT_JOBS, type AccessRevokedPayload } from "./document-events";

const ENQUEUE_TIMEOUT_MS = 1000;

/**
 * Job `document.access-revoked` (queue `notifications`, be.md §7): đóng kết nối collab của người vừa mất quyền — theo tài liệu (`documentId` [+ `userIds`]) hoặc theo nhóm
 * (`workspaceId` + `userIds`: mọi tài liệu của nhóm). Kick lặp vô hại (idempotent). Collab chưa cấu hình → bỏ qua; collab lỗi → ném để BullMQ thử lại
 * (tối đa 3 lần; ngoài ra vòng kiểm lại quyền của collab vẫn đóng kết nối trong ≤ 30 s).
 */
export class DocumentAccessRevokedService {
  constructor(private readonly collab: ICollabClient = getCollabClient()) {}

  async process(payload: AccessRevokedPayload): Promise<{ kicked: number }> {
    if (!this.collab.enabled()) return { kicked: 0 };
    const targets: Array<Parameters<ICollabClient["kick"]>[0]> = [];
    if (payload.documentId) {
      if (payload.userIds && payload.userIds.length > 0) for (const userId of payload.userIds) targets.push({ docId: payload.documentId, userId, reason: payload.reason });
      else targets.push({ docId: payload.documentId, reason: payload.reason });
    } else if (payload.workspaceId && payload.userIds) {
      for (const userId of payload.userIds) targets.push({ workspaceId: payload.workspaceId, userId, reason: payload.reason });
    }
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
 * Gắn `documents` vào MỌI đường thu hồi quyền (`revokeScope`): thu hồi ở scope DOCUMENT (gỡ cộng tác viên, đổi sang PRIVATE) hoặc WORKSPACE (rời/bị xoá/cấm/đổi vai
 * khỏi nhóm) → xếp job bền thay vì xử lý trong request. Đăng ký ở CẢ API lẫn worker (idempotent theo tên) — `revokeScope` chạy ở cả hai.
 */
export function registerDocumentRevokeListener(): void {
  registerRevokeListener("documents.collab-kick", async (input) => {
    if (input.userIds.length === 0) return;
    const scope = input.scope;
    if (scope.type !== "DOCUMENT" && scope.type !== "WORKSPACE") return;
    if (!getCollabClient().enabled()) return;
    const payload: AccessRevokedPayload =
      scope.type === "DOCUMENT" ? { documentId: scope.id, userIds: input.userIds, reason: "revoked" } : { workspaceId: scope.id, userIds: input.userIds, reason: "revoked" };
    try {
      await Promise.race([
        enqueue(DOCUMENT_JOBS.accessRevoked.queue, DOCUMENT_JOBS.accessRevoked.name, payload, {
          jobId: toSafeJobId(`document.access-revoked:${scope.type}:${scope.id}:${randomUUID()}`),
        }),
        new Promise<never>((_r, reject) => setTimeout(() => reject(new Error("enqueue document.access-revoked quá hạn")), ENQUEUE_TIMEOUT_MS).unref()),
      ]);
    } catch (err) {
      logger.warn("[documents] Không xếp được document.access-revoked", { scope, error: err instanceof Error ? err.message : String(err) });
    }
  });
}
