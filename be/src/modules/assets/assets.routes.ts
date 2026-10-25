import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import {
  authenticateToken,
  apiLimiter,
  validateBody,
  validateParams,
  validateQuery,
  idempotencyKey,
  uploadSingle,
} from "../../core/middlewares";
import { idParamSchema } from "../../shared/dto/common-schemas";
import {
  createAssetSchema,
  completeAssetSchema,
  assetUrlQuerySchema,
  assetDownloadQuerySchema,
  displayImageQuerySchema,
} from "./dtos";
import { AssetService } from "./services/asset.service";
import { AssetAccessService } from "./services/asset-access.service";
import { AssetProcessor } from "./services/asset-processor";
import { DisplayImageService } from "./services/display-image.service";
import { mimePolicy } from "./services/mime-policy";
import { PrismaAssetRepository, PrismaAssetLinkRepository } from "./repositories";
import { createAssetController } from "./controllers/asset.controller";
import { createDisplayImageController } from "./controllers/display-image.controller";
import { env } from "../../core/config";

const router = Router();

// ── DI wiring ─────────────────────────────────────────────────────────────────
const assetRepo = new PrismaAssetRepository();
const assetLinkRepo = new PrismaAssetLinkRepository();
const assetAccessService = new AssetAccessService(assetLinkRepo);
const assetProcessor = new AssetProcessor(assetRepo);
const assetService = new AssetService(assetRepo, assetLinkRepo, assetAccessService, assetProcessor);
const controller = createAssetController(assetService);
const displayImageController = createDisplayImageController(new DisplayImageService(assetRepo, assetLinkRepo));

/**
 * @openapi
 * /assets/{id}/image:
 *   get:
 *     summary: Ảnh hiển thị (avatar người dùng/nhóm/nhóm chat, ảnh bìa nhóm) — URL ký sẵn, KHÔNG cần Bearer
 *     description: |
 *       Client KHÔNG tự dựng URL này: dùng nguyên `avatarUrl`/`avatar`/`coverUrl`/`coverThumbUrl` trong response (dựng bởi
 *       `shared/media/display-image.ts`, hạn làm tròn theo ngày nên cache được). 302 tới URL storage TTL 3600 s.
 *       Chỉ phục vụ asset đang gắn đích USER_AVATAR | WORKSPACE_AVATAR | WORKSPACE_COVER | CONVERSATION_AVATAR.
 *     tags: [Assets]
 *     parameters:
 *       - { in: query, name: v, schema: { type: string, enum: [THUMB, ORIGINAL], default: THUMB } }
 *       - { in: query, name: e, required: true, schema: { type: integer } }
 *       - { in: query, name: s, required: true, schema: { type: string } }
 *     responses:
 *       302: { description: "Chuyển hướng tới URL ký của ảnh" }
 *       403: { description: "ASSET_009 — chữ ký sai hoặc URL đã hết hạn" }
 *       404: { description: "Ảnh không còn gắn vào avatar/ảnh bìa nào (đã đổi/gỡ) hoặc chưa sẵn sàng" }
 */
// ĐĂNG KÝ TRƯỚC `authenticateToken` (cùng lý do gateway tải Local): `<img src>`/`expo-image` không gửi Authorization.
router.get(
  "/:id/image",
  validateParams(idParamSchema),
  validateQuery(displayImageQuerySchema),
  displayImageController.image
);

// Gateway tải cục bộ — chỉ cần khi STORAGE_TYPE=local (S3/Cloudinary tự có
// signed URL riêng). ĐĂNG KÝ TRƯỚC `authenticateToken`: request này không có
// Authorization header (dùng trực tiếp làm link tải/`<img src>`), xác thực
// bằng chữ ký HMAC exp/sig thay vì Bearer token.
if (env.STORAGE_TYPE === "local") {
  router.get(
    "/:id/download",
    validateParams(idParamSchema),
    validateQuery(assetDownloadQuerySchema),
    controller.download
  );
}

router.use(authenticateToken);

/**
 * @openapi
 * /assets:
 *   post:
 *     summary: Đăng ký metadata tệp + chỉ dẫn upload (bước 1/2)
 *     tags: [Assets]
 *     security: [{ BearerAuth: [] }]
 */
router.post(
  "/",
  apiLimiter,
  idempotencyKey("asset-create", { required: true }),
  validateBody(createAssetSchema),
  controller.create
);

/** Timeout dài hơn cho route upload — 4G yếu tải 25 MiB có thể mất hơn 30s mặc định. */
function extendUploadTimeout(req: Request, _res: Response, next: NextFunction): void {
  req.setTimeout(120_000);
  next();
}

/**
 * @openapi
 * /assets/{id}/content:
 *   put:
 *     summary: Tải nội dung tệp (bước 2/2, fallback Local/Cloudinary — uploadMethod API_PUT)
 *     tags: [Assets]
 *     security: [{ BearerAuth: [] }]
 */
router.put(
  "/:id/content",
  validateParams(idParamSchema),
  extendUploadTimeout,
  uploadSingle("file", {
    allowedMimes: mimePolicy.allAllowedMimes(),
    maxSize: env.MAX_FILE_SIZE,
  }),
  controller.uploadContent
);

/**
 * @openapi
 * /assets/{id}/complete:
 *   post:
 *     summary: Chốt kích thước thật sau khi PUT trực tiếp lên storage (uploadMethod PRESIGNED_PUT)
 *     tags: [Assets]
 *     security: [{ BearerAuth: [] }]
 */
router.post(
  "/:id/complete",
  validateParams(idParamSchema),
  validateBody(completeAssetSchema),
  controller.complete
);

/**
 * @openapi
 * /assets/{id}/upload-url:
 *   post:
 *     summary: Cấp lại chỉ dẫn upload (URL cũ hết hạn hoặc cần thử lại)
 *     tags: [Assets]
 *     security: [{ BearerAuth: [] }]
 */
router.post("/:id/upload-url", validateParams(idParamSchema), controller.reissueUploadUrl);

/**
 * @openapi
 * /assets/{id}/abort:
 *   post:
 *     summary: Huỷ upload đang chờ
 *     tags: [Assets]
 *     security: [{ BearerAuth: [] }]
 */
router.post("/:id/abort", validateParams(idParamSchema), controller.abort);

/**
 * @openapi
 * /assets/{id}:
 *   get:
 *     summary: Thông tin tệp
 *     tags: [Assets]
 *     security: [{ BearerAuth: [] }]
 */
router.get("/:id", validateParams(idParamSchema), controller.getById);

/**
 * @openapi
 * /assets/{id}/url:
 *   get:
 *     summary: Đường dẫn tải tệp có chữ ký (variant ORIGINAL|THUMB|POSTER)
 *     tags: [Assets]
 *     security: [{ BearerAuth: [] }]
 */
router.get(
  "/:id/url",
  validateParams(idParamSchema),
  validateQuery(assetUrlQuerySchema),
  controller.getUrl
);

/**
 * @openapi
 * /assets/{id}:
 *   delete:
 *     summary: Xoá tệp (chỉ chủ sở hữu, chưa gắn vào nội dung khác)
 *     tags: [Assets]
 *     security: [{ BearerAuth: [] }]
 */
router.delete("/:id", validateParams(idParamSchema), controller.remove);

export default router;
