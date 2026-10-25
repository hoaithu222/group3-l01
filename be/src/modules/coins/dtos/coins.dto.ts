import { z } from "zod";
import { cursorQuerySchema, idParamSchema } from "../../../shared/dto/common-schemas";
import { COIN_TX_TYPES, SHOP_ITEM_KINDS } from "../entities/coins.interface";

/** `GET /me/wallet/transactions` — cursor `(at, id)` + lọc loại giao dịch. */
export const txQuerySchema = cursorQuerySchema.extend({ type: z.enum(COIN_TX_TYPES).optional() });
export type TxQueryDto = z.infer<typeof txQuerySchema>;

/** `GET /shop/items`, `GET /me/inventory` — lọc loại vật phẩm. */
export const kindQuerySchema = z.object({ kind: z.enum(SHOP_ITEM_KINDS).optional() });
export type KindQueryDto = z.infer<typeof kindQuerySchema>;

/** Params `/:id` (item, quest, inventory) — ObjectId. */
export const coinIdParamSchema = idParamSchema;
