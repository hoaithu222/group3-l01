import type { BadgeColor } from '@/shared/ui';

import type {
  PrintCapabilities,
  PrintOrderStatus,
  PrintPaymentMethod,
  PrintPaymentStatus,
  PrintPriceTable,
} from '../types/print.types';

/** Nhãn + màu `<Badge>` (chữ + màu — không chỉ dựa vào màu). Dùng chung cho vận hành và chủ tiệm. */
export interface StatusMeta {
  label: string;
  color: BadgeColor;
}

/** Thứ tự khai báo = thứ tự hiện ở ô lọc. Nhãn theo góc nhìn của người vận hành/chủ tiệm. */
export const PRINT_ORDER_STATUS_META: Record<PrintOrderStatus, StatusMeta> = {
  DRAFT: { label: 'Nháp', color: 'neutral' },
  QUOTED: { label: 'Đã báo giá', color: 'neutral' },
  PENDING: { label: 'Chờ tiệm nhận', color: 'warning' },
  ACCEPTED: { label: 'Đã nhận', color: 'info' },
  PRINTING: { label: 'Đang in', color: 'indigo' },
  READY: { label: 'Sẵn sàng nhận', color: 'success' },
  PICKED_UP: { label: 'Đã giao', color: 'success' },
  REJECTED: { label: 'Bị từ chối', color: 'error' },
  CANCELLED: { label: 'Đã huỷ', color: 'neutral' },
  EXPIRED: { label: 'Hết hạn', color: 'neutral' },
};

export const PRINT_ORDER_STATUSES = Object.keys(PRINT_ORDER_STATUS_META) as PrintOrderStatus[];

export const PRINT_PAYMENT_META: Record<PrintPaymentStatus, StatusMeta> = {
  UNPAID: { label: 'Chưa thu tiền', color: 'warning' },
  PAID: { label: 'Đã thu tiền', color: 'success' },
};

export const PRINT_PAYMENT_STATUSES = Object.keys(PRINT_PAYMENT_META) as PrintPaymentStatus[];

export const PRINT_PAYMENT_METHOD_LABELS: Record<PrintPaymentMethod, string> = {
  AT_COUNTER: 'Trả tại quầy',
  VIETQR: 'VietQR',
};

/**
 * Nhãn dòng thời gian: trạng thái đơn + hai nhãn sự kiện KHÔNG đổi trạng thái mà BE ghi (`SAME_STATUS_EVENT`
 * ở `print-order-transitioner.ts`). Mã lạ hiện chính mã (BE thêm nhãn mới không làm vỡ giao diện).
 */
export const PRINT_EVENT_LABELS: Record<string, string> = {
  ...Object.fromEntries(
    Object.entries(PRINT_ORDER_STATUS_META).map(([status, meta]) => [status, meta.label]),
  ),
  PIN_REGENERATED: 'Khách tạo mã PIN mới',
  PAID: 'Đã thu tiền tại quầy',
};

/** Bảng giá: đồng/trang, thứ tự hiện ở form và ở bảng chỉ đọc. */
export const PRICE_FIELDS: ReadonlyArray<{
  key: Exclude<keyof PrintPriceTable, 'duplexDiscountPct' | 'minOrder'>;
  label: string;
}> = [
  { key: 'a4Bw', label: 'A4 đen trắng' },
  { key: 'a4Color', label: 'A4 màu' },
  { key: 'a3Bw', label: 'A3 đen trắng' },
  { key: 'a3Color', label: 'A3 màu' },
];

export const CAPABILITY_LABELS: Record<keyof PrintCapabilities, string> = {
  color: 'In màu',
  duplex: 'In 2 mặt',
  a3: 'Khổ A3',
  binding: 'Đóng gáy / bấm ghim',
};

export const CAPABILITY_KEYS = Object.keys(CAPABILITY_LABELS) as Array<keyof PrintCapabilities>;
