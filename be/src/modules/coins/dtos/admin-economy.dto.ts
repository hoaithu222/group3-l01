import { z } from "zod";
import { LIMITS } from "../../../core/constants/limits";
import { objectIdSchema, reasonSchema } from "../../../shared/dto/common-schemas";
import { checkShopItemData } from "../domain/shop-item-data";
import { COIN_QUEST_METRICS, COIN_SOURCE_TYPES, SHOP_ITEM_KINDS } from "../entities/coins.interface";

/**
 * DTO admin `/admin/economy/*` (p7-02 be.md §3/§4). Mọi thao tác GHI bắt buộc `reason` (10–500, `reasonSchema`) và được ghi audit. Trần cứng nằm trong DTO (`LIMITS.coins`/`LIMITS.shop`); trần đã bị admin
 * HẠ (registry `limits.coins`) do SERVICE kiểm thêm lúc chạy (`ICoinsConfig`) — DTO biên soạn lúc import nên không thấy giá trị runtime.
 */
export const userIdParamSchema = z.object({ userId: objectIdSchema });
export const sourceTypeParamSchema = z.object({ sourceType: z.enum(COIN_SOURCE_TYPES) });

export const overviewQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(LIMITS.coins.overviewMaxDays).default(LIMITS.coins.overviewDefaultDays),
});
export type OverviewQueryDto = z.infer<typeof overviewQuerySchema>;

/** `POST /admin/economy/users/:userId/adjust` — số nguyên ≠ 0, |amount| ≤ trần cứng `adjustMax`; không làm số dư âm do sổ cái quyết (`COIN_001`). */
export const adjustSchema = reasonSchema.extend({
  amount: z
    .number()
    .int()
    .refine((v) => v !== 0 && Math.abs(v) <= LIMITS.coins.adjustMax, `Mức điều chỉnh phải khác 0 và không quá ${String(LIMITS.coins.adjustMax)} xu`),
});
export type AdjustDto = z.infer<typeof adjustSchema>;

const isoDate = z
  .string()
  .datetime({ offset: true })
  .transform((s) => new Date(s));

const itemCode = z
  .string()
  .trim()
  .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, "Mã chỉ gồm chữ thường, số và dấu gạch ngang")
  .min(2)
  .max(LIMITS.shop.codeMax);

export const createShopItemSchema = reasonSchema
  .extend({
    code: itemCode,
    name: z.string().trim().min(2).max(LIMITS.shop.nameMax),
    kind: z.enum(SHOP_ITEM_KINDS),
    price: z.number().int().min(1).max(LIMITS.shop.priceMax),
    data: z.record(z.unknown()),
    isActive: z.boolean().default(true),
    availableFrom: isoDate.nullable().default(null),
    availableTo: isoDate.nullable().default(null),
  })
  .strict()
  .superRefine((v, ctx) => {
    const checked = checkShopItemData(v.kind, v.data);
    if (!checked.ok) for (const message of checked.errors) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["data"], message });
    if (v.availableFrom && v.availableTo && v.availableFrom >= v.availableTo) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["availableTo"], message: "Thời gian kết thúc phải sau thời gian bắt đầu" });
  });
export type CreateShopItemDto = z.infer<typeof createShopItemSchema>;

/** Sửa vật phẩm: KHÔNG đổi `code`/`kind` (kho đồ đã sao chép `kind`; mã dùng để nhận diện). `data` được kiểm lại theo `kind` HIỆN CÓ trong service. */
export const updateShopItemSchema = reasonSchema
  .extend({
    expectedVersion: z.number().int().min(0),
    name: z.string().trim().min(2).max(LIMITS.shop.nameMax).optional(),
    price: z.number().int().min(1).max(LIMITS.shop.priceMax).optional(),
    data: z.record(z.unknown()).optional(),
    isActive: z.boolean().optional(),
    availableFrom: isoDate.nullable().optional(),
    availableTo: isoDate.nullable().optional(),
  })
  .strict();
export type UpdateShopItemDto = z.infer<typeof updateShopItemSchema>;

export const shopItemsQuerySchema = z.object({ kind: z.enum(SHOP_ITEM_KINDS).optional() });

/** `PUT /admin/economy/rules/:sourceType` — tạo (chưa có luật; `expectedVersion` 0) hoặc sửa (CAS theo `version`). Trần ngày của luật không vượt trần chung. */
export const putRuleSchema = reasonSchema
  .extend({
    coins: z.number().int().min(1).max(LIMITS.coins.ruleCoinsMax),
    dailyCap: z.number().int().min(1).max(LIMITS.coins.dailyEarnCap).nullable(),
    isActive: z.boolean(),
    expectedVersion: z.number().int().min(0).default(0),
  })
  .strict();
export type PutRuleDto = z.infer<typeof putRuleSchema>;

const questCode = z
  .string()
  .trim()
  .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, "Mã chỉ gồm chữ thường, số và dấu gạch ngang")
  .min(2)
  .max(LIMITS.shop.codeMax);

export const createQuestSchema = reasonSchema
  .extend({
    code: questCode,
    title: z.string().trim().min(2).max(LIMITS.coins.questTitleMax),
    description: z.string().trim().min(2).max(LIMITS.coins.questDescriptionMax),
    metric: z.enum(COIN_QUEST_METRICS),
    target: z.number().int().min(1).max(LIMITS.coins.questTargetMax),
    coins: z.number().int().min(1).max(LIMITS.coins.questCoinsMax),
    isActive: z.boolean().default(true),
    order: z.number().int().min(0).max(1000).default(0),
  })
  .strict();
export type CreateQuestDto = z.infer<typeof createQuestSchema>;

/** Sửa nhiệm vụ: không đổi `code`. Đổi `metric`/`target` chỉ tác dụng từ ngày sau cho tiến độ chưa nhận (không hồi tố phần đã nhận). */
export const updateQuestSchema = reasonSchema
  .extend({
    expectedVersion: z.number().int().min(0),
    title: z.string().trim().min(2).max(LIMITS.coins.questTitleMax).optional(),
    description: z.string().trim().min(2).max(LIMITS.coins.questDescriptionMax).optional(),
    metric: z.enum(COIN_QUEST_METRICS).optional(),
    target: z.number().int().min(1).max(LIMITS.coins.questTargetMax).optional(),
    coins: z.number().int().min(1).max(LIMITS.coins.questCoinsMax).optional(),
    isActive: z.boolean().optional(),
    order: z.number().int().min(0).max(1000).optional(),
  })
  .strict();
export type UpdateQuestDto = z.infer<typeof updateQuestSchema>;
