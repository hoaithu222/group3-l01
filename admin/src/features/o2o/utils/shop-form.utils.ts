import type { ShopCreateFormValues, ShopPriceFormValues } from '../schemas/shop.schema';
import type { AdminShop, CreateShopPayload, UpdateShopPayload } from '../types/o2o.types';

/**
 * Giá khởi tạo cho tiệm MỚI — chỉ là gợi ý (đồng/trang) để form có số hợp lệ; vận hành PHẢI rà lại theo thoả thuận với tiệm
 * trước khi bấm Tạo (tiệm chưa duyệt thì chưa nhận đơn, và sửa lại được ở tab "Bảng giá").
 */
export function initShopCreateValues(locationId = ''): ShopCreateFormValues {
  return {
    locationId,
    ownerEmail: '',
    displayName: '',
    phone: '',
    priceTable: {
      a4Bw: 500,
      a4Color: 2000,
      a3Bw: 1000,
      a3Color: 5000,
      duplexDiscountPct: 10,
      minOrder: 2000,
    },
    capabilities: { color: true, duplex: true, a3: false, binding: false },
  };
}

/** Form → thân `POST /admin/print-shops`. SĐT rỗng → `null` (BE `phoneSchema` không nhận chuỗi rỗng). */
export function toCreateShopPayload(values: ShopCreateFormValues): CreateShopPayload {
  return {
    locationId: values.locationId,
    ownerEmail: values.ownerEmail,
    displayName: values.displayName,
    phone: values.phone === '' ? null : values.phone,
    priceTable: values.priceTable,
    capabilities: values.capabilities,
  };
}

export function initShopPriceValues(shop: AdminShop): ShopPriceFormValues {
  return { priceTable: shop.priceTable, capabilities: shop.capabilities, reason: '' };
}

/** Form → thân `PATCH /admin/print-shops/:id` (bảng giá + năng lực + lý do + phiên bản đã đọc). */
export function toShopPriceUpdatePayload(
  shop: AdminShop,
  values: ShopPriceFormValues,
): UpdateShopPayload {
  return {
    id: shop.id,
    expectedVersion: shop.version,
    priceTable: values.priceTable,
    capabilities: values.capabilities,
    reason: values.reason,
  };
}
