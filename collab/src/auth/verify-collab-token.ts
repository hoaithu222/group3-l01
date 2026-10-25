import jwt from "jsonwebtoken";
import { z } from "zod";
import { isObjectId, isResourceKind, type ResourceKind } from "../resource-kinds";

/** Nguồn phát hành token (BE) và đối tượng nhận (collab) — CHỐT trong README §Giao thức. */
export const COLLAB_TOKEN_ISSUER = "superapp-be";
export const COLLAB_TOKEN_AUDIENCE = "collab";

export interface CollabTokenClaims {
  userId: string;
  kind: ResourceKind;
  /** Id tài nguyên (tài liệu hoặc bảng trắng, tuỳ `kind`). */
  docId: string;
  /** Chế độ token cho phép — quyền thật còn được BE xác nhận lại lúc kết nối (lấy mức thấp hơn). */
  mode: "edit" | "view";
  /** `User.sessionVersion` lúc cấp — BE so lại khi kiểm quyền để token của phiên đã bị thu hồi hàng loạt hết hiệu lực. */
  sv: number;
  jti: string;
  exp: number;
}

const claimsSchema = z.object({
  sub: z.string().refine(isObjectId, "sub không phải ObjectId"),
  // Token cũ (chỉ tài liệu) chưa có `kind` → mặc định `document`.
  kind: z.string().default("document").refine(isResourceKind, "kind không hợp lệ"),
  docId: z.string().refine(isObjectId, "docId không phải ObjectId"),
  mode: z.enum(["edit", "view"]),
  sv: z.number().int().min(0),
  jti: z.string().min(1).max(100),
  exp: z.number().int(),
});

export type TokenFailure = "malformed" | "expired" | "signature" | "claims";

export class CollabTokenError extends Error {
  constructor(
    public readonly failure: TokenFailure,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Kiểm collab token (JWT HS256 ký bằng `COLLAB_SHARED_SECRET`): chữ ký + `iss`/`aud`/`exp` + hình dạng claim.
 * Chỉ nhận HS256 (không cho `none`/RS*). Không kiểm quyền — việc đó do BE (`/internal/.../access`).
 */
export function verifyCollabToken(token: string, secret: string, opts: { clockToleranceSeconds?: number } = {}): CollabTokenClaims {
  let payload: string | jwt.JwtPayload;
  try {
    payload = jwt.verify(token, secret, {
      algorithms: ["HS256"],
      issuer: COLLAB_TOKEN_ISSUER,
      audience: COLLAB_TOKEN_AUDIENCE,
      clockTolerance: opts.clockToleranceSeconds ?? 5,
    });
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) throw new CollabTokenError("expired", "token hết hạn");
    if (err instanceof jwt.JsonWebTokenError) {
      // `invalid signature`, `invalid audience`, `invalid issuer`, `jwt malformed`, `invalid algorithm`…
      const failure: TokenFailure = /malformed|must be provided/.test(err.message) ? "malformed" : "signature";
      throw new CollabTokenError(failure, err.message);
    }
    throw new CollabTokenError("malformed", "token không đọc được");
  }
  if (typeof payload === "string") throw new CollabTokenError("claims", "payload không phải object");

  const parsed = claimsSchema.safeParse(payload);
  if (!parsed.success) throw new CollabTokenError("claims", parsed.error.issues.map((i) => i.message).join("; "));
  const c = parsed.data;
  return { userId: c.sub, kind: c.kind as ResourceKind, docId: c.docId.toLowerCase(), mode: c.mode, sv: c.sv, jti: c.jti, exp: c.exp };
}
