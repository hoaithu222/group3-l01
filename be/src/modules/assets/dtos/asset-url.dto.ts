import { z } from "zod";
import { ASSET_VARIANTS } from "../entities/asset.interface";

/** `GET /assets/:id/url?variant&disposition` (be.md §3/§4). */
export const assetUrlQuerySchema = z.object({
  variant: z.enum(ASSET_VARIANTS).default("ORIGINAL"),
  disposition: z.enum(["inline", "attachment"]).default("inline"),
});

export type AssetUrlQuery = z.infer<typeof assetUrlQuerySchema>;

/**
 * `GET /assets/:id/image?v&e&s` — ảnh hiển thị ký sẵn (avatar/ảnh bìa, `shared/media/display-image.ts`), KHÔNG cần Bearer.
 * `v` không nằm trong chữ ký: `THUMB`/`ORIGINAL` là hai bản của CÙNG một ảnh người có URL đã được phép xem.
 */
export const displayImageQuerySchema = z.object({
  v: z.enum(["ORIGINAL", "THUMB"]).default("THUMB"),
  e: z.coerce.number().int().positive(),
  s: z.string().regex(/^[a-f0-9]{64}$/i, "Chữ ký không hợp lệ"),
});
export type DisplayImageQuery = z.infer<typeof displayImageQuerySchema>;
/** `GET /assets/:id/download?variant&exp&sig` (gateway Local — be.md §5.6). */
export const assetDownloadQuerySchema = z.object({
  variant: z.enum(ASSET_VARIANTS).default("ORIGINAL"),
  exp: z.coerce.number().int().positive(),
  sig: z.string().min(1),
});

export type AssetDownloadQuery = z.infer<typeof assetDownloadQuerySchema>;
