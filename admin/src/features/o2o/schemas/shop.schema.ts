import { z } from 'zod';

import { formatNumber } from '@/shared/utils/format';
import {
  emailField,
  optionalPhoneField,
  requiredText,
} from '@/shared/utils/validation/validators.utils';

import { O2O_LIMITS as L } from '../constants/o2o.constants';

const wholeMoney = (label: string, max: number) =>
  z
    .number({ error: `Nhập ${label}` })
    .int(`${label[0].toUpperCase()}${label.slice(1)} phải là số nguyên`)
    .min(0, 'Không âm')
    .max(max, `Tối đa ${formatNumber(max)}`);

/** Bảng giá — khớp `priceTableSchema` BE: đồng/trang SỐ NGUYÊN ≥ 0, % giảm 2 mặt 0–100, đơn tối thiểu ≥ 0. */
const priceTableFormSchema = z.object({
  a4Bw: wholeMoney('giá A4 đen trắng', L.priceMax),
  a4Color: wholeMoney('giá A4 màu', L.priceMax),
  a3Bw: wholeMoney('giá A3 đen trắng', L.priceMax),
  a3Color: wholeMoney('giá A3 màu', L.priceMax),
  duplexDiscountPct: z
    .number({ error: 'Nhập % giảm' })
    .int('% giảm phải là số nguyên')
    .min(0, 'Không âm')
    .max(100, 'Tối đa 100%'),
  minOrder: wholeMoney('đơn tối thiểu', L.minOrderMax),
});

const capabilitiesFormSchema = z.object({
  color: z.boolean(),
  duplex: z.boolean(),
  a3: z.boolean(),
  binding: z.boolean(),
});

/**
 * Tạo tiệm — khớp `adminShopSchema` BE. Chủ tiệm tra theo email (không có tài khoản → `O2O_009`); địa điểm phải là
 * PRINT_SHOP chưa có tiệm (`O2O_013`). SĐT tuỳ chọn.
 */
export const shopCreateFormSchema = z.object({
  locationId: requiredText('Chọn địa điểm tiệm in'),
  ownerEmail: emailField('Email chủ tiệm không đúng định dạng'),
  displayName: requiredText('Tên hiển thị là bắt buộc')
    .min(L.nameMin, `Tên tối thiểu ${L.nameMin} ký tự`)
    .max(L.nameMax, `Tên tối đa ${L.nameMax} ký tự`),
  phone: optionalPhoneField(),
  priceTable: priceTableFormSchema,
  capabilities: capabilitiesFormSchema,
});

export type ShopCreateFormValues = z.infer<typeof shopCreateFormSchema>;

/**
 * Sửa bảng giá + năng lực (tab "Bảng giá" của ngăn kéo tiệm). Lý do BẮT BUỘC ở form dù BE cho để trống: đổi giá là việc
 * có hệ quả tiền, nhật ký cần biết vì sao (BE: 3–500 ký tự). Đơn ĐÃ GỬI giữ báo giá cũ (IR-15).
 */
export const shopPriceFormSchema = z.object({
  priceTable: priceTableFormSchema,
  capabilities: capabilitiesFormSchema,
  reason: requiredText('Cần ghi lý do đổi bảng giá')
    .min(L.shopReasonMin, `Lý do tối thiểu ${L.shopReasonMin} ký tự`)
    .max(L.shopReasonMax, `Lý do tối đa ${L.shopReasonMax} ký tự`),
});

export type ShopPriceFormValues = z.infer<typeof shopPriceFormSchema>;
