import type { Extension, connectedPayload, onAuthenticatePayload, onDisconnectPayload } from "@hocuspocus/server";
import type { AccessService } from "../access-service";
import { CollabTokenError, verifyCollabToken } from "../auth/verify-collab-token";
import type { CollabConfig } from "../config";
import { AuthDenied, CLOSE_CODE, type DenyReason } from "../errors";
import type { Logger } from "../logger";
import { errorMeta } from "../logger";
import type { CollabMetrics } from "../metrics";
import type { WindowCounter } from "../rate-limit";
import { parseDocumentName } from "../resource-kinds";
import { contextOf, type CollabContext } from "../types";

export interface AuthExtensionDeps {
  config: CollabConfig;
  access: AccessService;
  logger: Logger;
  metrics: CollabMetrics;
  /** Đếm xác thực thất bại theo IP (server.ts dùng cùng bộ đếm để chặn nâng cấp WebSocket). */
  failures: WindowCounter;
}

/**
 * Xác thực kết nối vào 1 document (Hocuspocus `onAuthenticate`):
 *  1. `documentName` đúng dạng và loại được phục vụ;
 *  2. token BE cấp (HS256, `aud=collab`, còn hạn) và KHỚP đúng document đang mở;
 *  3. BE xác nhận quyền (`GET /internal/.../access`, đệm 30 s) → chế độ `edit`/`view` = mức THẤP hơn của token và BE;
 *  4. giới hạn số kết nối/document và/người (chỗ được "giữ" từ lúc xác thực tới lúc kết nối hoàn tất);
 *  5. `view` → `connectionConfig.readOnly = true`: Hocuspocus từ chối mọi update của kết nối này (CW-D3).
 * Từ chối = ném `AuthDenied`; client nhận `authenticationFailed { reason }` rồi socket bị đóng (mã trong `CLOSE_CODE`).
 */
export function createAuthExtension(deps: AuthExtensionDeps): Extension {
  const { config, access, logger, metrics, failures } = deps;
  /** Chỗ đã giữ nhưng kết nối chưa gắn vào document (đang tải document): theo document và theo cặp document|user. */
  const reservedByDoc = new Map<string, number>();
  const reservedByUser = new Map<string, number>();

  const bump = (map: Map<string, number>, key: string, delta: number): void => {
    const next = (map.get(key) ?? 0) + delta;
    if (next <= 0) map.delete(key);
    else map.set(key, next);
  };

  const deny = (data: onAuthenticatePayload, reason: DenyReason, meta: Record<string, unknown> = {}): never => {
    const ctx = contextOf(data.context);
    metrics.authTotal.inc({ result: reason });
    if (reason !== "unavailable" && reason !== "too-many-connections" && ctx.sock) failures.hit(ctx.sock.ip);
    logger.info("từ chối kết nối", { reason, documentName: data.documentName, ip: ctx.sock?.ip, ...meta });
    const sock = ctx.sock;
    // Chỉ đóng socket thô khi nó chưa chở document đã xác thực nào (tránh đá luôn document khác trên cùng socket).
    if (sock && !sock.authenticated && sock.docCount === 0) {
      setImmediate(() => {
        if (sock.ws.readyState === sock.ws.OPEN) sock.ws.close(CLOSE_CODE[reason], reason);
      });
    }
    throw new AuthDenied(reason);
  };

  async function onAuthenticate(data: onAuthenticatePayload): Promise<Partial<CollabContext>> {
    const ctx = contextOf(data.context);
    const parsed = parseDocumentName(data.documentName);
    if (!parsed || !config.kinds.has(parsed.kind)) return deny(data, "not-found");

    let claims;
    try {
      claims = verifyCollabToken(data.token, config.sharedSecret);
    } catch (err) {
      return deny(data, "unauthorized", { failure: err instanceof CollabTokenError ? err.failure : "unknown" });
    }
    if (claims.kind !== parsed.kind || claims.docId !== parsed.id) return deny(data, "unauthorized", { failure: "mismatch" });

    let granted;
    try {
      granted = await access.check(parsed.kind, parsed.id, claims.userId, claims.sv);
    } catch (err) {
      logger.warn("không kiểm được quyền (BE lỗi)", { documentName: data.documentName, ...errorMeta(err) });
      return deny(data, "unavailable");
    }
    if (granted === null) return deny(data, "not-found", { userId: claims.userId });
    if (!granted.allowed) return deny(data, "forbidden", { userId: claims.userId });

    const doc = data.instance.documents.get(data.documentName);
    const userKey = `${data.documentName}|${claims.userId}`;
    const maxDoc = granted.limits?.maxConnections ?? config.maxConnectionsPerDoc;
    const docCount = (doc?.getConnectionsCount() ?? 0) + (reservedByDoc.get(data.documentName) ?? 0);
    const userCount =
      (doc?.getConnections().filter((c) => contextOf(c.context).user?.id === claims.userId).length ?? 0) + (reservedByUser.get(userKey) ?? 0);
    if (docCount >= maxDoc || userCount >= config.maxConnectionsPerUserPerDoc) return deny(data, "too-many-connections", { docCount, userCount });

    const mode: "edit" | "view" = granted.mode === "view" || claims.mode === "view" ? "view" : "edit";
    data.connectionConfig.readOnly = mode === "view";

    bump(reservedByDoc, data.documentName, 1);
    bump(reservedByUser, userKey, 1);
    let released = false;
    const releaseReservation = (): void => {
      if (released) return;
      released = true;
      bump(reservedByDoc, data.documentName, -1);
      bump(reservedByUser, userKey, -1);
      ctx.sock?.releasers.delete(releaseReservation);
    };
    ctx.sock?.releasers.add(releaseReservation);
    if (ctx.sock) ctx.sock.authenticated = true;

    metrics.authTotal.inc({ result: "ok" });
    logger.debug("xác thực kết nối", { documentName: data.documentName, userId: claims.userId, mode });
    return {
      user: granted.user,
      kind: parsed.kind,
      resourceId: parsed.id,
      workspaceId: granted.workspaceId,
      mode,
      sv: claims.sv,
      bucket: { tokens: config.maxMessagesPerSecond, updatedAt: Date.now() },
      releaseReservation,
    };
  }

  return {
    extensionName: "collab-auth",
    onAuthenticate,
    /** Kết nối đã gắn vào document → đã được đếm bằng `getConnectionsCount()`, nhả chỗ giữ. */
    async connected(data: connectedPayload) {
      const ctx = contextOf(data.context);
      ctx.releaseReservation?.();
      if (ctx.sock) ctx.sock.docCount += 1;
    },
    async onDisconnect(data: onDisconnectPayload) {
      const ctx = contextOf(data.context);
      ctx.releaseReservation?.();
      if (ctx.sock && ctx.sock.docCount > 0) ctx.sock.docCount -= 1;
    },
  };
}
