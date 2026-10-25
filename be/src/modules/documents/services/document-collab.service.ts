import { permissionService } from "../../../core/permission";
import { AppError, ScopeNotFoundError } from "../../../core/exceptions";
import { LIMITS } from "../../../core/constants/limits";
import { ErrorCode } from "../../../core/utils/error.codes";
import type { AuthUser } from "../../../core/types/express";
import { CollabTokenService, collabColorFor, mergeYjsStates } from "../../../shared/collab";
import type { IDocumentDirectory } from "../repositories/document-directory.interface";
import type { IDocumentRepository } from "../repositories/document.repository.interface";
import type { IOutboxPort, ITxRunner } from "../repositories/tx";
import { documentErrors } from "../documents.errors";
import { writePlaintextJob } from "./document-events";
import { getDocumentLimits } from "./document-limits";

const OBJECT_ID_RE = /^[0-9a-f]{24}$/i;
const MAX_WRITE_ATTEMPTS = 3;

export interface CollabTokenView {
  token: string;
  url: string;
  documentName: string;
  mode: "edit" | "view";
  expiresAt: Date;
  user: { id: string; name: string; color: string };
  limits: { stateMaxBytes: number };
}

export type InternalAccess =
  | { allowed: true; mode: "edit" | "view"; user: { id: string; name: string; color: string }; workspaceId: string; limits: { maxConnections: number } }
  | { allowed: false; reason: "FORBIDDEN" | "SESSION_REVOKED" };

export interface DocumentCollabDeps {
  documents: IDocumentRepository;
  directory: IDocumentDirectory;
  tx: ITxRunner;
  outbox: IOutboxPort;
  tokens?: CollabTokenService;
  now?: () => Date;
}

/**
 * Cầu nối BE ↔ `collab/` (be.md §5): cấp collab token cho client, trả lời "user này được vào tài liệu này ở chế độ nào" và tải/lưu state Yjs
 * cho service collab. BE là nguồn duy nhất của `yjsState`: PUT với base version cũ hơn hiện có được HỢP NHẤT (CRDT), không ghi đè.
 */
export class DocumentCollabService {
  private readonly tokens: CollabTokenService;

  constructor(private readonly d: DocumentCollabDeps) {
    this.tokens = d.tokens ?? new CollabTokenService();
  }

  /** `POST /documents/:id/collab-token` — chế độ `edit` chỉ khi có `document.edit` (tài liệu ARCHIVED luôn `view`). */
  async issueToken(actor: AuthUser, documentId: string): Promise<CollabTokenView> {
    const access = await permissionService.assert(actor, "document.read", { type: "DOCUMENT", id: documentId });
    const user = await this.d.directory.user(actor.id);
    if (!user) throw new ScopeNotFoundError();
    const mode = access.actions.has("document.edit") ? "edit" : "view";
    const issued = this.tokens.issue({ userId: actor.id, sessionVersion: user.sessionVersion, kind: "document", resourceId: documentId, mode });
    return {
      token: issued.token,
      url: issued.url,
      documentName: issued.documentName,
      mode,
      expiresAt: issued.expiresAt,
      user: { id: user.id, name: user.name, color: collabColorFor(user.id) },
      limits: { stateMaxBytes: LIMITS.document.stateMaxBytes },
    };
  }

  /** `GET /internal/documents/:id/access` — 404 khi tài liệu không tồn tại; còn lại luôn 200 với `allowed`. */
  async access(documentId: string, userId: string, sessionVersion: number): Promise<InternalAccess> {
    const doc = await this.d.documents.findById(documentId);
    if (!doc) throw new ScopeNotFoundError();
    const user = await this.d.directory.user(userId);
    // Phiên bị thu hồi hàng loạt (đổi mật khẩu, khoá, đăng xuất mọi nơi) → sessionVersion đã tăng: token cũ hết hiệu lực dù chưa hết 5 phút.
    if (!user || user.status !== "ACTIVE" || user.sessionVersion !== sessionVersion) return { allowed: false, reason: "SESSION_REVOKED" };

    const resolved = await permissionService.resolve({ id: userId, email: "" }, { type: "DOCUMENT", id: documentId });
    if (!resolved.visible || !resolved.actions.has("document.read")) return { allowed: false, reason: "FORBIDDEN" };
    const limits = await getDocumentLimits();
    return {
      allowed: true,
      mode: resolved.actions.has("document.edit") ? "edit" : "view",
      user: { id: user.id, name: user.name, color: collabColorFor(user.id) },
      workspaceId: doc.workspaceId,
      limits: { maxConnections: limits.concurrentEditorsMax },
    };
  }

  /** `GET /internal/documents/:id/state` — state rỗng khi chưa ai gõ. */
  async getState(documentId: string): Promise<{ state: Uint8Array; yjsVersion: number }> {
    const doc = await this.d.documents.findWithState(documentId);
    if (!doc) throw new ScopeNotFoundError();
    return { state: doc.yjsState ?? new Uint8Array(), yjsVersion: doc.yjsVersion };
  }

  /**
   * `PUT /internal/documents/:id/state` (be.md §5): kiểm ACTIVE + kích thước → ghi `yjsState`, `yjsVersion = max(hiện tại, base) + 1`, người sửa cuối →
   * outbox `document.plaintext`. `baseVersion` < version hiện tại (ai đó ghi xen: khôi phục snapshot, instance khác) → HỢP NHẤT Yjs thay vì ghi đè.
   * Ghi bằng CAS theo `yjsVersion`; đua → đọc lại và làm lại (tối đa 3 lần).
   */
  async putState(documentId: string, bytes: Uint8Array, baseVersion: number, editorId?: string): Promise<{ yjsVersion: number; merged: boolean }> {
    const limits = LIMITS.document.stateMaxBytes;
    if (bytes.byteLength > limits) throw documentErrors.tooLarge(limits);
    const editor = editorId && OBJECT_ID_RE.test(editorId) ? editorId : undefined;

    for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt += 1) {
      const doc = await this.d.documents.findWithState(documentId);
      if (!doc) throw new ScopeNotFoundError();
      if (doc.status === "ARCHIVED") throw documentErrors.cannotStoreArchived();

      const stale = baseVersion < doc.yjsVersion && doc.yjsState !== null && doc.yjsState.byteLength > 0;
      const next = stale ? mergeYjsStates(doc.yjsState, bytes) : bytes;
      if (next.byteLength > limits) throw documentErrors.tooLarge(limits);
      const yjsVersion = Math.max(doc.yjsVersion, baseVersion) + 1;

      const saved = await this.d.tx.run(async (tx) => {
        const written = await this.d.documents.writeState(
          documentId,
          doc.yjsVersion,
          { yjsState: next, yjsVersion, stateBytes: next.byteLength, lastEditedAt: this.d.now?.() ?? new Date(), ...(editor ? { lastEditedBy: editor } : {}) },
          tx
        );
        if (!written) return false;
        await writePlaintextJob(this.d.outbox, tx, documentId, yjsVersion);
        return true;
      });
      if (saved) return { yjsVersion, merged: stale };
    }
    throw new AppError("Tài liệu đang được ghi liên tục, thử lại", 409, ErrorCode.RES_003);
  }
}
