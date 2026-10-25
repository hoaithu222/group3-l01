import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import { env } from "../../core/config";
import { LIMITS } from "../../core/constants/limits";
import { AppError } from "../../core/exceptions";
import { ErrorCode, ErrorMessages } from "../../core/utils/error.codes";

export type CollabKind = "document" | "whiteboard";

/** Hợp đồng token — KHỚP `collab/src/auth/verify-collab-token.ts` (đổi một phía là hỏng kết nối). */
export const COLLAB_TOKEN_ISSUER = "superapp-be";
export const COLLAB_TOKEN_AUDIENCE = "collab";

/** Tiền tố `documentName` ở collab — KHỚP `collab/src/resource-kinds.ts`. */
export const COLLAB_DOCUMENT_PREFIX: Record<CollabKind, string> = { document: "doc", whiteboard: "wb" };

export function collabDocumentName(kind: CollabKind, resourceId: string): string {
  return `${COLLAB_DOCUMENT_PREFIX[kind]}:${resourceId}`;
}

export interface IssueCollabTokenInput {
  userId: string;
  /** `User.sessionVersion` — collab đưa lại cho BE khi kiểm quyền để token của phiên đã bị thu hồi hàng loạt hết hiệu lực. */
  sessionVersion: number;
  kind: CollabKind;
  resourceId: string;
  mode: "edit" | "view";
}

export interface IssuedCollabToken {
  token: string;
  expiresAt: Date;
  /** URL WebSocket công khai (đã đổi http(s) → ws(s)); client tự nối `?doc=<resourceId>`. */
  url: string;
  documentName: string;
}

/** `http(s)://…` → `ws(s)://…` (ví dụ `.env.example` cũ đặt `COLLAB_URL=http://localhost:4000`); giữ nguyên `ws(s)://`. */
export function toWebSocketUrl(url: string): string {
  return url.replace(/^http/i, "ws").replace(/\/+$/, "");
}

/**
 * Cấp collab token: JWT HS256 ký bằng `COLLAB_SHARED_SECRET` (KHÔNG dùng `JWT_SECRET` — service thứ 4 không được giữ bí mật chính),
 * sống `LIMITS.document.collabTokenTtlSeconds` (5 phút). Chỉ chứng minh "BE đã cho người này vào tài nguyên này ở chế độ này";
 * collab còn hỏi lại BE (`/internal/.../access`) nên thu hồi quyền có hiệu lực ≤ 30 s. Chưa cấu hình → 503 `DOC_009` (fail-closed).
 */
export class CollabTokenService {
  constructor(
    private readonly config: { secret: () => string | undefined; publicUrl: () => string | undefined; now: () => Date } = {
      secret: () => env.COLLAB_SHARED_SECRET,
      publicUrl: () => env.COLLAB_URL,
      now: () => new Date(),
    }
  ) {}

  issue(input: IssueCollabTokenInput): IssuedCollabToken {
    const secret = this.config.secret();
    const publicUrl = this.config.publicUrl();
    if (!secret || !publicUrl) throw new AppError(ErrorMessages[ErrorCode.DOC_009], 503, ErrorCode.DOC_009);

    const ttl = LIMITS.document.collabTokenTtlSeconds;
    const issuedAt = Math.floor(this.config.now().getTime() / 1000);
    const token = jwt.sign({ kind: input.kind, docId: input.resourceId, mode: input.mode, sv: input.sessionVersion, iat: issuedAt }, secret, {
      algorithm: "HS256",
      issuer: COLLAB_TOKEN_ISSUER,
      audience: COLLAB_TOKEN_AUDIENCE,
      subject: input.userId,
      expiresIn: ttl,
      jwtid: randomUUID(),
    });
    return {
      token,
      expiresAt: new Date((issuedAt + ttl) * 1000),
      url: toWebSocketUrl(publicUrl),
      documentName: collabDocumentName(input.kind, input.resourceId),
    };
  }
}
