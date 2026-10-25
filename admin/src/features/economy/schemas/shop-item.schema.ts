import { z } from 'zod';

import { formatNumber } from '@/shared/utils/format';
import { requiredText } from '@/shared/utils/validation/validators.utils';

import { CODE_PATTERN, COIN_LIMITS } from '../constants/economy.constants';
import { parseEmojis } from '../utils/shop-item-data.utils';
import { reasonField } from './adjust.schema';

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const HEX_MESSAGE = 'Màu phải dạng #RRGGBB';

/**
 * Form tạo/sửa vật phẩm — khớp `createShopItemSchema`/`updateShopItemSchema` BE: mã a-z0-9- (2–40), tên 2–60, giá 1–10 000,
 * lý do 10–500, `data` theo LOẠI (`SHOP_ITEM_DATA_SCHEMAS`: khung avatar = màu + độ dày 1–8; giao diện = hai màu; gói emoji = 1–30 emoji ≤ 16 ký tự).
 * Mọi trường `data` đều có mặt trong form (giữ giá trị khi người dùng đổi loại qua lại) và chỉ được kiểm theo loại đang chọn.
 * Khung thời gian bán là NGÀY (`DateRangeField`); ngày kết thúc được hiểu là hết ngày đó.
 */
export const shopItemFormSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(2, 'Mã tối thiểu 2 ký tự')
      .max(COIN_LIMITS.shopCodeMax, `Mã tối đa ${COIN_LIMITS.shopCodeMax} ký tự`)
      .regex(CODE_PATTERN, 'Mã chỉ gồm chữ thường, số và dấu gạch ngang'),
    name: requiredText('Tên là bắt buộc')
      .min(2, 'Tên tối thiểu 2 ký tự')
      .max(COIN_LIMITS.shopNameMax, `Tên tối đa ${COIN_LIMITS.shopNameMax} ký tự`),
    kind: z.enum(['AVATAR_FRAME', 'PROFILE_THEME', 'EMOJI_PACK']),
    price: z
      .number({ error: 'Nhập giá' })
      .int('Giá phải là số nguyên')
      .min(1, 'Giá tối thiểu 1 xu')
      .max(COIN_LIMITS.shopPriceMax, `Giá tối đa ${formatNumber(COIN_LIMITS.shopPriceMax)} xu`),
    color: z.string(),
    width: z.number().nullable(),
    primary: z.string(),
    accent: z.string(),
    emojis: z.string(),
    availableRange: z.object({ from: z.string().nullable(), to: z.string().nullable() }),
    isActive: z.boolean(),
    reason: reasonField,
  })
  .superRefine((v, ctx) => {
    const issue = (path: string, message: string) =>
      ctx.addIssue({ code: 'custom', path: [path], message });
    if (v.kind === 'AVATAR_FRAME') {
      if (!HEX_COLOR.test(v.color)) issue('color', HEX_MESSAGE);
      if (v.width === null || !Number.isInteger(v.width) || v.width < 1 || v.width > 8) {
        issue('width', 'Độ dày viền là số nguyên từ 1 đến 8');
      }
    } else if (v.kind === 'PROFILE_THEME') {
      if (!HEX_COLOR.test(v.primary)) issue('primary', HEX_MESSAGE);
      if (!HEX_COLOR.test(v.accent)) issue('accent', HEX_MESSAGE);
    } else {
      const emojis = parseEmojis(v.emojis);
      if (emojis.length === 0) issue('emojis', 'Nhập ít nhất một emoji');
      else if (emojis.length > COIN_LIMITS.emojiPackMax)
        issue('emojis', `Tối đa ${COIN_LIMITS.emojiPackMax} emoji`);
      else if (emojis.some((e) => e.length > COIN_LIMITS.emojiMaxLength)) {
        issue('emojis', `Mỗi emoji tối đa ${COIN_LIMITS.emojiMaxLength} ký tự`);
      }
    }
    const { from, to } = v.availableRange;
    if (from && to && from > to)
      issue('availableRange', 'Ngày kết thúc phải sau hoặc cùng ngày bắt đầu');
  });

export type ShopItemFormValues = z.infer<typeof shopItemFormSchema>;
