import { createServer, type IncomingMessage, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import type { Duplex } from "node:stream";
import { Hocuspocus } from "@hocuspocus/server";
import express from "express";
import { WebSocketServer, type WebSocket } from "ws";
import { AccessService } from "./access-service";
import { BeClient } from "./be-client";
import type { CollabConfig } from "./config";
import { countByKind } from "./connections";
import { CLOSE_CODE } from "./errors";
import { AccessRechecker } from "./extensions/access-recheck";
import { createAuthExtension } from "./extensions/authentication";
import { createAwarenessRateLimit } from "./extensions/awareness-rate-limit";
import { createMessageGuard } from "./extensions/message-guard";
import { PersistenceExtension } from "./extensions/persistence";
import { createRedis } from "./extensions/redis";
import { createHttpRouter } from "./internal/router";
import { kick } from "./internal/ops";
import { createLogger, errorMeta, type Logger } from "./logger";
import { createMetrics } from "./metrics";
import { WindowCounter } from "./rate-limit";
import type { SocketState } from "./types";

export interface CollabServer {
  hocuspocus: Hocuspocus;
  httpServer: HttpServer;
  persistence: PersistenceExtension;
  access: AccessService;
  be: BeClient;
  rechecker: AccessRechecker;
  start(): Promise<number>;
  stop(): Promise<void>;
  port(): number;
}

export interface CreateServerOptions {
  logger?: Logger;
  /** Test: tắt số đo mặc định của tiến trình (nhiều server trong một process). */
  processMetrics?: boolean;
  /** Test: `fetch` giả cho BE. */
  fetchImpl?: typeof fetch;
  retryBaseMs?: number;
}

/**
 * Dựng dịch vụ: Hocuspocus (WebSocket) + Express nhỏ (`/health`, `/metrics`, `/internal/*`) chung MỘT cổng.
 * WebSocket nâng cấp ở MỌI path (nginx có thể để `/collab` hoặc `/collab/`), trừ `/internal*`, `/health`, `/metrics`.
 */
export function createCollabServer(config: CollabConfig, options: CreateServerOptions = {}): CollabServer {
  const logger = options.logger ?? createLogger(config.logLevel, { service: "collab", instance: config.instanceId });
  const startedAt = Date.now();
  let shuttingDown = false;
  const hp = (): Hocuspocus => hocuspocus;

  const metrics = createMetrics(
    {
      connectionsByKind: () => countByKind(hp()).connections,
      documentsByKind: () => countByKind(hp()).documents,
      pendingCount: () => persistence.pendingCount(),
    },
    options.processMetrics ?? true,
  );
  const be = new BeClient({
    baseUrl: config.beInternalUrl,
    secret: config.sharedSecret,
    timeoutMs: config.beTimeoutMs,
    retries: config.beRetries,
    logger,
    metrics,
    ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
    ...(options.retryBaseMs !== undefined ? { retryBaseMs: options.retryBaseMs } : {}),
  });
  const access = new AccessService(be, config.accessCacheTtlMs);
  const failures = new WindowCounter(60_000);
  const ipConnections = new Map<string, number>();
  const redis = createRedis(config, logger);
  const persistence = new PersistenceExtension({ config, be, logger, metrics, hocuspocus: hp });
  const rechecker = new AccessRechecker(hp, access, logger, metrics, config.accessRecheckMs);

  const hocuspocus = new Hocuspocus({
    name: config.instanceId,
    quiet: true,
    timeout: config.wsPingTimeoutMs,
    debounce: config.storeDebounceMs,
    maxDebounce: config.storeMaxDebounceMs,
    unloadImmediately: true,
    extensions: [
      ...(redis.extension ? [redis.extension] : []),
      createAuthExtension({ config, access, logger, metrics, failures }),
      createMessageGuard(config, metrics),
      createAwarenessRateLimit(config, metrics), // phải đứng SAU cổng kiểm message-guard
      persistence,
    ],
  });

  const opsDeps = { hocuspocus: hp, persistence, access, metrics, bus: redis.bus };
  redis.bus.onMessage((m) => {
    const closed = kick(opsDeps, { ...(m.kind ? { kind: m.kind } : {}), ...(m.docId ? { docId: m.docId } : {}), ...(m.userId ? { userId: m.userId } : {}), ...(m.workspaceId ? { workspaceId: m.workspaceId } : {}), reason: m.reason }, { fromBus: true });
    logger.debug("kick từ bus", { closed });
  });

  const app = express();
  app.disable("x-powered-by");
  app.use(createHttpRouter({ ...opsDeps, config, logger, be, redisStatus: () => redis.bus.status(), isShuttingDown: () => shuttingDown, startedAt }));

  const httpServer = createServer(app);
  const wss = new WebSocketServer({ noServer: true, maxPayload: config.wsMaxPayloadBytes });

  const clientIp = (req: IncomingMessage): string => {
    if (config.trustProxy) {
      // Sau MỘT proxy tin cậy (nginx nối `$remote_addr` vào cuối XFF): phần tử CUỐI mới là IP thật, phần trước có thể do client giả.
      const parts = String(req.headers["x-forwarded-for"] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      const last = parts[parts.length - 1];
      if (last) return last;
    }
    return req.socket.remoteAddress ?? "unknown";
  };

  const refuse = (socket: Duplex, status: number, text: string): void => {
    socket.write(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
    socket.destroy();
  };

  httpServer.on("upgrade", (req, socket, head) => {
    const path = (req.url ?? "/").split("?")[0] ?? "/";
    if (/^\/(internal|health|metrics)(\/|$)/.test(path)) return refuse(socket, 404, "Not Found");
    if (shuttingDown) return refuse(socket, 503, "Service Unavailable");
    const ip = clientIp(req);
    if (failures.count(ip) >= config.maxFailedAuthPerIpPerMinute || (ipConnections.get(ip) ?? 0) >= config.maxConnectionsPerIp) {
      metrics.authTotal.inc({ result: "ip-limited" });
      return refuse(socket, 429, "Too Many Requests");
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req, ip));
  });

  wss.on("connection", (ws: WebSocket, req: IncomingMessage, ip: string) => {
    ws.setMaxListeners(Number.POSITIVE_INFINITY);
    ipConnections.set(ip, (ipConnections.get(ip) ?? 0) + 1);
    const sock: SocketState = { ws, ip, authenticated: false, docCount: 0, releasers: new Set() };
    const authTimer = setTimeout(() => {
      if (!sock.authenticated && ws.readyState === ws.OPEN) ws.close(CLOSE_CODE["auth-timeout"], "auth-timeout");
    }, config.authTimeoutMs);
    ws.on("error", (err) => logger.debug("lỗi socket", errorMeta(err)));
    ws.once("close", () => {
      clearTimeout(authTimer);
      const left = (ipConnections.get(ip) ?? 1) - 1;
      if (left <= 0) ipConnections.delete(ip);
      else ipConnections.set(ip, left);
      for (const release of [...sock.releasers]) release();
    });
    hocuspocus.handleConnection(ws, req, { sock });
  });

  const sweeper = setInterval(() => failures.sweep(), 60_000);
  sweeper.unref();

  return {
    hocuspocus,
    httpServer,
    persistence,
    access,
    be,
    rechecker,
    port: () => (httpServer.address() as AddressInfo | null)?.port ?? config.port,
    async start() {
      await new Promise<void>((resolve, reject) => {
        httpServer.once("error", reject);
        httpServer.listen(config.port, config.host, () => {
          httpServer.off("error", reject);
          resolve();
        });
      });
      rechecker.start();
      const port = (httpServer.address() as AddressInfo).port;
      logger.info("collab đang chạy", { port, kinds: [...config.kinds], redis: config.redisUrl ? "on" : "off" });
      return port;
    },
    async stop() {
      if (shuttingDown) return;
      shuttingDown = true;
      const deadline = Date.now() + config.shutdownGraceMs;
      rechecker.stop();
      clearInterval(sweeper);
      httpServer.close();
      // 1) Lưu ngay mọi document còn state chưa lưu (đang debounce hoặc BE trước đó lỗi).
      const dirty = [...hocuspocus.documents.values()].filter(
        (d) => hocuspocus.debouncer.isDebounced(`onStoreDocument-${d.name}`) || persistence.stateOf(d.name)?.pending,
      );
      await Promise.race([
        Promise.allSettled(
          dirty.map((d) =>
            hocuspocus.storeDocumentHooks(d, { instance: hocuspocus, clientsCount: d.getConnectionsCount(), context: {}, document: d, documentName: d.name, requestHeaders: {}, requestParameters: new URLSearchParams(), socketId: "internal-shutdown" }, true),
          ),
        ),
        sleep(Math.max(0, deadline - Date.now())),
      ]);
      // 2) Đóng kết nối (client tự nối lại instance khác), chờ Hocuspocus dỡ document, rồi dọn.
      hocuspocus.closeConnections();
      while (hocuspocus.getDocumentsCount() > 0 && Date.now() < deadline) await sleep(50);
      for (const client of wss.clients) client.terminate();
      wss.close();
      await hocuspocus.hooks("onDestroy", { instance: hocuspocus });
      await redis.close();
      logger.info("collab đã dừng", { unsavedDocuments: hocuspocus.getDocumentsCount() });
    },
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
