import { z } from 'zod';

import { PIN_LENGTH } from '../constants/partner.constants';

/**
 * Form giao hàng — khớp `pickupSchema` BE (`dtos/partner.dto.ts`): PIN đúng 6 chữ số (`PIN_PATTERN`), `markPaid` = đã thu tiền
 * tại quầy. Ô PIN là `MaskedField` mẫu `######` nên giá trị form chỉ chứa CHỮ SỐ (không có ký tự gạch dưới của mặt nạ).
 */
export const pickupFormSchema = z.object({
  pin: z.string().regex(new RegExp(`^\\d{${PIN_LENGTH}}$`), `Nhập đủ ${PIN_LENGTH} chữ số`),
  markPaid: z.boolean(),
});

export type PickupFormValues = z.infer<typeof pickupFormSchema>;
