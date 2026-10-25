import { permissionService } from "../../../core/permission";
import { AppError, ScopeNotFoundError } from "../../../core/exceptions";
import { ErrorCode } from "../../../core/utils/error.codes";
import { logger } from "../../../infrastructure/logger";
import type { AuthUser } from "../../../core/types/express";
import { CollabTokenService, collabColorFor, mergeYjsStates } from "../../../shared/collab";
import type { IWhiteboardDirectory } from "../repositories/whiteboard-directory.interface";
import type { IWhiteboardRepository } from "../repositories/whiteboard.repository.interface";
import type { ITxRunner } from "../repositories/tx";
import { whiteboardErrors } from "../whiteboards.errors";
import { getWhiteboardLimits } from "./whiteboard-limits";
import { WhiteboardStateInspector } from "./whiteboard-state-inspector.service";

const OBJECT_ID_RE = /^[0-9a-f]{24}$/i;
const MAX_WRITE_ATTEMPTS = 3;

export interface CollabTokenView {
  token: string;
  url: string;
  documentName: string;
  mode: "edit" | "view";
  expiresAt: Date;
  user: { id: string; name: string; color: string };
  limits: { stateMaxBytes: number; elementsMax: number };
}

export type InternalAccess =
  | { allowed: true; mode: "edit" | "view"; user: { id: string; name: string; color: string }; workspaceId: string; limits: { maxConnections: number } }
  | { allowed: false; reason: "FORBIDDEN" | "SESSION_REVOKED" };

export interface WhiteboardCollabDeps {
  whiteboards: IWhiteboardRepository;
  directory: IWhiteboardDirectory;
  tx: ITxRunner;
  tokens?: CollabTokenService;
  inspector?: WhiteboardStateInspector;
  now?: () => Date;
}

/**
 * Cầu nối BE ↔ `collab/` (be.md §4–§5): cấp collab token (`kind: "whiteboard"`, documentName `wb:<id>`), trả lời "user này được vào bảng này ở chế độ nào" và tải/lưu state Yjs cho
 * service collab. BE là nguồn duy nhất của `yjsState`: PUT với base version cũ hơn hiện có được HỢP NHẤT (CRDT), không ghi đè; state có quá số phần tử/dung lượng → `WB_007`.
 */
export class WhiteboardCollabService {
  private readonly tokens: CollabTokenService;
  private readonly inspector: WhiteboardStateInspector;

  constructor(private readonly d: WhiteboardCollabDeps) {
    this.tokens = d.tokens ?? new CollabTokenService();
    this.inspector = d.inspector ?? new WhiteboardStateInspector();
  }

  /** `POST /whiteboards/:id/collab-token` — chế độ `edit` chỉ khi có `whiteboard.edit` (bảng ARCHIVED luôn `view`). */
  async issueToken(actor: AuthUser, whiteboardId: string): Promise<CollabTokenView> {
    const access = await permissionService.assert(actor, "whiteboard.read", { type: "WHITEBOARD", id: whiteboardId });
    const user = await this.d.directory.user(actor.id);
    if (!user) throw new ScopeNotFoundError();
    const mode = access.actions.has("whiteboard.edit") ? "edit" : "view";
    const issued = this.tokens.issue({ userId: actor.id, sessionVersion: user.sessionVersion, kind: "whiteboard", resourceId: whiteboardId, mode });
    const limits = await getWhiteboardLimits();
    return {
      token: issued.token,
      url: issued.url,
      documentName: issued.documentName,
      mode,
      expiresAt: issued.expiresAt,
      user: { id: user.id, name: user.name, color: collabColorFor(user.id) },
      limits: { stateMaxBytes: limits.stateMaxBytes, elementsMax: limits.elementsMax },
    };
  }

