import { storage } from "../../../infrastructure/storage";
import { AppError, NotFoundError } from "../../../core/exceptions";
import { ErrorCode } from "../../../core/utils/error.codes";
import { LIMITS } from "../../../core/constants";
import { env } from "../../../core/config";
import { verifyDisplayImageSignature } from "../../../shared/media";
import type { IAssetRepository } from "../repositories/asset.repository.interface";
import type { IAssetLinkRepository } from "../repositories/asset-link.repository.interface";
import { DISPLAY_IMAGE_TARGETS, type Asset } from "../entities/asset.interface";
import type { DisplayImageQuery } from "../dtos/asset-url.dto";

const DISPLAY_TARGETS = new Set<string>(DISPLAY_IMAGE_TARGETS);

/**
 * Cache của bản chuyển hướng ngắn hơn TTL URL storage (3600 s) — bản cache của client không được trỏ tới URL đã hết hạn
 * (cùng khoảng hở 600 s với `GET /users/:id/avatar`).
 */
const CACHE_MARGIN_SECONDS = 600;

export type DisplayImageResult =
  /** S3/Cloudinary — 302 tới URL ký của storage. */
  | { kind: "redirect"; url: string; maxAgeSeconds: number }
  /**
   * Local — trả thẳng byte. Không 302 sang gateway `GET /assets/:id/download`: gateway đó `Cache-Control: no-store` nên
   * trình duyệt tải lại mọi avatar ở mỗi lần mở trang. Asset bất biến theo id ⇒ cache tới khi URL hết hạn là an toàn.
   */
  | { kind: "file"; storageKey: string; mime: string; maxAgeSeconds: number };

/**
 * `GET /assets/:id/image` — phục vụ ẢNH HIỂN THỊ bằng URL ký sẵn (không Bearer): kiểm chữ ký/hạn, asset ảnh còn READY và
 * ĐANG gắn vào một đích `DISPLAY_IMAGE_TARGETS`.
 *
 * ⛔ Không có quyền theo người xem ở đây: URL chỉ được dựng trong response đã kiểm quyền (presenter), và đích hiển thị
 * đều là ảnh không riêng tư. Asset KHÔNG gắn đích hiển thị (tệp tin nhắn, tài liệu…) → 404 dù chữ ký đúng.
 */
export class DisplayImageService {
  constructor(
    private readonly repo: Pick<IAssetRepository, "findById">,
    private readonly linkRepo: Pick<IAssetLinkRepository, "listByAsset">
  ) {}

  async resolve(assetId: string, query: DisplayImageQuery, nowMs: number = Date.now()): Promise<DisplayImageResult> {
    if (!verifyDisplayImageSignature(assetId, query.e, query.s, nowMs)) {
      throw new AppError("Liên kết ảnh đã hết hạn hoặc không hợp lệ", 403, ErrorCode.ASSET_009);
    }
    const parent = await this.repo.findById(assetId);
    // Chỉ asset GỐC kiểu ảnh được ký (thumbnail đi theo gốc); DELETED/REJECTED/đang xử lý → 404 trung tính.
    if (!parent || parent.status !== "READY" || parent.parentAssetId !== null || parent.kind !== "IMAGE") {
      throw new NotFoundError("Không tìm thấy ảnh");
    }
    const links = await this.linkRepo.listByAsset(parent.id, 20);
    if (!links.some((l) => DISPLAY_TARGETS.has(l.targetType))) throw new NotFoundError("Không tìm thấy ảnh");

    const target = query.v === "THUMB" ? await this.thumbnailOrOriginal(parent) : parent;
    // Chặn phục vụ thứ không phải ảnh dưới `Content-Type` của nó (allowlist ảnh của AVATAR không có SVG).
    if (!target.mime.startsWith("image/")) throw new NotFoundError("Không tìm thấy ảnh");

    const secondsLeft = Math.max(0, query.e - Math.floor(nowMs / 1000));
    if (env.STORAGE_TYPE === "local") {
      return { kind: "file", storageKey: target.storageKey, mime: target.mime, maxAgeSeconds: secondsLeft };
    }
    const ttl = LIMITS.upload.avatarUrlTtlSeconds;
    const url = await storage.getSignedUrl(target.storageKey, ttl);
    return { kind: "redirect", url, maxAgeSeconds: Math.min(ttl - CACHE_MARGIN_SECONDS, secondsLeft) };
  }

  /** Ảnh chưa có thumbnail (thiếu `sharp`, job chưa chạy) vẫn hiện bằng bản gốc — không để avatar trống vì thiếu bản nhỏ. */
  private async thumbnailOrOriginal(parent: Asset): Promise<Asset> {
    if (!parent.thumbnailAssetId) return parent;
    const thumb = await this.repo.findById(parent.thumbnailAssetId);
    return thumb && thumb.status === "READY" ? thumb : parent;
  }
}
