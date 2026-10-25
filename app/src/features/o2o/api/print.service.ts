import { apiClient } from '@/core/api/client';
import { unwrapData } from '@/core/api/unwrap';

import {
  PRINT_ORDERS_PATH,
  printOrderCancelPath,
  printOrderPath,
  printOrderPinPath,
  printOrderSubmitPath,
  printShopPath,
  printShopQuotePath,
} from './o2o.api';
import type {
  CreateOrderPayload,
  CursorMeta,
  OrderGroup,
  OrdersPage,
  OrderWithPin,
  PrintOrderView,
  PrintQuote,
  PrintSettings,
  PrintShopView,
  UpdateOrderPayload,
} from './o2o.types';

export const ORDERS_PAGE_SIZE = 20;

/**
 * Mọi lượt GHI tắt toast (`skipErrorToast`): lỗi nghiệp vụ `O2O_*` phải hiện đúng CHỖ (ô khoảng trang, tờ huỷ đơn…) bằng câu
 * `o2oErrorMessage`, mà toast tự tắt sau 4 giây nên không đủ cho thứ người dùng cần đọc lúc sửa lại.
 */
export const printService = {
  async shop(shopId: string): Promise<PrintShopView> {
    const response = await apiClient.get(printShopPath(shopId), { skipErrorToast: true });
    return unwrapData<PrintShopView>(response);
  },

  /** Báo giá thử — KHÔNG lưu. `O2O_002` (tiệm không hỗ trợ) / `O2O_012` (khoảng trang sai) hiện ngay dưới ô tương ứng. */
  async quote(shopId: string, pages: number, settings: PrintSettings): Promise<PrintQuote> {
    const response = await apiClient.post(
      printShopQuotePath(shopId),
      { pages, settings },
      { skipErrorToast: true },
    );
    return unwrapData<PrintQuote>(response);
  },

  /**
   * Tạo đơn NHÁP + xếp job đếm trang. `Idempotency-Key` bắt buộc ở BE (`idempotencyKey("print-order")`): mạng chậm bấm hai lần vẫn
   * MỘT đơn. Khoá do màn giữ (`useIdempotencyKey`) chứ không sinh ở đây — service không biết đâu là "cùng một ý định".
   */
  async create(payload: CreateOrderPayload, idempotencyKey: string): Promise<PrintOrderView> {
    const response = await apiClient.post(PRINT_ORDERS_PATH, payload, {
      headers: { 'Idempotency-Key': idempotencyKey },
      skipErrorToast: true,
    });
    return unwrapData<PrintOrderView>(response);
  },

  async update(orderId: string, payload: UpdateOrderPayload): Promise<PrintOrderView> {
    const response = await apiClient.patch(printOrderPath(orderId), payload, {
      skipErrorToast: true,
    });
    return unwrapData<PrintOrderView>(response);
  },

  async get(orderId: string): Promise<PrintOrderView> {
    const response = await apiClient.get(printOrderPath(orderId), { skipErrorToast: true });
    return unwrapData<PrintOrderView>(response);
  },

  async list(group: OrderGroup, cursor: string | undefined): Promise<OrdersPage> {
    const response = await apiClient.get<{ data: PrintOrderView[]; meta: CursorMeta }>(
      PRINT_ORDERS_PATH,
      { params: { group, cursor, limit: ORDERS_PAGE_SIZE } },
    );
    return { items: response.data.data, meta: response.data.meta };
  },

  /** ⚠️ PIN chỉ có trong phản hồi NÀY — không có endpoint nào đọc lại. Nơi gọi phải cất vào kho khoá TRƯỚC khi làm gì khác. */
  async submit(orderId: string): Promise<OrderWithPin> {
    const response = await apiClient.post(printOrderSubmitPath(orderId), undefined, {
      skipErrorToast: true,
    });
    return unwrapData<OrderWithPin>(response);
  },

  /** Tạo PIN MỚI (PIN cũ vô hiệu ngay) — dùng khi mất PIN đã lưu trên máy. */
  async regeneratePin(orderId: string): Promise<OrderWithPin> {
    const response = await apiClient.post(printOrderPinPath(orderId), undefined, {
      skipErrorToast: true,
    });
    return unwrapData<OrderWithPin>(response);
  },

  async cancel(orderId: string, reason?: string): Promise<PrintOrderView> {
    const response = await apiClient.post(printOrderCancelPath(orderId), reason ? { reason } : {}, {
      skipErrorToast: true,
    });
    return unwrapData<PrintOrderView>(response);
  },
};