  /** `GET /internal/whiteboards/:id/access` — 404 khi bảng không tồn tại; còn lại luôn 200 với `allowed`. */
  async access(whiteboardId: string, userId: string, sessionVersion: number): Promise<InternalAccess> {
    const board = await this.d.whiteboards.findById(whiteboardId);
    if (!board) throw new ScopeNotFoundError();
    const user = await this.d.directory.user(userId);
    // Phiên bị thu hồi hàng loạt (đổi mật khẩu, khoá, đăng xuất mọi nơi) → sessionVersion đã tăng: token cũ hết hiệu lực dù chưa hết 5 phút.
    if (!user || user.status !== "ACTIVE" || user.sessionVersion !== sessionVersion) return { allowed: false, reason: "SESSION_REVOKED" };

    const resolved = await permissionService.resolve({ id: userId, email: "" }, { type: "WHITEBOARD", id: whiteboardId });
    if (!resolved.visible || !resolved.actions.has("whiteboard.read")) return { allowed: false, reason: "FORBIDDEN" };
    const limits = await getWhiteboardLimits();
    return {
      allowed: true,
      mode: resolved.actions.has("whiteboard.edit") ? "edit" : "view",
      user: { id: user.id, name: user.name, color: collabColorFor(user.id) },
      workspaceId: board.workspaceId,
      limits: { maxConnections: limits.concurrentEditorsMax },
    };
  }

  /** `GET /internal/whiteboards/:id/state` — state rỗng khi chưa ai vẽ. */
  async getState(whiteboardId: string): Promise<{ state: Uint8Array; yjsVersion: number }> {
    const board = await this.d.whiteboards.findWithState(whiteboardId);
    if (!board) throw new ScopeNotFoundError();
    return { state: board.yjsState ?? new Uint8Array(), yjsVersion: board.yjsVersion };
  }

  /**
   * `PUT /internal/whiteboards/:id/state` (be.md §5): kiểm ACTIVE + kích thước → (nếu base cũ) hợp nhất → BE TỰ ĐẾM phần tử từ Yjs, quá `elementsMax` → `WB_007` → ghi `yjsState`,
   * `elementCount`, `yjsVersion = max(hiện tại, base) + 1`, người sửa cuối. Ghi bằng CAS theo `yjsVersion`; đua → đọc lại và làm lại (tối đa 3 lần).
   * Không ghi outbox `whiteboard.saved` (kế hoạch nêu nhưng P0 chưa có consumer nào — job không có processor sẽ lỗi; sự kiện `whiteboard:updated` chỉ phát khi metadata đổi).
   */
  async putState(whiteboardId: string, bytes: Uint8Array, baseVersion: number, editorId?: string): Promise<{ yjsVersion: number; merged: boolean; elementCount: number }> {
    const limits = await getWhiteboardLimits();
    const tooLarge = (elementCount?: number) => whiteboardErrors.tooLarge({ maxBytes: limits.stateMaxBytes, maxElements: limits.elementsMax, ...(elementCount === undefined ? {} : { elementCount }) });
    if (bytes.byteLength > limits.stateMaxBytes) throw tooLarge();
    const editor = editorId && OBJECT_ID_RE.test(editorId) ? editorId : undefined;

    for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt += 1) {
      const board = await this.d.whiteboards.findWithState(whiteboardId);
      if (!board) throw new ScopeNotFoundError();
      if (board.status === "ARCHIVED") throw whiteboardErrors.cannotStoreArchived();

      const stale = baseVersion < board.yjsVersion && board.yjsState !== null && board.yjsState.byteLength > 0;
      const next = stale ? mergeYjsStates(board.yjsState, bytes) : bytes;
      if (next.byteLength > limits.stateMaxBytes) throw tooLarge();
      const inspection = this.inspector.inspect(next);
      if (inspection.elementCount > limits.elementsMax) throw tooLarge(inspection.elementCount);
      if (inspection.invalidElements > 0) logger.warn("[whiteboards] state có phần tử sai schema (vẫn lưu)", { whiteboardId, invalidElements: inspection.invalidElements });
      const yjsVersion = Math.max(board.yjsVersion, baseVersion) + 1;

      const saved = await this.d.tx.run(async (tx) => {
        const written = await this.d.whiteboards.writeState(
          whiteboardId,
          board.yjsVersion,
          { yjsState: next, yjsVersion, elementCount: inspection.elementCount, lastEditedAt: this.d.now?.() ?? new Date(), ...(editor ? { lastEditedBy: editor } : {}) },
          tx
        );
        return written !== null;
      });
      if (saved) return { yjsVersion, merged: stale, elementCount: inspection.elementCount };
    }
    throw new AppError("Bảng trắng đang được ghi liên tục, thử lại", 409, ErrorCode.RES_003);
  }
}
