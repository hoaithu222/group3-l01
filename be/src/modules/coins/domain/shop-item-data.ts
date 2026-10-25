import { z } from "zod";
import { LIMITS } from "../../../core/constants/limits";
import type { ShopItemKindValue } from "../entities/coins.interface";

/**
 * Token hiển thị của vật phẩm theo LOẠI (`ShopItem.data`) — THUẦN (Zod), dùng chung DTO admin và service (kiểm lại `data` theo `kind` của vật phẩm hiện có khi sửa). Chỉ giá trị hiển thị
 * đơn giản, `.strict()` (khoá lạ bị từ chối) và mọi trường đều có trần độ dài/số lượng (kích thước tối đa cỡ vài trăm ký tự) — `data` do admin nhập nhưng đi tới MỌI người xem hồ sơ, nên không chấp nhận cấu trúc tuỳ ý (không URL, không HTML/script).
 */
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Màu phải dạng #RRGGBB");

export const SHOP_ITEM_DATA_SCHEMAS = {
  AVATAR_FRAME: z.object({ color: hexColor, width: z.number().int().min(1).max(8).default(3) }).strict(),
  PROFILE_THEME: z.object({ primary: hexColor, accent: hexColor }).strict(),
  EMOJI_PACK: z.object({ emojis: z.array(z.string().min(1).max(16)).min(1).max(LIMITS.shop.emojiPackMax) }).strict(),
} as const satisfies Record<ShopItemKindValue, z.ZodTypeAny>;

/** Kết quả kiểm `data` theo `kind`: giá trị đã chuẩn hoá (điền mặc định) hoặc danh sách lỗi (chuỗi tiếng Việt) để DTO gắn vào field `data`. */
export function checkShopItemData(kind: ShopItemKindValue, data: unknown): { ok: true; data: Record<string, unknown> } | { ok: false; errors: string[] } {
  const parsed = SHOP_ITEM_DATA_SCHEMAS[kind].safeParse(data);
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.map((i) => `${i.path.join(".") || "data"}: ${i.message}`) };
  return { ok: true, data: parsed.data as Record<string, unknown> };
}
