import { createHash, timingSafeEqual } from "node:crypto";
import express, { type NextFunction, type Request, type RequestHandler, type Response, type Router } from "express";
import { z } from "zod";
import type { CollabConfig } from "../config";
import { SECRET_HEADER, type BeClient } from "../be-client";
import type { Logger } from "../logger";
import { errorMeta } from "../logger";
import type { CollabMetrics } from "../metrics";
import { isObjectId, ALL_KINDS } from "../resource-kinds";
import { applyUpdate, flush, kick, stats, type OpsDeps } from "./ops";

export interface HttpDeps extends OpsDeps {
  config: CollabConfig;
  logger: Logger;
  metrics: CollabMetrics;
  be: BeClient;
  redisStatus: () => "ok" | "error" | "off";
  isShuttingDown: () => boolean;
  startedAt: number;
}

const sha256 = (value: string): Buffer => createHash("sha256").update(value).digest();

/** So sánh bí mật ở thời gian hằng (băm về cùng độ dài rồi `timingSafeEqual`). */
export function secretMatches(provided: string | undefined, expected: string): boolean {
  if (!provided) return false;
  return timingSafeEqual(sha256(provided), sha256(expected));
}

const objectId = z.string().refine(isObjectId, "phải là ObjectId 24 ký tự hex");
const kind = z.enum(ALL_KINDS).default("document");

const kickSchema = z
  .object({
    kind: kind.optional(),
    docId: objectId.optional(),
    userId: objectId.optional(),
    workspaceId: objectId.optional(),
    reason: z.enum(["revoked", "archived", "forbidden"]).default("revoked"),
  })
  .refine((v) => v.docId || v.userId || v.workspaceId, "cần ít nhất một trong docId/userId/workspaceId");

const docRefSchema = z.object({ kind, docId: objectId });
const applySchema = docRefSchema.extend({ updateBase64: z.string().min(1), reason: z.string().max(40).optional() });

const MAX_APPLY_BODY = "16mb";

function bad(res: Response, message: string): void {
  res.status(400).json({ success: false, error: { code: "VAL_001", message } });
}

/** Chỉ BE (giữ `COLLAB_SHARED_SECRET`) gọi được các đường `/internal/*`. Không cấu hình bí mật → không bao giờ tới đây (loadConfig bắt buộc ≥ 32 ký tự). */
export function requireSecret(secret: string): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    if (secretMatches(req.header(SECRET_HEADER), secret)) {
      next();
      return;
    }
    res.status(401).json({ success: false, error: { code: "AUTH_002", message: "Thiếu hoặc sai bí mật nội bộ" } });
  };
}

export function createHttpRouter(deps: HttpDeps): Router {
  const router = express.Router();
  const { config, logger } = deps;
  const guarded = requireSecret(config.sharedSecret);

  router.get("/health", (_req, res) => {
    const redis = deps.redisStatus();
    const beRecentlyFailing = deps.be.lastErrorAt !== null && (deps.be.lastOkAt === null || deps.be.lastErrorAt > deps.be.lastOkAt) && Date.now() - deps.be.lastErrorAt < 60_000;
    const status = deps.isShuttingDown() ? "shutting-down" : redis === "error" || beRecentlyFailing ? "degraded" : "ok";
    const s = stats(deps);
    res.status(status === "shutting-down" ? 503 : 200).json({
      status,
      service: "collab",
      version: config.appVersion,
      instance: config.instanceId,
      uptimeSeconds: Math.round((Date.now() - deps.startedAt) / 1000),
      kinds: [...config.kinds],
      connections: Object.values(s.connections).reduce((a, b) => a + b, 0),
      documents: Object.values(s.documents).reduce((a, b) => a + b, 0),
      pendingStates: s.pendingStates,
      redis,
      be: { lastOkAt: deps.be.lastOkAt ? new Date(deps.be.lastOkAt).toISOString() : null, lastErrorAt: deps.be.lastErrorAt ? new Date(deps.be.lastErrorAt).toISOString() : null },
    });
  });

  router.get("/metrics", (req, res) => {
    if (config.metricsToken && req.header("authorization") !== `Bearer ${config.metricsToken}`) {
      res.status(401).end();
      return;
    }
    deps.metrics.registry
      .metrics()
      .then((text) => res.type(deps.metrics.registry.contentType).send(text))
      .catch((err: unknown) => {
        logger.error("không sinh được /metrics", errorMeta(err));
        res.status(500).end();
      });
  });

  const jsonSmall = express.json({ limit: "64kb" });

  router.get("/internal/stats", guarded, (_req, res) => {
    res.json({ success: true, data: stats(deps) });
  });

  router.post("/internal/kick", guarded, jsonSmall, (req, res) => {
    const parsed = kickSchema.safeParse(req.body);
    if (!parsed.success) return bad(res, parsed.error.issues.map((i) => i.message).join("; "));
    const closed = kick(deps, parsed.data);
    logger.info("kick", { closed, reason: parsed.data.reason, docId: parsed.data.docId, workspaceId: parsed.data.workspaceId });
    res.json({ success: true, data: { closed } });
  });

  router.post("/internal/flush", guarded, jsonSmall, (req, res, next) => {
    const parsed = docRefSchema.safeParse(req.body);
    if (!parsed.success) return bad(res, parsed.error.issues.map((i) => i.message).join("; "));
    flush(deps, parsed.data.kind, parsed.data.docId)
      .then((data) => res.json({ success: true, data }))
      .catch(next);
  });

  router.post("/internal/apply", guarded, express.json({ limit: MAX_APPLY_BODY }), (req, res, next) => {
    const parsed = applySchema.safeParse(req.body);
    if (!parsed.success) return bad(res, parsed.error.issues.map((i) => i.message).join("; "));
    const update = Buffer.from(parsed.data.updateBase64, "base64");
    if (update.byteLength === 0) return bad(res, "updateBase64 rỗng hoặc không hợp lệ");
    applyUpdate(deps, parsed.data.kind, parsed.data.docId, new Uint8Array(update))
      .then((data) => res.json({ success: true, data }))
      .catch(next);
  });

  // Lỗi không lường trước (kể cả body quá lớn/JSON hỏng) → JSON chuẩn, không lộ stack.
  router.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const status = (err as { status?: number } | null)?.status;
    if (status === 413) {
      res.status(413).json({ success: false, error: { code: "VAL_001", message: "Nội dung quá lớn" } });
      return;
    }
    if (status && status >= 400 && status < 500) {
      res.status(400).json({ success: false, error: { code: "VAL_001", message: "Yêu cầu không hợp lệ" } });
      return;
    }
    logger.error("lỗi xử lý yêu cầu nội bộ", errorMeta(err));
    res.status(500).json({ success: false, error: { code: "SYS_500", message: "Lỗi hệ thống" } });
  });

  return router;
}
