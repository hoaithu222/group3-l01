import { createHash } from "crypto";
import type Sharp from "sharp";
import { logger } from "../../../infrastructure/logger";
import type { IPortfolioAssets } from "./portfolio.ports";

export interface PreparedImage {
  /** `img-<8 hex>.webp` — khớp regex của `GET /p/:slug/assets/:file`. */
  name: string;
  buffer: Buffer;
}

export const AVATAR_SIZE = 256;
export const COVER_WIDTH = 1200;
export const COVER_HEIGHT = 630;
/** Ảnh chụp thẳng vào HTML xem trước (data URI) nên hạ chất lượng/kích thước để phản hồi không phình. */
const PREVIEW_COVER_WIDTH = 600;
const PREVIEW_COVER_HEIGHT = 315;
const MAX_INPUT_PIXELS = 40_000_000;

/** Tên tệp theo NỘI DUNG khai báo (asset + biến thể) — cùng ảnh cùng kích thước luôn ra cùng tên nên hai lần build cùng phiên bản ghi đè lên cùng một bộ object. */
export const imageFileName = (assetId: string, variant: string): string => `img-${createHash("sha256").update(`${assetId}|${variant}`).digest("hex").slice(0, 8)}.webp`;

/** `sharp` là native dependency — nạp lười; thiếu ⇒ không có ảnh (trang vẫn dựng được). */
function loadSharp(): typeof Sharp | null {
  try {
    return require("sharp") as typeof Sharp;
  } catch (err) {
    logger.warn("[portfolio] sharp không khả dụng — trang dựng không có ảnh", { error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

export const toDataUri = (img: PreparedImage): string => `data:image/webp;base64,${img.buffer.toString("base64")}`;

/**
 * Ảnh của trang: đọc ảnh gốc (asset READY của chủ) → cắt/resize → WebP. `sharp` mặc định BỎ metadata (EXIF/GPS) — ảnh công khai không lộ vị trí chụp. Mọi lỗi (thiếu asset, ảnh
 * hỏng, quá lớn) → `null` và bỏ ảnh đó, KHÔNG làm hỏng cả build.
 */
export class PortfolioImageService {
  constructor(
    private readonly assets: IPortfolioAssets,
    private readonly sharpLoader: () => typeof Sharp | null = loadSharp
  ) {}

  avatar(assetId: string): Promise<PreparedImage | null> {
    return this.prepare(assetId, `avatar-${AVATAR_SIZE}`, AVATAR_SIZE, AVATAR_SIZE, 80);
  }

  cover(assetId: string, forPreview = false): Promise<PreparedImage | null> {
    return forPreview
      ? this.prepare(assetId, `cover-${PREVIEW_COVER_WIDTH}`, PREVIEW_COVER_WIDTH, PREVIEW_COVER_HEIGHT, 70)
      : this.prepare(assetId, `cover-${COVER_WIDTH}x${COVER_HEIGHT}`, COVER_WIDTH, COVER_HEIGHT, 78);
  }

  private async prepare(assetId: string, variant: string, width: number, height: number, quality: number): Promise<PreparedImage | null> {
    const sharp = this.sharpLoader();
    if (!sharp) return null;
    try {
      const source = await this.assets.readImage(assetId);
      if (!source) return null;
      const buffer = await sharp(source, { limitInputPixels: MAX_INPUT_PIXELS }).rotate().resize(width, height, { fit: "cover", position: "centre" }).webp({ quality }).toBuffer();
      return { name: imageFileName(assetId, variant), buffer };
    } catch (err) {
      logger.warn("[portfolio] bỏ qua ảnh không xử lý được", { assetId, error: err instanceof Error ? err.message : String(err) });
      return null;
    }
  }
}
